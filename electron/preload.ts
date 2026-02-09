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

  },

  // ─── Project Management ──────────────────────────────────────────────
  project: {
    setPath: (projectPath: string) =>
      ipcRenderer.invoke('project:setPath', projectPath),
  },

  // ─── System Dialogs ───────────────────────────────────────────────────
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },

  // ─── Persistent Settings Store ────────────────────────────────────────
  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    getDir: () => ipcRenderer.invoke('store:getDir'),
    isEncrypted: () => ipcRenderer.invoke('store:isEncrypted'),
  },

  // Security-sensitive capabilities (disabled by default)
  security: {
    getCapabilities: () =>
      ipcRenderer.invoke('security:getCapabilities') as Promise<{ terminal: boolean; commands: boolean }>,
    requestCapability: (capability: 'terminal' | 'commands') =>
      ipcRenderer.invoke('security:requestCapability', capability) as Promise<boolean>,
  },

  // Workspace Trust (VSCode-style folder trust system)
  trust: {
    check: (folderPath: string) =>
      ipcRenderer.invoke('trust:check', folderPath) as Promise<boolean>,
    grant: (folderPath: string) =>
      ipcRenderer.invoke('trust:grant', folderPath) as Promise<boolean>,
    revoke: (folderPath: string) =>
      ipcRenderer.invoke('trust:revoke', folderPath) as Promise<boolean>,
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

    rename: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke('fs:rename', oldPath, newPath),
  },

  // ─── Shell Operations ──────────────────────────────────────────────────
  shell: {
    openPath: (path: string) =>
      ipcRenderer.invoke('shell:openPath', path),
    openExternal: (url: string) =>
      ipcRenderer.invoke('shell:openExternal', url),
  },

  // ─── Tool Execution ──────────────────────────────────────────────────
  tools: {
    runCommand: (command: string, cwd: string) =>
      ipcRenderer.invoke('tools:runCommand', command, cwd),

    searchFiles: (pattern: string, dirPath: string) =>
      ipcRenderer.invoke('tools:searchFiles', pattern, dirPath),
  },

  // ─── Git Operations (array-based args, safe for commit messages) ────
  git: {
    run: (args: string[], cwd: string) =>
      ipcRenderer.invoke('git:run', args, cwd),
  },

  // ─── MCP Marketplace ──────────────────────────────────────────────────
  mcp: {
    getServers: () => ipcRenderer.invoke('mcp:getServers'),
    installServer: (serverId: string, config?: Record<string, any>) =>
      ipcRenderer.invoke('mcp:installServer', serverId, config),
    uninstallServer: (serverId: string) =>
      ipcRenderer.invoke('mcp:uninstallServer', serverId),
    searchServers: (query: string) =>
      ipcRenderer.invoke('mcp:searchServers', query),
    getConnectedTools: () =>
      ipcRenderer.invoke('mcp:getConnectedTools') as Promise<Array<{ name: string; description: string; serverId: string }>>,
    getConnectionStatus: () =>
      ipcRenderer.invoke('mcp:getConnectionStatus') as Promise<Array<{ id: string; name: string; connected: boolean; toolCount: number; tools: string[] }>>,
    addCustomServer: (server: { id: string; name: string; description: string; command: string; args: string[]; env?: Record<string, string> }) =>
      ipcRenderer.invoke('mcp:addCustomServer', server),
    removeCustomServer: (serverId: string) =>
      ipcRenderer.invoke('mcp:removeCustomServer', serverId),
    getCustomServers: () =>
      ipcRenderer.invoke('mcp:getCustomServers'),
    getServerLogs: (serverId: string) =>
      ipcRenderer.invoke('mcp:getServerLogs', serverId),
    clearServerLogs: (serverId: string) =>
      ipcRenderer.invoke('mcp:clearServerLogs', serverId),
    getAllServerLogs: () =>
      ipcRenderer.invoke('mcp:getAllServerLogs'),
  },

  // ─── Web Search (DuckDuckGo) ────────────────────────────────────────
  webSearch: {
    search: (query: string) =>
      ipcRenderer.invoke('webSearch:search', query),
  },

  // ─── Linter Auto-Fix ────────────────────────────────────────────────
  linter: {
    lint: (filePath: string, projectPath: string) =>
      ipcRenderer.invoke('linter:lint', filePath, projectPath),
  },

  // ─── Discord RPC ────────────────────────────────────────────────────
  discord: {
    toggle: (enable: boolean) =>
      ipcRenderer.invoke('discord:toggle', enable),
    getState: () =>
      ipcRenderer.invoke('discord:getState'),
    updatePresence: (fileName?: string, language?: string, projectName?: string) =>
      ipcRenderer.invoke('discord:updatePresence', fileName, language, projectName),
    detectDiscord: () =>
      ipcRenderer.invoke('discord:detectDiscord'),
    setDebug: (enabled: boolean) =>
      ipcRenderer.invoke('discord:setDebug', enabled),
  },

  // ─── Inline Code Completion (AI Ghost Text) ─────────────────────────
  inlineCompletion: {
    complete: (request: { prefix: string; suffix: string; language: string; filepath: string }) =>
      ipcRenderer.invoke('inlineCompletion:complete', request),
    getConfig: () =>
      ipcRenderer.invoke('inlineCompletion:getConfig'),
    setConfig: (config: { enabled?: boolean; provider?: string; model?: string; maxTokens?: number }) =>
      ipcRenderer.invoke('inlineCompletion:setConfig', config),
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

    /** Respond to a path approval request */
    respondPathApproval: (approvalId: string, approved: boolean) =>
      ipcRenderer.invoke('agent:respondPathApproval', approvalId, approved),

    /** Listen for agent events during a run */
    onEvent: (requestId: string, callback: (event: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on(`agent:event:${requestId}`, handler)
      return () => { ipcRenderer.removeListener(`agent:event:${requestId}`, handler) }
    },

  },
})
