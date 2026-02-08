/**
 * AgentLoop — The autonomous agentic system.
 * 
 * This is the heart of the IDE's AI capabilities. It:
 * 1. Accepts a user task
 * 2. Sends it to the LLM with available tools
 * 3. Automatically executes any tool calls
 * 4. Feeds results back to the model
 * 5. Repeats until the model responds without tool calls
 * 6. Streams all activity to the UI in real-time
 * 
 * CRITICAL: This module is 100% provider-agnostic. It uses only:
 * - UniversalMessage format for conversation
 * - BaseProvider interface for API communication
 * - ToolExecutor for running tools
 * - ConversationManager for history
 * 
 * All provider differences are hidden behind the adapter layer.
 */

import type {
  AgentRequest,
  AgentResponse,
  AgentEvent,
  UniversalMessage,
  UniversalToolDefinition,
  ToolCall,
  ToolResult,
  CompletionRequest,
  StreamDelta,
  ApiError,
} from '../types'
import { ProviderFactory } from '../providers/ProviderFactory'
import type { BaseProvider } from '../providers/BaseProvider'
import { ConversationManager } from '../conversation/ConversationManager'
import { toolRegistry } from '../tools/ToolRegistry'
import { toolExecutor } from '../tools/ToolExecutor'
import { StreamProcessor } from './StreamParser'
import { mcpClientManager } from '../../services/mcpClient'

// ─── Types ───────────────────────────────────────────────────────────────────

type EventCallback = (event: AgentEvent) => void

/** Callback that asks the UI for approval before executing a file-modifying tool.
 *  Returns true if approved, false if rejected. */
export type ToolApprovalCallback = (toolCall: ToolCall) => Promise<boolean>

const FILE_MODIFYING_TOOLS = new Set([
  'write_file', 'str_replace', 'delete_file', 'move_file', 'create_directory',
])

interface HttpResponse {
  ok: boolean
  status: number
  data: string
  headers?: Record<string, string>
}

type HttpStreamCallback = (data: { type: 'chunk' | 'done' | 'error'; data?: string; status?: number }) => void

interface HttpAdapter {
  /** Make a non-streaming HTTP request */
  request(url: string, method: string, headers: Record<string, string>, body?: string): Promise<HttpResponse>
  /** Start a streaming HTTP request. Calls back with chunks. Returns cleanup function. */
  streamRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    onData: HttpStreamCallback
  ): Promise<{ ok: boolean; status: number; cancel: () => void }>
}

// ─── Agent Loop ──────────────────────────────────────────────────────────────

export class AgentLoop {
  private httpAdapter: HttpAdapter
  private eventSeq: number = 0
  private aborted: boolean = false

  constructor(httpAdapter: HttpAdapter) {
    this.httpAdapter = httpAdapter
  }

