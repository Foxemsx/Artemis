import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, exec, type ChildProcess } from 'child_process'

// node-pty is a native module - import with fallback
let ptyModule: typeof import('node-pty') | null = null
try {
  ptyModule = require('node-pty')
} catch (e) {
  console.error('node-pty failed to load:', e)
}

// ─── Persistent Store ──────────────────────────────────────────────────────
const STORE_PATH = path.join(app.getPath('userData'), 'artemis-settings.json')

function loadStore(): Record<string, any> {
  try {
    if (fs.existsSync(STORE_PATH)) {
      return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'))
    }
  } catch {}
  return {}
}

function saveStore(data: Record<string, any>) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Failed to save store:', e)
  }
}

let store = loadStore()

// ─── PTY Session Management ────────────────────────────────────────────────
const sessions = new Map<string, import('node-pty').IPty>()

// ─── OpenCode Server Management ────────────────────────────────────────────
let opencodeServer: ChildProcess | null = null

// ─── Main Window ───────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 650,
    frame: false,
    backgroundColor: '#0a0a0a',
    title: 'Artemis',
    icon: undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  // Load renderer
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // Forward window state events to renderer
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized')
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:unmaximized')
  })
}

// ─── IPC: Window Controls ──────────────────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.handle('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)

// ─── IPC: Store ────────────────────────────────────────────────────────────
ipcMain.handle('store:get', (_e, key: string) => {
  return store[key]
})

ipcMain.handle('store:set', (_e, key: string, value: any) => {
  store[key] = value
  saveStore(store)
})

// ─── IPC: Folder Dialog ────────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Project Folder',
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const folderPath = result.filePaths[0]
  return { path: folderPath, name: path.basename(folderPath) }
})

// ─── IPC: File System Operations ───────────────────────────────────────────
ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' as const : 'file' as const,
      }))
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  } catch (err: any) {
    console.error('fs:readDir error:', err.message)
    return []
  }
})

ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
  try {
    return await fs.promises.readFile(filePath, 'utf-8')
  } catch (err: any) {
    console.error('fs:readFile error:', err.message)
    return ''
  }
})

ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8')
  } catch (err: any) {
    console.error('fs:writeFile error:', err.message)
    throw err
  }
})

ipcMain.handle('fs:stat', async (_e, filePath: string) => {
  try {
    const stat = await fs.promises.stat(filePath)
    return {
      size: stat.size,
      isDirectory: stat.isDirectory(),
      modified: stat.mtimeMs,
    }
  } catch (err: any) {
    console.error('fs:stat error:', err.message)
    return { size: 0, isDirectory: false, modified: 0 }
  }
})

// ─── IPC: OpenCode Server Management ───────────────────────────────────────
ipcMain.handle('opencode:startServer', async (_e, cwd: string, port: number) => {
  // Kill existing server if running
  if (opencodeServer) {
    try {
      opencodeServer.kill()
    } catch {}
    opencodeServer = null
  }

  try {
    const cmd = process.platform === 'win32' ? 'opencode.cmd' : 'opencode'
    const child = spawn(cmd, ['serve', '--port', String(port)], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      env: { ...process.env },
    })

    opencodeServer = child

    // Wait for the server to be ready (health check)
    const maxAttempts = 30
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 500))
      try {
        const response = await fetch(`http://127.0.0.1:${port}/global/health`)
        if (response.ok) {
          console.log(`[Artemis] OpenCode server ready on port ${port}`)
          return { success: true }
        }
      } catch {
        // Server not ready yet
      }
      // Check if process already died
      if (child.exitCode !== null) {
        return { success: false, error: `OpenCode server exited with code ${child.exitCode}` }
      }
    }

    return { success: false, error: 'OpenCode server did not become ready in time' }
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to start OpenCode server' }
  }
})

ipcMain.handle('opencode:stopServer', async () => {
  if (opencodeServer) {
    try {
      opencodeServer.kill()
    } catch {}
    opencodeServer = null
  }
})

