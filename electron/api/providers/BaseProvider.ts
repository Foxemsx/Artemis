/**
 * BaseProvider — Abstract interface that ALL providers must implement.
 * 
 * The agent loop only ever talks to this interface. It never sees
 * provider-specific request/response formats. Adapters handle all conversion.
 */

import type {
  CompletionRequest,
  StreamDelta,
  UniversalMessage,
  UniversalToolDefinition,
  ApiError,
} from '../types'

// ─── Provider Response Types ─────────────────────────────────────────────────

export interface ProviderStreamChunk {
  delta: StreamDelta
  raw?: any
}

export interface ProviderResponse {
  content: string
  toolCalls?: Array<{
    id: string
    name: string
    arguments: string
  }>
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// ─── Abstract Base Provider ──────────────────────────────────────────────────

export abstract class BaseProvider {
  /**
   * Convert universal tool definitions to this provider's format.
   */
  abstract formatTools(tools: UniversalToolDefinition[]): any[]

  /**
   * Build the complete request body for this provider's API.
   * Converts universal messages + tools into provider-specific format.
   */
  abstract buildRequestBody(request: CompletionRequest): any

  /**
   * Build HTTP headers for this provider's API.
   */
  abstract buildHeaders(request: CompletionRequest): Record<string, string>

  /**
   * Build the full URL for this provider's API endpoint.
   */
  abstract buildUrl(request: CompletionRequest): string

  /**
   * Parse a single SSE data line into a normalized StreamDelta.
   * Returns null for non-content events (pings, metadata, etc).
   */
  abstract parseStreamEvent(json: any): StreamDelta | null

  /**
   * Parse a non-streaming response into universal format.
   */
  abstract parseResponse(json: any): ProviderResponse

  /**
   * Parse an API error response into a structured ApiError.
   */
  abstract parseError(status: number, body: string): ApiError

  /**
   * Convert universal messages to this provider's message format.
   * Called internally by buildRequestBody.
   */
  abstract formatMessages(
    messages: UniversalMessage[],
    systemPrompt?: string
  ): { messages: any[]; systemParam?: any }
}
