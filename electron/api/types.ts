

export interface ToolParameter {
  type: string
  description: string
  enum?: string[]
  items?: ToolParameter
  properties?: Record<string, ToolParameter>
  required?: string[]
}

export interface UniversalToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParameter>
    required: string[]
  }
}


export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, any>
}

export interface ToolResult {
  toolCallId: string
  toolName: string
  success: boolean
  output: string
  durationMs?: number
}


export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface UniversalMessage {
  role: MessageRole
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  toolName?: string
}


export interface StreamDelta {
  content?: string
  reasoningContent?: string
  toolCalls?: StreamToolCallDelta[]
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface StreamToolCallDelta {
  index: number
  id?: string
  name?: string
  arguments?: string
}


export type EndpointFormat = 'openai-chat' | 'openai-responses' | 'anthropic-messages'

export interface ProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  defaultFormat: EndpointFormat
  extraHeaders?: Record<string, string>
}

export interface ModelConfig {
  id: string
  name: string
  endpointFormat?: EndpointFormat
  baseUrl?: string
  apiModelId?: string
  extraHeaders?: Record<string, string>
  maxTokens?: number
  contextWindow?: number
  supportsTools?: boolean
}


export interface CompletionRequest {
  model: ModelConfig
  provider: ProviderConfig
  messages: UniversalMessage[]
  systemPrompt?: string
  tools?: UniversalToolDefinition[]
  maxTokens?: number
  temperature?: number
  stream: boolean
  signal?: AbortSignal
}


export type AgentEventType =
  | 'thinking'
  | 'text_delta'
  | 'reasoning_delta'
  | 'tool_call_start'
  | 'tool_call_delta'
  | 'tool_call_complete'
  | 'tool_result'
  | 'tool_approval_required'
  | 'tool_approval_response'
  | 'path_approval_required'
  | 'path_approval_response'
  | 'iteration_start'
  | 'iteration_complete'
  | 'agent_complete'
  | 'agent_error'
  | 'agent_aborted'

export interface AgentEvent {
  type: AgentEventType
  seq: number
  timestamp: number
  data: Record<string, any>
}


export interface AgentRequest {
  requestId: string
  userMessage: string
  fileContext?: string
  model: ModelConfig
  provider: ProviderConfig
  systemPrompt?: string
  toolNames?: string[]
  agentMode?: 'builder' | 'planner' | 'chat'
  maxIterations?: number
  projectPath?: string
  conversationHistory?: UniversalMessage[]
  editApprovalMode?: string
}

export interface AgentResponse {
  content: string
  toolCallsExecuted: ToolResult[]
  iterations: number
  conversationHistory: UniversalMessage[]
  aborted: boolean
  error?: string
}


export type ApiErrorType = 'auth' | 'billing' | 'rate_limit' | 'server' | 'network' | 'timeout' | 'unknown'

export interface ApiError {
  type: ApiErrorType
  message: string
  details?: string
  status?: number
}