ipcMain.handle('opencode:isInstalled', async () => {
  return new Promise<boolean>((resolve) => {
    const cmd = process.platform === 'win32' ? 'where opencode' : 'which opencode'
    exec(cmd, (error) => {
      resolve(!error)
    })
  })
})

// ─── IPC: Session Management (PTY for regular terminal) ────────────────────
ipcMain.handle('session:create', (event, { id, cwd }: { id: string; cwd: string }) => {
  if (!ptyModule) {
    return { error: 'Terminal engine (node-pty) is not available. Please reinstall dependencies.' }
  }

  try {
    const shell = process.platform === 'win32'
      ? (process.env.COMSPEC || 'cmd.exe')
      : (process.env.SHELL || 'bash')

    const ptyProcess = ptyModule.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
      cwd,
      env: { ...process.env } as Record<string, string>,
    })

    sessions.set(id, ptyProcess)

    ptyProcess.onData((data: string) => {
      mainWindow?.webContents.send(`session:data:${id}`, data)
    })

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      mainWindow?.webContents.send(`session:exit:${id}`, exitCode)
      sessions.delete(id)
    })

    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Failed to create session' }
  }
})

ipcMain.handle('session:write', (_e, { id, data }: { id: string; data: string }) => {
  sessions.get(id)?.write(data)
})

ipcMain.handle('session:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
  try {
    sessions.get(id)?.resize(cols, rows)
  } catch {}
})

ipcMain.handle('session:kill', (_e, { id }: { id: string }) => {
  try {
    sessions.get(id)?.kill()
  } catch {}
  sessions.delete(id)
})

ipcMain.handle('session:checkOpenCode', async () => {
  return new Promise<boolean>((resolve) => {
    const cmd = process.platform === 'win32' ? 'where opencode' : 'which opencode'
    exec(cmd, (error) => {
      resolve(!error)
    })
  })
})

// ─── IPC: Zen API Proxy (to bypass CORS) ────────────────────────────────────
ipcMain.handle('zen:request', async (_e, options: {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}) => {
  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    })

    const text = await response.text()
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: text,
      headers: Object.fromEntries(response.headers.entries()),
    }
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      statusText: err.message || 'Network error',
      data: '',
      headers: {},
      error: err.message,
    }
  }
})

// Streaming request handler - sends chunks via IPC events
ipcMain.handle('zen:streamRequest', async (event, options: {
  requestId: string
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}) => {
  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    })

    if (!response.ok) {
      const errorText = await response.text()
      mainWindow?.webContents.send(`zen:stream:${options.requestId}`, {
        type: 'error',
        status: response.status,
        data: errorText,
      })
      return { ok: false, status: response.status }
    }

    if (!response.body) {
      mainWindow?.webContents.send(`zen:stream:${options.requestId}`, {
        type: 'error',
        data: 'Response body is null',
      })
      return { ok: false, status: 500 }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          mainWindow?.webContents.send(`zen:stream:${options.requestId}`, {
            type: 'done',
          })
          break
        }

        const text = decoder.decode(value, { stream: true })
        mainWindow?.webContents.send(`zen:stream:${options.requestId}`, {
          type: 'chunk',
          data: text,
        })
      }
    } finally {
      reader.releaseLock()
    }

    return { ok: true, status: response.status }
  } catch (err: any) {
    mainWindow?.webContents.send(`zen:stream:${options.requestId}`, {
      type: 'error',
      data: err.message || 'Network error',
    })
    return { ok: false, status: 0, error: err.message }
  }
})

// ─── App Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  // Kill all PTY sessions
  for (const [_id, session] of sessions) {
    try { session.kill() } catch {}
  }
  sessions.clear()

  // Kill OpenCode server
  if (opencodeServer) {
    try { opencodeServer.kill() } catch {}
    opencodeServer = null
  }

  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
