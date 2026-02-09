/**
 * AnthropicAdapter — Handles the Anthropic Messages API format.
 * 
 * Used by: Claude models, MiniMax free tier, Z.AI Coding Plan GLM models.
 * 
 * Format: POST /messages
 * Tools: { name, description, input_schema }
 * Messages: system is top-level param, tool results are user messages
 *           with content: [{ type: "tool_result", ... }]
 */

import { BaseProvider, capMaxTokens, type ProviderResponse } from '../BaseProvider'
import type {
  CompletionRequest,
  StreamDelta,
  UniversalMessage,
  UniversalToolDefinition,
  ApiError,
} from '../../types'
import { parseApiErrorCommon } from './OpenAIChatAdapter'

export class AnthropicAdapter extends BaseProvider {

  formatTools(tools: UniversalToolDefinition[]): any[] {
    return tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }))
  }

  buildRequestBody(request: CompletionRequest): any {
    const { messages: formattedMsgs, systemParam } = this.formatMessages(
      request.messages,
      request.systemPrompt
    )

    const body: any = {
      model: request.model.apiModelId || request.model.id,
      messages: formattedMsgs,
      stream: request.stream,
      max_tokens: request.maxTokens || request.model.maxTokens || 4096,
    }

    if (systemParam) {
      body.system = systemParam
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.formatTools(request.tools)
    }

    // Cap max_tokens so input + output fits within the context window
    if (body.max_tokens) {
      const serialized = JSON.stringify(formattedMsgs) + JSON.stringify(body.tools || [])
        + (body.system || '')
      body.max_tokens = capMaxTokens(body.max_tokens, request.model.contextWindow, serialized)
    }

    return body
  }

  buildHeaders(request: CompletionRequest): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': request.provider.apiKey,
      'anthropic-version': '2023-06-01',
    }
    // Security: Safely merge extra headers to prevent prototype pollution
    if (request.provider.extraHeaders) {
      for (const [key, value] of Object.entries(request.provider.extraHeaders)) {
        // Block prototype pollution keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue
        }
        if (typeof value === 'string') {
          headers[key] = value
        }
      }
    }
    if (request.model.extraHeaders) {
      for (const [key, value] of Object.entries(request.model.extraHeaders)) {
        // Block prototype pollution keys
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
          continue
        }
        if (typeof value === 'string') {
          headers[key] = value
        }
      }
    }
    return headers
  }

  buildUrl(request: CompletionRequest): string {
    const baseUrl = request.model.baseUrl || request.provider.baseUrl
    return `${baseUrl}/messages`
  }

  parseStreamEvent(json: any): StreamDelta | null {
    // Anthropic SSE event types:
    // - message_start: metadata
    // - content_block_start: new content block (text or tool_use)
    // - content_block_delta: incremental content
    // - content_block_stop: block complete
    // - message_delta: stop_reason
    // - message_stop: done
    // - ping: keepalive

    // Text delta
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      return { content: json.delta.text }
    }

    // Thinking/reasoning delta (Claude extended thinking)
    if (json.type === 'content_block_delta' && json.delta?.type === 'thinking_delta') {
      return { reasoningContent: json.delta.thinking }
    }

    // Tool use block start
    if (json.type === 'content_block_start' && json.content_block?.type === 'tool_use') {
      return {
        toolCalls: [{
          index: json.index ?? 0,
          id: json.content_block.id,
          name: json.content_block.name,
          arguments: '',
        }],
      }
    }

    // Tool use input delta (JSON arguments streaming)
    if (json.type === 'content_block_delta' && json.delta?.type === 'input_json_delta') {
      return {
        toolCalls: [{
          index: json.index ?? 0,
          arguments: json.delta.partial_json || '',
        }],
      }
    }

    // Message delta with stop_reason (also carries output token usage)
    if (json.type === 'message_delta' && json.delta?.stop_reason) {
      const reason = json.delta.stop_reason
      const delta: StreamDelta = {
        finishReason: reason === 'tool_use' ? 'tool_calls'
          : reason === 'end_turn' ? 'stop'
          : reason as StreamDelta['finishReason'],
      }
      // Anthropic sends output_tokens in the message_delta usage
      if (json.usage?.output_tokens) {
        delta.usage = {
          promptTokens: 0, // sent in message_start, accumulated by StreamProcessor
          completionTokens: json.usage.output_tokens,
          totalTokens: json.usage.output_tokens,
        }
      }
      return delta
    }

    // message_start carries input token count
    if (json.type === 'message_start' && json.message?.usage) {
      return {
        usage: {
          promptTokens: json.message.usage.input_tokens || 0,
          completionTokens: json.message.usage.output_tokens || 0,
          totalTokens: (json.message.usage.input_tokens || 0) + (json.message.usage.output_tokens || 0),
        },
      }
    }

    // Everything else is metadata — skip
    return null
  }

  parseResponse(json: any): ProviderResponse {
    let content = ''
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = []

    if (json.content && Array.isArray(json.content)) {
      for (const block of json.content) {
        if (block.type === 'text') {
          content += block.text
        } else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          })
        }
      }
    }

    const stopReason = json.stop_reason
    const finishReason = stopReason === 'tool_use' ? 'tool_calls'
      : stopReason === 'end_turn' ? 'stop'
      : (stopReason || 'stop') as ProviderResponse['finishReason']

    const response: ProviderResponse = {
      content,
      finishReason,
    }

    if (toolCalls.length > 0) {
      response.toolCalls = toolCalls
    }

    if (json.usage) {
      response.usage = {
        promptTokens: json.usage.input_tokens || 0,
        completionTokens: json.usage.output_tokens || 0,
        totalTokens: (json.usage.input_tokens || 0) + (json.usage.output_tokens || 0),
      }
    }

    return response
  }

  parseError(status: number, body: string): ApiError {
    const base = parseApiErrorCommon(status, body)
    // Anthropic-specific error enrichment
    if (base.type === 'auth') {
      base.details = 'Check your API key. Anthropic keys use the x-api-key header.'
    }
    return base
  }

  formatMessages(
    messages: UniversalMessage[],
    systemPrompt?: string
  ): { messages: any[]; systemParam?: string } {
    const formatted: any[] = []

    for (const m of messages) {
      if (m.role === 'system') continue // System handled as top-level param

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        // Assistant with tool_use blocks
        const content: any[] = []
        if (m.content) {
          content.push({ type: 'text', text: m.content })
        }
        for (const tc of m.toolCalls) {
          let parsedInput: any = {}
          try {
            parsedInput = typeof tc.arguments === 'string'
              ? JSON.parse(tc.arguments)
              : tc.arguments
          } catch {}
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: parsedInput,
          })
        }
        formatted.push({ role: 'assistant', content })
      } else if (m.role === 'tool') {
        // Tool results go as user messages with tool_result content blocks
        // Anthropic requires tool results to be in a user message
        formatted.push({
          role: 'user',
          content: [{
            type: 'tool_result',
            tool_use_id: m.toolCallId,
            content: m.content,
          }],
        })
      } else {
        formatted.push({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })
      }
    }

    // Ensure messages alternate user/assistant (Anthropic requirement)
    // Merge consecutive same-role messages if needed
    const merged = this.mergeConsecutiveRoles(formatted)

    return {
      messages: merged,
      systemParam: systemPrompt || undefined,
    }
  }

  /**
   * Anthropic requires strictly alternating user/assistant messages.
   * Merge consecutive same-role messages when necessary.
   */
  private mergeConsecutiveRoles(messages: any[]): any[] {
    if (messages.length <= 1) return messages

    const result: any[] = [messages[0]]

    for (let i = 1; i < messages.length; i++) {
      const prev = result[result.length - 1]
      const curr = messages[i]

      if (prev.role === curr.role) {
        // Merge content
        const prevContent = Array.isArray(prev.content)
          ? prev.content
          : [{ type: 'text', text: prev.content }]
        const currContent = Array.isArray(curr.content)
          ? curr.content
          : [{ type: 'text', text: curr.content }]

        result[result.length - 1] = {
          role: prev.role,
          content: [...prevContent, ...currContent],
        }
      } else {
        result.push(curr)
      }
    }

    return result
  }
}
