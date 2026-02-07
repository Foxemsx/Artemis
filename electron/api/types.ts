/**
 * Universal Types for the Artemis Agent System
 * 
 * These types are provider-agnostic. The agent loop, tool executor, and
 * conversation manager all operate exclusively on these types. Provider
 * adapters convert to/from provider-specific formats at the boundary.
 */

// ─── Tool Definitions ────────────────────────────────────────────────────────

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

// ─── Tool Execution ──────────────────────────────────────────────────────────

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

// ─── Universal Message Format ────────────────────────────────────────────────

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

export interface UniversalMessage {
  role: MessageRole
  content: string
  /** Present when role === 'assistant' and the model requested tool calls */
  toolCalls?: ToolCall[]
  /** Present when role === 'tool' — links result back to its tool call */
  toolCallId?: string
  /** The tool name for tool-result messages */
  toolName?: string
}

// ─── Streaming ───────────────────────────────────────────────────────────────

export interface StreamDelta {
  /** Incremental text content */
  content?: string
  /** Incremental reasoning/thinking content */
  reasoningContent?: string
  /** Incremental tool call data */
  toolCalls?: StreamToolCallDelta[]
  /** Set when the stream finishes */
  finishReason?: 'stop' | 'tool_calls' | 'length' | 'content_filter' | null
}

export interface StreamToolCallDelta {
  index: number
  id?: string
  name?: string
  arguments?: string
}

// ─── Provider Configuration ──────────────────────────────────────────────────

export type EndpointFormat = 'openai-chat' | 'openai-responses' | 'anthropic-messages'

export interface ProviderConfig {
  /** Unique provider identifier (e.g. 'zen', 'zai', 'openai', 'anthropic') */
  id: string
  /** Human-readable name */
  name: string
  /** Base URL for API requests */
  baseUrl: string
  /** API key */
  apiKey: string
  /** Default endpoint format for this provider */
  defaultFormat: EndpointFormat
  /** Custom headers to include in every request */
  extraHeaders?: Record<string, string>
}

export interface ModelConfig {
  /** Model ID sent to the API */
  id: string
  /** Display name */
  name: string
  /** Override endpoint format for this specific model */
  endpointFormat?: EndpointFormat
  /** Override base URL for this model */
  baseUrl?: string
  /** Override model ID sent in the API body (e.g. ZAI model name mapping) */
  apiModelId?: string
  /** Override headers for this model */
  extraHeaders?: Record<string, string>
  /** Max output tokens */
  maxTokens?: number
  /** Context window size */
  contextWindow?: number
}

// ─── Request Options ─────────────────────────────────────────────────────────

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

// ─── Agent Events (streamed to UI) ──────────────────────────────────────────

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
  | 'iteration_start'
  | 'iteration_complete'
  | 'agent_complete'
  | 'agent_error'
  | 'agent_aborted'

export interface AgentEvent {
  type: AgentEventType
  /** Monotonically increasing event sequence number */
  seq: number
  timestamp: number
  data: Record<string, any>
}

// ─── Agent Request / Response ────────────────────────────────────────────────

export interface AgentRequest {
  /** Unique request ID */
  requestId: string
  /** User's task/message */
  userMessage: string
  /** Optional file context from @mentions */
  fileContext?: string
  /** Model to use */
  model: ModelConfig
  /** Provider configuration */
  provider: ProviderConfig
  /** System prompt */
  systemPrompt?: string
  /** Which tools to make available */
  toolNames?: string[]
  /** Agent mode: determines which tool set is available */
  agentMode?: 'builder' | 'planner' | 'chat'
  /** Max agent loop iterations (default 50) */
  maxIterations?: number
  /** Project root path for tool execution */
  projectPath?: string
  /** Existing conversation history */
  conversationHistory?: UniversalMessage[]
  /** Edit approval mode: 'allow-all' | 'session-only' | 'ask' */
  editApprovalMode?: string
}

export interface AgentResponse {
  /** Final text content from the agent */
  content: string
  /** All tool calls executed during this run */
  toolCallsExecuted: ToolResult[]
  /** Number of iterations the agent loop ran */
  iterations: number
  /** Full conversation history including this interaction */
  conversationHistory: UniversalMessage[]
  /** Whether the agent was aborted */
  aborted: boolean
  /** Error message if the agent failed */
  error?: string
}

// ─── Error Types ─────────────────────────────────────────────────────────────

export type ApiErrorType = 'auth' | 'billing' | 'rate_limit' | 'server' | 'network' | 'timeout' | 'unknown'

export interface ApiError {
  type: ApiErrorType
  message: string
  details?: string
  status?: number
}
