import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('artemis', {
  zen: {
    request: (options: {
      url: string
      method: string
      headers?: Record<string, string>
      body?: string
    }) => ipcRenderer.invoke('zen:request', options),

  },

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

  project: {
    setPath: (projectPath: string) =>
      ipcRenderer.invoke('project:setPath', projectPath),
  },

  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },

  store: {
    get: (key: string) => ipcRenderer.invoke('store:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('store:set', key, value),
    delete: (key: string) => ipcRenderer.invoke('store:delete', key),
    getDir: () => ipcRenderer.invoke('store:getDir'),
    isEncrypted: () => ipcRenderer.invoke('store:isEncrypted'),
  },

  security: {
    getCapabilities: () =>
      ipcRenderer.invoke('security:getCapabilities') as Promise<{ terminal: boolean; commands: boolean }>,
    requestCapability: (capability: 'terminal' | 'commands') =>
      ipcRenderer.invoke('security:requestCapability', capability) as Promise<boolean>,
  },

  trust: {
    check: (folderPath: string) =>
      ipcRenderer.invoke('trust:check', folderPath) as Promise<boolean>,
    grant: (folderPath: string) =>
      ipcRenderer.invoke('trust:grant', folderPath) as Promise<boolean>,
    revoke: (folderPath: string) =>
      ipcRenderer.invoke('trust:revoke', folderPath) as Promise<boolean>,
  },

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

  shell: {
    openPath: (path: string) =>
      ipcRenderer.invoke('shell:openPath', path),
    openExternal: (url: string) =>
      ipcRenderer.invoke('shell:openExternal', url),
  },

  tools: {
    runCommand: (command: string, cwd: string) =>
      ipcRenderer.invoke('tools:runCommand', command, cwd),

    searchFiles: (pattern: string, dirPath: string) =>
      ipcRenderer.invoke('tools:searchFiles', pattern, dirPath),
  },

  git: {
    run: (args: string[], cwd: string) =>
      ipcRenderer.invoke('git:run', args, cwd),
  },

  checkpoint: {
    create: (sessionId: string, messageId: string, label: string, projectPath: string, filesToTrack?: string[]) =>
      ipcRenderer.invoke('checkpoint:create', sessionId, messageId, label, projectPath, filesToTrack),
    restore: (sessionId: string, checkpointId: string) =>
      ipcRenderer.invoke('checkpoint:restore', sessionId, checkpointId),
    list: (sessionId: string) =>
      ipcRenderer.invoke('checkpoint:list', sessionId),
    delete: (sessionId: string, checkpointId?: string) =>
      ipcRenderer.invoke('checkpoint:delete', sessionId, checkpointId),
  },

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

  webSearch: {
    search: (query: string) =>
      ipcRenderer.invoke('webSearch:search', query),
  },

  fetchUrl: {
    fetch: (url: string) =>
      ipcRenderer.invoke('fetchUrl:fetch', url),
  },

  linter: {
    lint: (filePath: string, projectPath: string) =>
      ipcRenderer.invoke('linter:lint', filePath, projectPath),
  },

  quickfix: {
    findImport: (symbol: string, projectPath: string) =>
      ipcRenderer.invoke('quickfix:findImport', symbol, projectPath),
    apply: (fix: any, projectPath: string) =>
      ipcRenderer.invoke('quickfix:apply', fix, projectPath),
  },

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

  inlineCompletion: {
    complete: (request: { prefix: string; suffix: string; language: string; filepath: string }) =>
      ipcRenderer.invoke('inlineCompletion:complete', request),
    getConfig: () => ipcRenderer.invoke('inlineCompletion:getConfig'),
    setConfig: (config: any) => ipcRenderer.invoke('inlineCompletion:setConfig', config),
    fetchModels: (providerId: string) => ipcRenderer.invoke('inlineCompletion:fetchModels', providerId),
  },

  commitMessage: {
    generate: (diff: string) => ipcRenderer.invoke('commitMessage:generate', diff),
    getConfig: () => ipcRenderer.invoke('commitMessage:getConfig'),
    setConfig: (config: any) => ipcRenderer.invoke('commitMessage:setConfig', config),
    fetchModels: (providerId: string) => ipcRenderer.invoke('commitMessage:fetchModels', providerId),
  },

  agent: {
    run: (request: any) =>
      ipcRenderer.invoke('agent:run', request),

    abort: (requestId: string) =>
      ipcRenderer.invoke('agent:abort', requestId),

    respondToolApproval: (approvalId: string, approved: boolean) =>
      ipcRenderer.invoke('agent:respondToolApproval', approvalId, approved),

    respondPathApproval: (approvalId: string, approved: boolean) =>
      ipcRenderer.invoke('agent:respondPathApproval', approvalId, approved),

    onEvent: (requestId: string, callback: (event: any) => void) => {
      const handler = (_event: any, data: any) => callback(data)
      ipcRenderer.on(`agent:event:${requestId}`, handler)
      return () => { ipcRenderer.removeListener(`agent:event:${requestId}`, handler) }
    },

  },
})
