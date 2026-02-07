import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn, exec, type ChildProcess } from 'child_process'
import { registerAgentIPC } from './api'

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
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0a0a0a',
    title: 'Artemis',
    icon: path.join(__dirname, '../resources/icon.png'),
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

// ─── IPC: Create Directory ─────────────────────────────────────────────────
ipcMain.handle('fs:createDir', async (_e, dirPath: string) => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true })
  } catch (err: any) {
    console.error('fs:createDir error:', err.message)
    throw err
  }
})

// ─── IPC: Delete File/Directory ──────────────────────────────────────────
ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  try {
    const stat = await fs.promises.stat(targetPath)
    if (stat.isDirectory()) {
      await fs.promises.rm(targetPath, { recursive: true, force: true })
    } else {
      await fs.promises.unlink(targetPath)
    }
  } catch (err: any) {
    console.error('fs:delete error:', err.message)
    throw err
  }
})

// ─── IPC: Tool Execution ──────────────────────────────────────────────────
ipcMain.handle('tools:runCommand', async (_e, command: string, cwd: string) => {
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
    const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command]
    
    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })
    
    // Timeout after 60 seconds
    const timeout = setTimeout(() => {
      child.kill()
      resolve({ stdout: stdout.slice(0, 50000), stderr: 'Command timed out after 60 seconds', exitCode: -1 })
    }, 60000)
    
    child.on('close', (code: number | null) => {
      clearTimeout(timeout)
      resolve({
        stdout: stdout.slice(0, 50000),
        stderr: stderr.slice(0, 10000),
        exitCode: code ?? -1,
      })
    })
    
    child.on('error', (err: Error) => {
      clearTimeout(timeout)
      resolve({ stdout: '', stderr: err.message, exitCode: -1 })
    })
  })
})

ipcMain.handle('tools:searchFiles', async (_e, pattern: string, dirPath: string) => {
  const results: { file: string; line: number; text: string }[] = []
  const maxResults = 50
  const maxDepth = 8
  
  const ignoreDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
    '.venv', 'venv', '.cache', 'coverage', '.idea', '.vscode',
  ])
  
  async function searchDir(dir: string, depth: number) {
    if (depth > maxDepth || results.length >= maxResults) return
    
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (results.length >= maxResults) break
        
        const fullPath = path.join(dir, entry.name)
        
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
            await searchDir(fullPath, depth + 1)
          }
        } else if (entry.isFile()) {
          // Skip binary/large files
          try {
            const stat = await fs.promises.stat(fullPath)
            if (stat.size > 500000) continue // Skip files > 500KB
          } catch { continue }
          
          try {
            const content = await fs.promises.readFile(fullPath, 'utf-8')
            const lines = content.split('\n')
            const regex = new RegExp(pattern, 'gi')
            
            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
              if (regex.test(lines[i])) {
                results.push({
                  file: fullPath,
                  line: i + 1,
                  text: lines[i].trim().slice(0, 200),
                })
              }
              regex.lastIndex = 0 // Reset regex
            }
          } catch {
            // Skip files that can't be read as text
          }
        }
      }
    } catch {}
  }
  
  await searchDir(dirPath, 0)
  return results
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
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout
    
    const response = await fetch(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    })
    
    clearTimeout(timeoutId)

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
    if (err.name === 'AbortError') {
      mainWindow?.webContents.send(`zen:stream:${options.requestId}`, {
        type: 'error',
        data: 'Request timed out. The model may be overloaded or unavailable — try again or switch to a different model.',
      })
      return { ok: false, status: 0, error: 'Request timeout' }
    }
    
    mainWindow?.webContents.send(`zen:stream:${options.requestId}`, {
      type: 'error',
      data: err.message || 'Network error',
    })
    return { ok: false, status: 0, error: err.message }
  }
})

// ─── Agent API System ─────────────────────────────────────────────────────
// Register the new provider-agnostic agent IPC handlers.
// This wires up: agent:run, agent:abort, agent:getTools, agent:executeTool,
// agent:httpRequest, agent:httpStream, and agent:activeRuns.
registerAgentIPC(() => mainWindow)

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