  /**
   * Run the autonomous agent loop.
   * 
   * Streams AgentEvents to the callback in real-time for UI rendering.
   * Returns the final AgentResponse when complete.
   */
  async run(request: AgentRequest, onEvent: EventCallback, approvalCallback?: ToolApprovalCallback): Promise<AgentResponse> {
    this.eventSeq = 0
    this.aborted = false

    const maxIterations = request.maxIterations ?? 50

    const projectPath = request.projectPath

    // Get the correct provider adapter (completely transparent)
    const adapter = ProviderFactory.getAdapter(request.model, request.provider)

    // Resolve tools based on agent mode
    const builtinTools = request.toolNames
      ? toolRegistry.getByNames(request.toolNames)
      : toolRegistry.getToolsForMode(request.agentMode || 'builder')

    // Merge MCP tools from connected servers
    const mcpTools: UniversalToolDefinition[] = mcpClientManager.getAllTools().map(t => ({
      name: t.name,
      description: `[MCP] ${t.description}`,
      parameters: t.inputSchema as any,
    }))
    const tools = [...builtinTools, ...mcpTools]

    // Initialize conversation
    const conversation = new ConversationManager(request.conversationHistory)
    if (request.model.contextWindow) {
      conversation.setMaxContextTokens(request.model.contextWindow)
    }

    // Add user message
    let userContent = request.userMessage
    if (request.fileContext) {
      userContent += '\n\n' + request.fileContext
    }
    conversation.addUserMessage(userContent)

    // Emit initial thinking event
    this.emit(onEvent, 'thinking', { message: 'Analyzing request and planning approach...' })

    // ─── Main Agent Loop ───────────────────────────────────────────────
    let iteration = 0
    let totalContent = ''
    const allToolResults: ToolResult[] = []

    while (iteration < maxIterations && !this.aborted) {
      iteration++
      this.emit(onEvent, 'iteration_start', { iteration, maxIterations })

      // Build the completion request (provider-agnostic)
      const completionRequest: CompletionRequest = {
        model: request.model,
        provider: request.provider,
        messages: conversation.getMessages(),
        systemPrompt: request.systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
        stream: true,
      }

      // Stream the LLM response
      let streamResult: {
        content: string
        reasoningContent: string
        toolCalls: ToolCall[]
        finishReason: StreamDelta['finishReason']
        error?: ApiError
      }

      try {
        streamResult = await this.streamCompletion(
          completionRequest,
          adapter,
          onEvent
        )
      } catch (err: any) {
        const errorMsg = err.message || 'Unknown streaming error'
        this.emit(onEvent, 'agent_error', { error: errorMsg, iteration })
        return this.buildResponse(totalContent, allToolResults, iteration, conversation, false, errorMsg)
      }

      // Handle abort
      if (this.aborted) {
        this.emit(onEvent, 'agent_aborted', { iteration, content: totalContent })
        return this.buildResponse(totalContent, allToolResults, iteration, conversation, true)
      }

      // Handle stream error
      if (streamResult.error) {
        const errorMsg = `[${streamResult.error.type.toUpperCase()}] ${streamResult.error.message}${streamResult.error.details ? '\n' + streamResult.error.details : ''}`
        this.emit(onEvent, 'agent_error', { error: errorMsg, iteration })
        return this.buildResponse(totalContent + errorMsg, allToolResults, iteration, conversation, false, errorMsg)
      }

      totalContent += streamResult.content

      // ─── Handle Tool Calls ───────────────────────────────────────────
      if (streamResult.finishReason === 'tool_calls' && streamResult.toolCalls.length > 0) {
        // Add assistant message with tool calls to conversation
        conversation.addAssistantToolCallMessage(
          streamResult.content,
          streamResult.toolCalls
        )

        // Execute each tool call
        for (const tc of streamResult.toolCalls) {
          this.emit(onEvent, 'tool_call_start', {
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })

          // Check approval for file-modifying tools
          if (approvalCallback && FILE_MODIFYING_TOOLS.has(tc.name)) {
            const approved = await approvalCallback(tc)
            if (!approved) {
              const skippedResult: ToolResult = {
                toolCallId: tc.id,
                toolName: tc.name,
                success: false,
                output: `User declined this ${tc.name} operation.`,
                durationMs: 0,
              }
              allToolResults.push(skippedResult)
              this.emit(onEvent, 'tool_result', {
                id: tc.id,
                name: tc.name,
                success: false,
                output: 'User declined this operation.',
                durationMs: 0,
              })
              conversation.addToolResult(skippedResult)
              continue
            }
          }

          const result = await toolExecutor.execute(tc, projectPath)
          allToolResults.push(result)

          this.emit(onEvent, 'tool_result', {
            id: result.toolCallId,
            name: result.toolName,
            success: result.success,
            output: result.output.slice(0, 5000),
            durationMs: result.durationMs,
          })

          // Add tool result to conversation
          conversation.addToolResult(result)
        }

        this.emit(onEvent, 'iteration_complete', {
          iteration,
          toolCallCount: streamResult.toolCalls.length,
          continuing: true,
        })

        // Continue the loop — model will see tool results and decide next action
        continue
      }

      // ─── No Tool Calls — Agent is Done ───────────────────────────────
      if (streamResult.content) {
        conversation.addAssistantMessage(streamResult.content)
      }

      this.emit(onEvent, 'iteration_complete', {
        iteration,
        toolCallCount: 0,
        continuing: false,
      })

      break
    }

    // ─── Safety: Max iterations reached ──────────────────────────────────
    if (iteration >= maxIterations && !this.aborted) {
      const warning = `\n\n[Agent reached maximum iteration limit (${maxIterations}). Stopping.]`
      totalContent += warning
      this.emit(onEvent, 'agent_error', {
        error: `Max iterations (${maxIterations}) reached`,
        iteration,
      })
    }

    // ─── Final Response ──────────────────────────────────────────────────
    this.emit(onEvent, 'agent_complete', {
      iterations: iteration,
      toolCallsExecuted: allToolResults.length,
      contentLength: totalContent.length,
    })

    return this.buildResponse(totalContent, allToolResults, iteration, conversation, false)
  }

