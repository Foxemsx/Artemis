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
  }

  // OpenCode Server Management
  opencode: {
    startServer: (cwd: string, port: number) => Promise<{ success?: boolean; error?: string }>
    stopServer: () => Promise<void>
    isInstalled: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    artemis: ArtemisAPI
  }
}

export {}
