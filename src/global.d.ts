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
    | 'tool_approval_required' | 'path_approval_required'
    | 'iteration_start' | 'iteration_complete' | 'agent_complete'
    | 'agent_error' | 'agent_aborted'
  seq: number
  timestamp: number
  data: Record<string, any>
}

interface ArtemisAPI {
  // Zen API Proxy (CORS bypass)
  zen: {
    request: (options: ZenRequestOptions) => Promise<ZenRequestResult>
  }

  // Session (PTY) Management
  session: {
    create: (id: string, cwd: string) => Promise<{ success?: boolean; error?: string }>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    kill: (id: string) => Promise<void>
    onData: (id: string, callback: (data: string) => void) => () => void
    onExit: (id: string, callback: (code: number) => void) => () => void
  }

  // System Dialogs
  dialog: {
    openFolder: () => Promise<{ path: string; name: string } | null>
  }

  // Persistent Settings Store
  store: {
    get: <T = any>(key: string) => Promise<T | undefined>
    set: (key: string, value: any) => Promise<void>
    getDir: () => Promise<string>
    isEncrypted: () => Promise<boolean>
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
    rename: (oldPath: string, newPath: string) => Promise<void>
  }

  // Shell Operations
  shell: {
    openPath: (path: string) => Promise<string>
  }

  // Tool Execution
  tools: {
    runCommand: (command: string, cwd: string) => Promise<{ stdout: string; stderr: string; exitCode: number }>
    searchFiles: (pattern: string, dirPath: string) => Promise<{ file: string; line: number; text: string }[]>
  }

  // MCP Marketplace
  mcp: {
    getServers: () => Promise<any[]>
    installServer: (serverId: string, config?: Record<string, any>) => Promise<{ success: boolean; serverId: string; error?: string }>
    uninstallServer: (serverId: string) => Promise<{ success: boolean; serverId: string; error?: string }>
    searchServers: (query: string) => Promise<any[]>
    getConnectedTools: () => Promise<Array<{ name: string; description: string; serverId: string }>>
    getConnectionStatus: () => Promise<Array<{ id: string; name: string; connected: boolean; toolCount: number; tools: string[] }>>
  }

  // Web Search (DuckDuckGo, no API key)
  webSearch: {
    search: (query: string) => Promise<{ query: string; results: { title: string; url: string; snippet: string }[]; error?: string }>
  }

  // Linter Auto-Fix
  linter: {
    lint: (filePath: string, projectPath: string) => Promise<{ file: string; diagnostics: { file: string; line: number; column: number; severity: string; message: string; ruleId: string; source: string }[]; error?: string }>
  }

  // Discord RPC
  discord: {
    toggle: (enable: boolean) => Promise<{ connected: boolean; enabled: boolean; error?: string }>
    getState: () => Promise<{ connected: boolean; enabled: boolean; error?: string; lastFile?: string }>
    updatePresence: (fileName?: string, language?: string, projectName?: string) => Promise<void>
    detectDiscord: () => Promise<boolean>
    setDebug: (enabled: boolean) => Promise<void>
  }

  // Agent API (New Provider-Agnostic System)
  agent: {
    /** Start an autonomous agent run */
    run: (request: AgentRunRequest) => Promise<AgentRunResponse>
    /** Abort an in-progress agent run */
    abort: (requestId: string) => Promise<{ success: boolean; error?: string }>
    /** Respond to a tool approval request */
    respondToolApproval: (approvalId: string, approved: boolean) => Promise<{ success: boolean; error?: string }>
    /** Respond to a path approval request */
    respondPathApproval: (approvalId: string, approved: boolean) => Promise<{ success: boolean; error?: string }>
    /** Listen for agent events during a run */
    onEvent: (requestId: string, callback: (event: AgentEvent) => void) => () => void
  }
}

declare global {
  interface Window {
    artemis: ArtemisAPI
  }
}

export {}