  /**
   * Abort the current agent run.
   */
  abort(): void {
    this.aborted = true
  }

  /**
   * Check if the agent has been aborted.
   */
  isAborted(): boolean {
    return this.aborted
  }

  // ─── Private: Stream a single LLM completion ────────────────────────────

  private async streamCompletion(
    request: CompletionRequest,
    adapter: BaseProvider,
    onEvent: EventCallback
  ): Promise<{
    content: string
    reasoningContent: string
    toolCalls: ToolCall[]
    finishReason: StreamDelta['finishReason']
    error?: ApiError
  }> {
    // Build provider-specific request (adapter handles all conversion)
    const url = adapter.buildUrl(request)
    const headers = adapter.buildHeaders(request)
    const body = adapter.buildRequestBody(request)

    // Create stream processor with the correct adapter for normalization
    const processor = new StreamProcessor(adapter)

    return new Promise((resolve) => {
      let resolved = false
      const finish = () => {
        if (resolved) return
        resolved = true
        const result = processor.finish()
        resolve({
          content: result.content,
          reasoningContent: result.reasoningContent,
          toolCalls: result.toolCalls,
          finishReason: result.finishReason,
        })
      }

      this.httpAdapter.streamRequest(
        url,
        'POST',
        headers,
        JSON.stringify(body),
        (data) => {
          if (this.aborted) {
            finish()
            return
          }

          if (data.type === 'done') {
            finish()
          } else if (data.type === 'error') {
            if (resolved) return
            resolved = true
            const error = adapter.parseError(data.status || 500, data.data || 'Unknown error')
            resolve({
              content: processor.getCurrentContent(),
              reasoningContent: processor.getCurrentReasoningContent(),
              toolCalls: [],
              finishReason: null,
              error,
            })
          } else if (data.type === 'chunk' && data.data) {
            const deltas = processor.processChunk(data.data)

            for (const delta of deltas) {
              if (delta.content) {
                this.emit(onEvent, 'text_delta', { content: delta.content })
              }
              if (delta.reasoningContent) {
                this.emit(onEvent, 'reasoning_delta', { content: delta.reasoningContent })
              }
              if (delta.toolCalls) {
                for (const tc of delta.toolCalls) {
                  if (tc.id && tc.name) {
                    this.emit(onEvent, 'tool_call_start', {
                      index: tc.index,
                      id: tc.id,
                      name: tc.name,
                    })
                  } else if (tc.arguments) {
                    this.emit(onEvent, 'tool_call_delta', {
                      index: tc.index,
                      arguments: tc.arguments,
                    })
                  }
                }
              }
            }
          }
        }
      ).then(({ ok, status }) => {
        if (!ok && !resolved) {
          resolved = true
          const error = adapter.parseError(status, 'Stream request failed')
          resolve({
            content: '',
            reasoningContent: '',
            toolCalls: [],
            finishReason: null,
            error,
          })
        }
      }).catch((err: any) => {
        if (!resolved) {
          resolved = true
          resolve({
            content: processor.getCurrentContent(),
            reasoningContent: processor.getCurrentReasoningContent(),
            toolCalls: [],
            finishReason: null,
            error: {
              type: 'network' as const,
              message: err.message || 'Network error',
              details: 'Failed to connect.',
            },
          })
        }
      })
    })
  }

  // ─── Private: Emit an event to the UI ──────────────────────────────────

  private emit(callback: EventCallback, type: AgentEvent['type'], data: Record<string, any>): void {
    callback({
      type,
      seq: this.eventSeq++,
      timestamp: Date.now(),
      data,
    })
  }

  // ─── Private: Build final response ─────────────────────────────────────

  private buildResponse(
    content: string,
    toolResults: ToolResult[],
    iterations: number,
    conversation: ConversationManager,
    aborted: boolean,
    error?: string
  ): AgentResponse {
    return {
      content,
      toolCallsExecuted: toolResults,
      iterations,
      conversationHistory: conversation.getMessages(),
      aborted,
      error,
    }
  }
}
