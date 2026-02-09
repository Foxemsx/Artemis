/**
 * OpenAIResponsesAdapter — Handles the OpenAI Responses API format.
 * 
 * Used by: GPT models via the /responses endpoint.
 * 
 * Format: POST /responses
 * Tools: { type: "function", name, description, parameters }
 * Messages: uses "input" array with function_call / function_call_output items
 * System: uses "instructions" top-level param
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

export class OpenAIResponsesAdapter extends BaseProvider {

  formatTools(tools: UniversalToolDefinition[]): any[] {
    return tools.map(t => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  }

  buildRequestBody(request: CompletionRequest): any {
    const { messages: input } = this.formatMessages(
      request.messages,
      request.systemPrompt
    )

    const body: any = {
      model: request.model.apiModelId || request.model.id,
      input,
      stream: request.stream,
      store: false,
    }

    if (request.systemPrompt) {
      body.instructions = request.systemPrompt
    }

    if (request.maxTokens || request.model.maxTokens) {
      body.max_output_tokens = request.maxTokens || request.model.maxTokens
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.formatTools(request.tools)
    }

    // Cap max_output_tokens so input + output fits within the context window
    if (body.max_output_tokens) {
      const serialized = JSON.stringify(input) + JSON.stringify(body.tools || [])
        + (body.instructions || '')
      body.max_output_tokens = capMaxTokens(body.max_output_tokens, request.model.contextWindow, serialized)
    }

    return body
  }

  buildHeaders(request: CompletionRequest): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${request.provider.apiKey}`,
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
    return `${baseUrl}/responses`
  }

  parseStreamEvent(json: any): StreamDelta | null {
    // Responses API SSE event types:
    // - response.output_text.delta: text chunk
    // - response.output_item.added: new item (function_call, message, etc.)
    // - response.function_call_arguments.delta: function call args streaming
    // - response.function_call_arguments.done: function call complete
    // - response.completed / response.done: response finished

    // Text delta
    if (json.type === 'response.output_text.delta' && json.delta !== undefined) {
      return { content: json.delta }
    }

    // Function call start
    if (json.type === 'response.output_item.added' && json.item?.type === 'function_call') {
      return {
        toolCalls: [{
          index: json.output_index ?? 0,
          id: json.item.call_id || json.item.id,
          name: json.item.name,
          arguments: '',
        }],
      }
    }

    // Function call arguments delta
    if (json.type === 'response.function_call_arguments.delta') {
      return {
        toolCalls: [{
          index: json.output_index ?? 0,
          arguments: json.delta || '',
        }],
      }
    }

    // Response completed
    if (json.type === 'response.completed' || json.type === 'response.done') {
      const output = json.response?.output || []
      const hasFunctionCalls = output.some((o: any) => o.type === 'function_call')
      return {
        finishReason: hasFunctionCalls ? 'tool_calls' : 'stop',
      }
    }

    // Skip all other response.* events
    return null
  }

  parseResponse(json: any): ProviderResponse {
    let content = ''
    const toolCalls: Array<{ id: string; name: string; arguments: string }> = []

    const output = json.output || []
    for (const item of output) {
      if (item.type === 'message') {
        for (const block of (item.content || [])) {
          if (block.type === 'output_text') {
            content += block.text || ''
          }
        }
      } else if (item.type === 'function_call') {
        toolCalls.push({
          id: item.call_id || item.id,
          name: item.name,
          arguments: item.arguments || '{}',
        })
      }
    }

    const finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop'

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
        totalTokens: json.usage.total_tokens ||
          ((json.usage.input_tokens || 0) + (json.usage.output_tokens || 0)),
      }
    }

    return response
  }

  parseError(status: number, body: string): ApiError {
    return parseApiErrorCommon(status, body)
  }

  formatMessages(
    messages: UniversalMessage[],
    _systemPrompt?: string
  ): { messages: any[] } {
    // Responses API uses "input" array instead of "messages"
    // System prompt is handled as top-level "instructions"
    const input: any[] = []

    for (const m of messages) {
      if (m.role === 'system') continue // Handled by "instructions" param

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        // Assistant text (if any)
        if (m.content) {
          input.push({ role: 'assistant', content: m.content })
        }
        // Function call items
        for (const tc of m.toolCalls) {
          input.push({
            type: 'function_call',
            id: tc.id,
            call_id: tc.id,
            name: tc.name,
            arguments: typeof tc.arguments === 'string'
              ? tc.arguments
              : JSON.stringify(tc.arguments),
          })
        }
      } else if (m.role === 'tool') {
        // Tool result → function_call_output
        input.push({
          type: 'function_call_output',
          call_id: m.toolCallId,
          output: m.content,
        })
      } else {
        input.push({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })
      }
    }

    return { messages: input }
  }
}
