import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('artemis', {
  // ─── Zen API Proxy (CORS bypass) ────────────────────────────────────────
  zen: {
    request: (options: {
      url: string
      method: string
      headers?: Record<string, string>
      body?: string
    }) => ipcRenderer.invoke('zen:request', options),

    streamRequest: (options: {
      requestId: string
      url: string
      method: string
      headers?: Record<string, string>
      body?: string
    }) => ipcRenderer.invoke('zen:streamRequest', options),

    onStreamChunk: (requestId: string, callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on(`zen:stream:${requestId}`, handler)
      return () => { ipcRenderer.removeListener(`zen:stream:${requestId}`, handler) }
    },
  },

  // ─── Session (PTY) Management ──────────────────────────────────────────
  session: {
    create: (id: string, cwd: string) =>
      ipcRenderer.invoke('session:create', { id, cwd }),

    write: (id: string, data: string) =>
      ipcRenderer.invoke('session:write', { id, data }),

    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke('session:resize', { id, cols, rows }),

    kill: (id: string) =>
      ipcRenderer.invoke('session:kill', { id }),

    onData: (id: string, callback: (data: string) => void) => {
      const handler = (_event: any, data: string) => callback(data)
      ipcRenderer.on(`session:data:${id}`, handler)
      return () => { ipcRenderer.removeListener(`session:data:${id}`, handler) }
    },

    onExit: (id: string, callback: (code: number) => void) => {
      const handler = (_event: any, code: number) => callback(code)
      ipcRenderer.on(`session:exit:${id}`, handler)
      return () => { ipcRenderer.removeListener(`session:exit:${id}`, handler) }
    },

    checkOpenCode: () => ipcRenderer.invoke('opencode:isInstalled'),
  },

  // ─── System Dialogs ───────────────────────────────────────────────────
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },

  // ─── Persistent Settings Store ────────────────────────────────────────
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
  },

  // ─── Window Controls ─────────────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

    onMaximize: (callback: () => void) => {
      ipcRenderer.on('window:maximized', callback)
      return () => { ipcRenderer.removeListener('window:maximized', callback) }
    },

    onUnmaximize: (callback: () => void) => {
      ipcRenderer.on('window:unmaximized', callback)
      return () => { ipcRenderer.removeListener('window:unmaximized', callback) }
    },
  },

  // ─── File System Operations ───────────────────────────────────────────
  fs: {
    readDir: (dirPath: string) =>
      ipcRenderer.invoke('fs:readDir', dirPath),

    readFile: (filePath: string) =>
      ipcRenderer.invoke('fs:readFile', filePath),

    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('fs:writeFile', filePath, content),

    stat: (filePath: string) =>
      ipcRenderer.invoke('fs:stat', filePath),

    createDir: (dirPath: string) =>
      ipcRenderer.invoke('fs:createDir', dirPath),

    delete: (targetPath: string) =>
      ipcRenderer.invoke('fs:delete', targetPath),
  },

  // ─── Tool Execution ──────────────────────────────────────────────────
  tools: {
    runCommand: (command: string, cwd: string) =>
      ipcRenderer.invoke('tools:runCommand', command, cwd),

    searchFiles: (pattern: string, dirPath: string) =>
      ipcRenderer.invoke('tools:searchFiles', pattern, dirPath),
  },

  // ─── OpenCode Server Management ──────────────────────────────────────
  opencode: {
    startServer: (cwd: string, port: number) =>
      ipcRenderer.invoke('opencode:startServer', cwd, port),

    stopServer: () =>
      ipcRenderer.invoke('opencode:stopServer'),

    isInstalled: () =>
      ipcRenderer.invoke('opencode:isInstalled'),
  },

  // ─── Agent API (New Provider-Agnostic System) ─────────────────────────
  agent: {
    /** Start an autonomous agent run. Returns final AgentResponse. */
    run: (request: any) =>
      ipcRenderer.invoke('agent:run', request),

    /** Abort an in-progress agent run */
    abort: (requestId: string) =>
      ipcRenderer.invoke('agent:abort', requestId),

    /** Respond to a tool approval request */
    respondToolApproval: (approvalId: string, approved: boolean) =>
      ipcRenderer.invoke('agent:respondToolApproval', approvalId, approved),

    /** Get tool definitions for a mode (builder/planner/chat) or all */
    getTools: (mode?: string) =>
      ipcRenderer.invoke('agent:getTools', mode),

    /** Execute a single tool (for testing/manual use) */
    executeTool: (name: string, args: Record<string, any>, projectPath?: string) =>
      ipcRenderer.invoke('agent:executeTool', name, args, projectPath),

    /** Get list of active agent run IDs */
    activeRuns: () =>
      ipcRenderer.invoke('agent:activeRuns'),

    /** Listen for agent events during a run */
    onEvent: (requestId: string, callback: (event: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on(`agent:event:${requestId}`, handler)
      return () => { ipcRenderer.removeListener(`agent:event:${requestId}`, handler) }
    },

    /** Listen for agent run completion */
    onComplete: (requestId: string, callback: (response: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on(`agent:complete:${requestId}`, handler)
      return () => { ipcRenderer.removeListener(`agent:complete:${requestId}`, handler) }
    },

    /** HTTP proxy request (CORS bypass) */
    httpRequest: (options: {
      url: string
      method: string
      headers?: Record<string, string>
      body?: string
    }) => ipcRenderer.invoke('agent:httpRequest', options),

    /** Streaming HTTP proxy request */
    httpStream: (options: {
      requestId: string
      url: string
      method: string
      headers?: Record<string, string>
      body?: string
    }) => ipcRenderer.invoke('agent:httpStream', options),

    /** Listen for streaming HTTP chunks */
    onStreamChunk: (requestId: string, callback: (data: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on(`agent:stream:${requestId}`, handler)
      return () => { ipcRenderer.removeListener(`agent:stream:${requestId}`, handler) }
    },
  },
})
