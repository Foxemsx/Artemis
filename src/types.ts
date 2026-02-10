export type Theme = 'dark' | 'light' | 'cyberpunk' | 'nord' | 'monokai' | 'solarized' | 'dracula' | 'rosepine' | 'pine' | 'catppuccin' | 'gruvbox' | 'materialocean' | 'everforest' | 'sakura' | 'beach' | 'space'
export type ActivityView = 'files' | 'chat' | 'terminal' | 'settings' | 'problems' | 'search' | 'mcp' | 'git'
export type AgentMode = 'builder' | 'planner' | 'chat' | 'ask'
export type EditApprovalMode = 'allow-all' | 'session-only' | 'ask'
export type AIProvider = 'zen' | 'zai' | 'anthropic' | 'openai' | 'openrouter' | 'moonshot' | 'google' | 'deepseek' | 'groq' | 'mistral' | 'perplexity' | 'synthetic' | 'ollama'

export interface Project {
  id: string
  name: string
  path: string
  lastOpened: number
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export interface EditorTab {
  path: string
  name: string
  language: string
  content: string
  isDirty: boolean
  isPinned?: boolean
  isPreview?: boolean
}

export interface ChatSession {
  id: string
  title: string
  projectId?: string
  createdAt: string
  updatedAt: string
}

export interface MessagePart {
  type: 'text' | 'tool-call' | 'tool-result' | 'thinking' | 'reasoning' | 'image'
  text?: string
  image?: {
    url: string
    mimeType?: string
  }
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
    isComplete: boolean
    duration?: number
  }
  reasoning?: {
    content: string
    isComplete: boolean
  }
}

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
  duration?: number
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  parts: MessagePart[]
  model?: string
  createdAt: string
  planText?: string
  agentMeta?: {
    startTime: number
    endTime?: number
    totalSteps: number
    isThinking: boolean
  }
}

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
  aiProvider?: AIProvider
  maxTokens?: number
  contextWindow?: number
  pricing?: {
    input: number
    output: number
  }
  free?: boolean
  description?: string
  supportsTools?: boolean
}

export interface SessionTokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  estimatedCost: number
}

export interface PtySession {
  id: string
  name: string
  status: 'running' | 'exited' | 'error'
  exitCode?: number
  createdAt: number
}

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

