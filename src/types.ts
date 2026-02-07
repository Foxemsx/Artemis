// ─── Theme & Navigation ──────────────────────────────────────────────────────
export type Theme = 'dark' | 'light' | 'cyberpunk' | 'nord' | 'monokai' | 'solarized' | 'dracula' | 'rosepine'
export type ActivityView = 'files' | 'chat' | 'terminal' | 'settings' | 'problems' | 'search'
export type AgentMode = 'builder' | 'planner' | 'chat'
export type EditApprovalMode = 'allow-all' | 'session-only' | 'ask'
export type AIProvider = 'zen' | 'zai'

// ─── Project ─────────────────────────────────────────────────────────────────
export interface Project {
  id: string
  name: string
  path: string
  lastOpened: number
}

// ─── File Explorer ───────────────────────────────────────────────────────────
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

// ─── Editor ──────────────────────────────────────────────────────────────────
export interface EditorTab {
  path: string
  name: string
  language: string
  content: string
  isDirty: boolean
}

// ─── Chat / Agent ────────────────────────────────────────────────────────────
export interface ChatSession {
  id: string
  title: string
  projectId?: string
  createdAt: string
  updatedAt: string
}

export interface MessagePart {
  type: 'text' | 'tool-call' | 'tool-result' | 'thinking' | 'reasoning'
  text?: string
  toolCall?: {
    id: string
    name: string
    args: Record<string, unknown>
  }
  toolResult?: {
    id: string
    name: string
    success: boolean
    output: string
  }
  thinking?: {
    steps: AgentStep[]
    duration: number // in milliseconds
    isComplete: boolean
  }
  reasoning?: {
    content: string
    isComplete: boolean
  }
}

// ─── Agent Step (for thinking/planning blocks) ───────────────────────────────
export interface AgentStep {
  id: string
  type: 'thinking' | 'tool-call' | 'tool-result' | 'plan' | 'summary'
  content: string
  toolCall?: {
    name: string
    args: Record<string, unknown>
  }
  toolResult?: {
    success: boolean
    output: string
  }
  timestamp: number
  duration?: number // how long this step took
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  parts: MessagePart[]
  model?: string
  createdAt: string
  // Agent thinking metadata
  agentMeta?: {
    startTime: number
    endTime?: number
    totalSteps: number
    isThinking: boolean
  }
}

// ─── Providers / Models ──────────────────────────────────────────────────────
export interface Provider {
  id: string
  name: string
  models: Model[]
}

export interface Model {
  id: string
  name: string
  providerId: string
  providerName: string
  aiProvider: AIProvider  // 'zen' for OpenCode Zen, 'zai' for Z.AI
  maxTokens?: number
  contextWindow?: number
  pricing?: {
    input: number   // per 1M tokens
    output: number  // per 1M tokens
  }
  free?: boolean
  description?: string
}

// ─── Session Token Tracking ──────────────────────────────────────────────────
export interface SessionTokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number   // in USD
}

// ─── Workspace / Multi-Project ───────────────────────────────────────────────
export interface Workspace {
  id: string
  projects: Project[]
  activeProjectId: string | null
}

// ─── PTY Session (for regular terminal, not chat) ────────────────────────────
export interface PtySession {
  id: string
  name: string
  status: 'running' | 'exited' | 'error'
  exitCode?: number
  createdAt: number
}

// ─── Language Detection Utility ──────────────────────────────────────────────
const EXT_TO_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact',
  js: 'javascript', jsx: 'javascriptreact',
  json: 'json', md: 'markdown', css: 'css',
  html: 'html', scss: 'scss', less: 'less',
  py: 'python', rs: 'rust', go: 'go',
  java: 'java', c: 'c', cpp: 'cpp', h: 'c',
  sh: 'shellscript', bash: 'shellscript',
  yaml: 'yaml', yml: 'yaml', toml: 'toml',
  xml: 'xml', svg: 'xml', sql: 'sql',
  dockerfile: 'dockerfile', gitignore: 'ignore',
}

export function detectLanguage(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower === 'dockerfile') return 'dockerfile'
  if (lower === '.gitignore') return 'ignore'
  const ext = lower.split('.').pop() || ''
  return EXT_TO_LANG[ext] || 'plaintext'
}

