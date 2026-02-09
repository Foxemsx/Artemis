
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


type EventCallback = (event: AgentEvent) => void

export type ToolApprovalCallback = (toolCall: ToolCall) => Promise<boolean>

export type PathApprovalCallback = (filePath: string, reason: string) => Promise<boolean>

const FILE_MODIFYING_TOOLS = new Set([
  'write_file', 'str_replace', 'delete_file', 'move_file', 'create_directory',
  'execute_command',
])

interface HttpResponse {
  ok: boolean
  status: number
  data: string
  headers?: Record<string, string>
}

type HttpStreamCallback = (data: { type: 'chunk' | 'done' | 'error'; data?: string; status?: number }) => void

interface HttpAdapter {
  request(url: string, method: string, headers: Record<string, string>, body?: string): Promise<HttpResponse>
  streamRequest(
    url: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    onData: HttpStreamCallback
  ): Promise<{ ok: boolean; status: number; cancel: () => void }>
}


export class AgentLoop {
  private httpAdapter: HttpAdapter
  private eventSeq: number = 0
  private aborted: boolean = false

  constructor(httpAdapter: HttpAdapter) {
    this.httpAdapter = httpAdapter
  }

  async run(request: AgentRequest, onEvent: EventCallback, approvalCallback?: ToolApprovalCallback, pathApprovalCallback?: PathApprovalCallback): Promise<AgentResponse> {
    this.eventSeq = 0
    this.aborted = false

    const maxIterations = request.maxIterations ?? 50

    const projectPath = request.projectPath

    const adapter = ProviderFactory.getAdapter(request.model, request.provider)

    const builtinTools = request.toolNames
      ? toolRegistry.getByNames(request.toolNames)
      : toolRegistry.getToolsForMode(request.agentMode || 'builder')

    const mcpTools: UniversalToolDefinition[] = mcpClientManager.getAllTools().map(t => ({
      name: t.name,
      description: `[MCP] ${t.description}`,
      parameters: t.inputSchema as any,
    }))
    const tools = [...builtinTools, ...mcpTools]

    const conversation = new ConversationManager(request.conversationHistory)
    if (request.model.contextWindow) {
      conversation.setMaxContextTokens(request.model.contextWindow)
    }

    let userContent = request.userMessage
    if (request.fileContext) {
      userContent += '\n\n' + request.fileContext
    }
    conversation.addUserMessage(userContent)

    this.emit(onEvent, 'thinking', { message: 'Analyzing request and planning approach...' })

    let iteration = 0
    let totalContent = ''
    const allToolResults: ToolResult[] = []
    let totalUsage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

    while (iteration < maxIterations && !this.aborted) {
      iteration++
      this.emit(onEvent, 'iteration_start', { iteration, maxIterations })

      const supportsTools = request.model.supportsTools !== false
      const completionRequest: CompletionRequest = {
        model: request.model,
        provider: request.provider,
        messages: conversation.getMessages(),
        systemPrompt: request.systemPrompt,
        tools: supportsTools && tools.length > 0 ? tools : undefined,
        stream: true,
      }

      let streamResult: {
        content: string
        reasoningContent: string
        toolCalls: ToolCall[]
        finishReason: StreamDelta['finishReason']
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
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

      if (this.aborted) {
        this.emit(onEvent, 'agent_aborted', { iteration, content: totalContent })
        return this.buildResponse(totalContent, allToolResults, iteration, conversation, true)
      }

      if (streamResult.error) {
        const errorMsg = `[${streamResult.error.type.toUpperCase()}] ${streamResult.error.message}${streamResult.error.details ? '\n' + streamResult.error.details : ''}`
        this.emit(onEvent, 'agent_error', { error: errorMsg, iteration })
        return this.buildResponse(totalContent + errorMsg, allToolResults, iteration, conversation, false, errorMsg)
      }

      totalContent += streamResult.content

      if (streamResult.usage) {
        if (!totalUsage) {
          totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        }
        totalUsage.promptTokens += streamResult.usage.promptTokens
        totalUsage.completionTokens += streamResult.usage.completionTokens
        totalUsage.totalTokens += streamResult.usage.totalTokens
      }

      if (streamResult.finishReason === 'tool_calls' && streamResult.toolCalls.length > 0) {
        conversation.addAssistantToolCallMessage(
          streamResult.content,
          streamResult.toolCalls
        )

        for (const tc of streamResult.toolCalls) {
          this.emit(onEvent, 'tool_call_start', {
            id: tc.id,
            name: tc.name,
            arguments: tc.arguments,
          })

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

          const result = await toolExecutor.execute(tc, projectPath, pathApprovalCallback)
          allToolResults.push(result)

          this.emit(onEvent, 'tool_result', {
            id: result.toolCallId,
            name: result.toolName,
            success: result.success,
            output: result.output.slice(0, 5000),
            durationMs: result.durationMs,
          })

          conversation.addToolResult(result)
        }

        this.emit(onEvent, 'iteration_complete', {
          iteration,
          toolCallCount: streamResult.toolCalls.length,
          continuing: true,
        })

        continue
      }

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

    if (iteration >= maxIterations && !this.aborted) {
      const warning = `\n\n[Agent reached maximum iteration limit (${maxIterations}). Stopping.]`
      totalContent += warning
      this.emit(onEvent, 'agent_error', {
        error: `Max iterations (${maxIterations}) reached`,
        iteration,
      })
    }

    this.emit(onEvent, 'agent_complete', {
      iterations: iteration,
      toolCallsExecuted: allToolResults.length,
      contentLength: totalContent.length,
      usage: totalUsage,
    })

    return this.buildResponse(totalContent, allToolResults, iteration, conversation, false)
  }

  abort(): void {
    this.aborted = true
  }

  isAborted(): boolean {
    return this.aborted
  }


  private async streamCompletion(
    request: CompletionRequest,
    adapter: BaseProvider,
    onEvent: EventCallback
  ): Promise<{
    content: string
    reasoningContent: string
    toolCalls: ToolCall[]
    finishReason: StreamDelta['finishReason']
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    error?: ApiError
  }> {
    const url = adapter.buildUrl(request)
    const headers = adapter.buildHeaders(request)
    const body = adapter.buildRequestBody(request)

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
          usage: result.usage,
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


  private emit(callback: EventCallback, type: AgentEvent['type'], data: Record<string, any>): void {
    callback({
      type,
      seq: this.eventSeq++,
      timestamp: Date.now(),
      data,
    })
  }


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
