/**
 * Artemis Agent API — Public Exports
 * 
 * This is the single entry point for the entire agent system.
 * Import from here in main.ts to register IPC handlers.
 */

// Types
export type {
  UniversalToolDefinition,
  ToolCall,
  ToolResult,
  UniversalMessage,
  MessageRole,
  StreamDelta,
  StreamToolCallDelta,
  EndpointFormat,
  ProviderConfig,
  ModelConfig,
  CompletionRequest,
  AgentEvent,
  AgentEventType,
  AgentRequest,
  AgentResponse,
  ApiError,
  ApiErrorType,
} from './types'

// Tool System
export { ToolRegistry, toolRegistry } from './tools/ToolRegistry'
export { ToolExecutor, toolExecutor } from './tools/ToolExecutor'

// Provider System
export { BaseProvider } from './providers/BaseProvider'
export { ProviderFactory } from './providers/ProviderFactory'
export { OpenAIChatAdapter } from './providers/adapters/OpenAIChatAdapter'
export { AnthropicAdapter } from './providers/adapters/AnthropicAdapter'
export { OpenAIResponsesAdapter } from './providers/adapters/OpenAIResponsesAdapter'

// Conversation
export { ConversationManager } from './conversation/ConversationManager'

// Agent
export { AgentLoop } from './agent/AgentLoop'
export { StreamProcessor, SSEParser, ToolCallAccumulator } from './agent/StreamParser'

// IPC
export { registerAgentIPC } from './ipc/AgentIPC'
