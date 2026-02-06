// ─── Theme & Navigation ──────────────────────────────────────────────────────
export type Theme = 'dark' | 'light'
export type ActivityView = 'files' | 'chat' | 'terminal' | 'settings'
export type AgentMode = 'builder' | 'planner'

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
  createdAt: string
  updatedAt: string
}

export interface MessagePart {
  type: 'text' | 'tool-call' | 'tool-result'
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
}

export interface ChatMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  parts: MessagePart[]
  model?: string
  createdAt: string
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

// ─── Window API (exposed by preload.ts) ──────────────────────────────────────
declare global {
  interface Window {
    artemis: {
      session: {
        create: (id: string, cwd: string) => Promise<{ success?: boolean; error?: string }>
        write: (id: string, data: string) => Promise<void>
        resize: (id: string, cols: number, rows: number) => Promise<void>
        kill: (id: string) => Promise<void>
        onData: (id: string, callback: (data: string) => void) => () => void
        onExit: (id: string, callback: (code: number) => void) => () => void
        checkOpenCode: () => Promise<boolean>
      }
      dialog: {
        openFolder: () => Promise<{ path: string; name: string } | null>
      }
      store: {
        get: (key: string) => Promise<any>
        set: (key: string, value: any) => Promise<void>
      }
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
        isMaximized: () => Promise<boolean>
        onMaximize: (callback: () => void) => () => void
        onUnmaximize: (callback: () => void) => () => void
      }
      fs: {
        readDir: (dirPath: string) => Promise<{ name: string; type: 'file' | 'directory' }[]>
        readFile: (filePath: string) => Promise<string>
        writeFile: (filePath: string, content: string) => Promise<void>
        stat: (filePath: string) => Promise<{ size: number; isDirectory: boolean; modified: number }>
      }
      opencode: {
        startServer: (cwd: string, port: number) => Promise<{ success: boolean; error?: string }>
        stopServer: () => Promise<void>
        isInstalled: () => Promise<boolean>
      }
    }
  }
}

export {}
