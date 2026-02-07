/// <reference types="vite/client" />

interface FileEntry {
  name: string
  type: 'file' | 'directory'
}

interface FileStat {
  size: number
  isDirectory: boolean
  modified: number
}

interface ZenRequestOptions {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}

interface ZenStreamOptions extends ZenRequestOptions {
  requestId: string
}

interface ZenRequestResult {
  ok: boolean
  status: number
  statusText: string
  data: string
  headers: Record<string, string>
  error?: string
}

// ─── Agent API Types ────────────────────────────────────────────────────────

interface AgentProviderConfig {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  defaultFormat: 'openai-chat' | 'openai-responses' | 'anthropic-messages'
  extraHeaders?: Record<string, string>
}

interface AgentModelConfig {
  id: string
  name: string
  endpointFormat?: 'openai-chat' | 'openai-responses' | 'anthropic-messages'
  baseUrl?: string
  apiModelId?: string
  extraHeaders?: Record<string, string>
  maxTokens?: number
  contextWindow?: number
}

interface AgentRunRequest {
  requestId: string
  userMessage: string
  fileContext?: string
  model: AgentModelConfig
  provider: AgentProviderConfig
  systemPrompt?: string
  toolNames?: string[]
  maxIterations?: number
  projectPath?: string
  conversationHistory?: AgentUniversalMessage[]
}

interface AgentUniversalMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, any> }>
  toolCallId?: string
  toolName?: string
}

interface AgentRunResponse {
  content: string
  toolCallsExecuted: Array<{
    toolCallId: string
    toolName: string
    success: boolean
    output: string
    durationMs?: number
  }>
  iterations: number
  conversationHistory: AgentUniversalMessage[]
  aborted: boolean
  error?: string
}

interface AgentEvent {
  type: 'thinking' | 'text_delta' | 'reasoning_delta' | 'tool_call_start'
    | 'tool_call_delta' | 'tool_call_complete' | 'tool_result'
    | 'iteration_start' | 'iteration_complete' | 'agent_complete'
    | 'agent_error' | 'agent_aborted'
  seq: number
  timestamp: number
  data: Record<string, any>
}

interface AgentToolResult {
  toolCallId: string
  toolName: string
  success: boolean
  output: string
  durationMs?: number
}

interface ArtemisAPI {
  // Zen API Proxy (CORS bypass)
  zen: {
    request: (options: ZenRequestOptions) => Promise<ZenRequestResult>
    streamRequest: (options: ZenStreamOptions) => Promise<{ ok: boolean; status: number; error?: string }>
    onStreamChunk: (requestId: string, callback: (data: any) => void) => () => void
  }

  // Session (PTY) Management
  session: {
    create: (id: string, cwd: string) => Promise<{ success?: boolean; error?: string }>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    kill: (id: string) => Promise<void>
    onData: (id: string, callback: (data: string) => void) => () => void
    onExit: (id: string, callback: (code: number) => void) => () => void
    checkOpenCode: () => Promise<boolean>
  }

  // System Dialogs
  dialog: {
    openFolder: () => Promise<{ path: string; name: string } | null>
  }

  // Persistent Settings Store
  store: {
    get: <T = any>(key: string) => Promise<T | undefined>
    set: (key: string, value: any) => Promise<void>
  }

  // Window Controls
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    onMaximize: (callback: () => void) => () => void
    onUnmaximize: (callback: () => void) => () => void
  }

  // File System Operations
  fs: {
    readDir: (dirPath: string) => Promise<FileEntry[]>
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<void>
    stat: (filePath: string) => Promise<FileStat>
    createDir: (dirPath: string) => Promise<void>
    delete: (targetPath: string) => Promise<void>
  }

  // Tool Execution
  tools: {
    runCommand: (command: string, cwd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
    searchFiles: (pattern: string, dirPath: string) => Promise<{ file: string; line: number; text: string }[]>
  }

  // OpenCode Server Management
  opencode: {
    startServer: (cwd: string, port: number) => Promise<{ success?: boolean; error?: string }>
    stopServer: () => Promise<void>
    isInstalled: () => Promise<boolean>
  }

  // Agent API (New Provider-Agnostic System)
  agent: {
    /** Start an autonomous agent run */
    run: (request: AgentRunRequest) => Promise<AgentRunResponse>
    /** Abort an in-progress agent run */
    abort: (requestId: string) => Promise<{ success: boolean; error?: string }>
    /** Respond to a tool approval request */
    respondToolApproval: (approvalId: string, approved: boolean) => Promise<{ success: boolean; error?: string }>
    /** Get tool definitions for a mode or all tools */
    getTools: (mode?: string) => Promise<Array<{ name: string; description: string; parameters: any }>>
    /** Execute a single tool manually */
    executeTool: (name: string, args: Record<string, any>, projectPath?: string) => Promise<AgentToolResult>
    /** Get IDs of active agent runs */
    activeRuns: () => Promise<string[]>
    /** Listen for agent events during a run */
    onEvent: (requestId: string, callback: (event: AgentEvent) => void) => () => void
    /** Listen for agent run completion */
    onComplete: (requestId: string, callback: (response: AgentRunResponse) => void) => () => void
    /** HTTP proxy request (CORS bypass) */
    httpRequest: (options: ZenRequestOptions) => Promise<ZenRequestResult>
    /** Streaming HTTP proxy request */
    httpStream: (options: ZenStreamOptions) => Promise<{ ok: boolean; status: number; error?: string }>
    /** Listen for streaming HTTP chunks */
    onStreamChunk: (requestId: string, callback: (data: any) => void) => () => void
  }
}

declare global {
  interface Window {
    artemis: ArtemisAPI
  }
}

export {}
