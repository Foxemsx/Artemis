/**
 * OpenAIChatAdapter — Handles the OpenAI Chat Completions API format.
 * 
 * Used by: GPT models (chat-completions), Kimi, GLM, Qwen, MiniMax,
 * and any OpenAI-compatible provider.
 * 
 * Format: POST /chat/completions
 * Tools: { type: "function", function: { name, description, parameters } }
 * Messages: standard role/content with tool_calls array
 */

import { BaseProvider, type ProviderResponse } from '../BaseProvider'
import type {
  CompletionRequest,
  StreamDelta,
  UniversalMessage,
  UniversalToolDefinition,
  ApiError,
} from '../../types'

export class OpenAIChatAdapter extends BaseProvider {

  formatTools(tools: UniversalToolDefinition[]): any[] {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }))
  }

  buildRequestBody(request: CompletionRequest): any {
    const { messages: formattedMsgs } = this.formatMessages(
      request.messages,
      request.systemPrompt
    )

    const body: any = {
      model: request.model.apiModelId || request.model.id,
      messages: formattedMsgs,
      stream: request.stream,
    }

    if (request.maxTokens || request.model.maxTokens) {
      body.max_tokens = request.maxTokens || request.model.maxTokens
    }

    if (request.temperature !== undefined) {
      body.temperature = request.temperature
    }

    if (request.tools && request.tools.length > 0) {
      body.tools = this.formatTools(request.tools)
    }

    return body
  }

  buildHeaders(request: CompletionRequest): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${request.provider.apiKey}`,
    }
    if (request.provider.extraHeaders) {
      Object.assign(headers, request.provider.extraHeaders)
    }
    if (request.model.extraHeaders) {
      Object.assign(headers, request.model.extraHeaders)
    }
    return headers
  }

  buildUrl(request: CompletionRequest): string {
    const baseUrl = request.model.baseUrl || request.provider.baseUrl
    return `${baseUrl}/chat/completions`
  }

  parseStreamEvent(json: any): StreamDelta | null {
    // Standard OpenAI Chat Completions streaming format:
    // { choices: [{ delta: { content, tool_calls, ... }, finish_reason }] }
    if (!json.choices || !Array.isArray(json.choices)) return null

    const choice = json.choices[0]
    if (!choice) return null

    const delta: StreamDelta = {}

    if (choice.delta?.content) {
      delta.content = choice.delta.content
    }

    if (choice.delta?.reasoning_content) {
      delta.reasoningContent = choice.delta.reasoning_content
    }

    if (choice.delta?.tool_calls && Array.isArray(choice.delta.tool_calls)) {
      delta.toolCalls = choice.delta.tool_calls.map((tc: any) => ({
        index: tc.index ?? 0,
        id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments,
      }))
    }

    if (choice.finish_reason) {
      delta.finishReason = choice.finish_reason === 'tool_calls'
        ? 'tool_calls'
        : choice.finish_reason as StreamDelta['finishReason']
    }

    // If nothing meaningful, skip
    if (!delta.content && !delta.reasoningContent && !delta.toolCalls && !delta.finishReason) {
      return null
    }

    return delta
  }

  parseResponse(json: any): ProviderResponse {
    const choice = json.choices?.[0]
    const message = choice?.message

    const response: ProviderResponse = {
      content: message?.content || '',
      finishReason: (choice?.finish_reason === 'tool_calls' ? 'tool_calls' : choice?.finish_reason) || 'stop',
    }

    if (message?.tool_calls && Array.isArray(message.tool_calls)) {
      response.toolCalls = message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name || '',
        arguments: tc.function?.arguments || '{}',
      }))
    }

    if (json.usage) {
      response.usage = {
        promptTokens: json.usage.prompt_tokens || 0,
        completionTokens: json.usage.completion_tokens || 0,
        totalTokens: json.usage.total_tokens || 0,
      }
    }

    return response
  }

  parseError(status: number, body: string): ApiError {
    return parseApiErrorCommon(status, body)
  }

  formatMessages(
    messages: UniversalMessage[],
    systemPrompt?: string
  ): { messages: any[] } {
    const formatted: any[] = []

    // System prompt goes as first message in chat-completions format
    if (systemPrompt) {
      formatted.push({ role: 'system', content: systemPrompt })
    }

    for (const m of messages) {
      if (m.role === 'system') continue // Already handled above

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        // Assistant message with tool calls
        formatted.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string'
                ? tc.arguments
                : JSON.stringify(tc.arguments),
            },
          })),
        })
      } else if (m.role === 'tool') {
        // Tool result message
        formatted.push({
          role: 'tool',
          tool_call_id: m.toolCallId,
          content: m.content,
        })
      } else {
        formatted.push({
          role: m.role,
          content: m.content,
        })
      }
    }

    return { messages: formatted }
  }
}

// ─── Shared Error Parser ─────────────────────────────────────────────────────

export function parseApiErrorCommon(status: number, body: string): ApiError {
  let errorMsg = body
  try {
    const json = JSON.parse(body)
    errorMsg = json.error?.message || json.message || json.detail || body
  } catch {}

  const lower = errorMsg.toLowerCase()

  if (status === 401 || lower.includes('unauthorized') || lower.includes('invalid api key')) {
    return { type: 'auth', message: 'Invalid or expired API key', details: 'Check your API key in Settings.', status }
  }
  if (status === 402 || lower.includes('billing') || lower.includes('payment') || lower.includes('insufficient')) {
    return { type: 'billing', message: 'Billing issue — insufficient credits', details: 'Add credits or try a free model.', status }
  }
  if (status === 429 || lower.includes('rate limit') || lower.includes('rate_limit')) {
    return { type: 'rate_limit', message: 'Rate limit exceeded', details: 'Wait a moment and try again, or switch models.', status }
  }
  if (status >= 500 || lower.includes('unavailable') || lower.includes('overloaded')) {
    return { type: 'server', message: 'Model unavailable or overloaded', details: 'Try again shortly or switch models.', status }
  }
  return { type: 'unknown', message: errorMsg || `Request failed (status ${status})`, status }
}
