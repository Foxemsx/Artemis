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

    checkOpenCode: () => ipcRenderer.invoke('session:checkOpenCode'),
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
})
