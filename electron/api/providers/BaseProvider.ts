import type {
  CompletionRequest,
  StreamDelta,
  UniversalMessage,
  UniversalToolDefinition,
  ApiError,
} from '../types'

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

const SAFETY_BUFFER = 2000
const MIN_OUTPUT_TOKENS = 1000

export function capMaxTokens(
  maxTokens: number,
  contextWindow: number | undefined,
  serializedInput: string,
): number {
  if (!contextWindow) return maxTokens
  const estimatedInputTokens = Math.ceil(serializedInput.length / 3.5)
  const available = contextWindow - estimatedInputTokens - SAFETY_BUFFER
  return Math.max(MIN_OUTPUT_TOKENS, Math.min(maxTokens, available))
}

export abstract class BaseProvider {
  abstract formatTools(tools: UniversalToolDefinition[]): any[]

  abstract buildRequestBody(request: CompletionRequest): any

  abstract buildHeaders(request: CompletionRequest): Record<string, string>

  abstract buildUrl(request: CompletionRequest): string

  abstract parseStreamEvent(json: any): StreamDelta | null

  abstract parseResponse(json: any): ProviderResponse

  abstract parseError(status: number, body: string): ApiError

  abstract formatMessages(
    messages: UniversalMessage[],
    systemPrompt?: string
  ): { messages: any[]; systemParam?: any }
}
