import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import { registerAgentIPC } from './api'
import { webSearch } from './services/webSearchService'
import { lintFile } from './services/linterService'
import * as mcpService from './services/mcpService'
import { mcpClientManager } from './services/mcpClient'
import * as discordRPC from './services/discordRPCService'

// ─── App Identity (must be before app.whenReady) ─────────────────────────
app.name = 'Artemis IDE'
if (process.platform === 'win32') {
  app.setAppUserModelId('Artemis IDE')
}

// Suppress Chrome DevTools Autofill protocol errors
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,Autofill')

let isQuitting = false

// node-pty is a native module - import with fallback
let ptyModule: typeof import('node-pty') | null = null
try {
  ptyModule = require('node-pty')
} catch (e) {
  console.error('node-pty failed to load:', e)
}

// ─── Persistent Store ──────────────────────────────────────────────────────
const STORE_DIR = path.join(app.getPath('userData'))
const STORE_PATH = path.join(STORE_DIR, 'artemis-settings.json')

// Keys that contain sensitive data and must be encrypted
const SENSITIVE_KEY_PREFIXES = ['apiKey:']

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))
}

function encryptValue(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Artemis] safeStorage encryption not available — falling back to plaintext')
    return value
  }
  const encrypted = safeStorage.encryptString(value)
  return 'enc:' + encrypted.toString('base64')
}

function decryptValue(stored: string): string {
  if (!stored.startsWith('enc:')) {
    // Legacy plaintext value — return as-is (will be re-encrypted on next save)
    return stored
  }
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[Artemis] safeStorage decryption not available')
    return ''
  }
  const buffer = Buffer.from(stored.slice(4), 'base64')
  return safeStorage.decryptString(buffer)
}

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
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:maximized')
    }
  })
  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:unmaximized')
    }
  })

  // Security: Set Content Security Policy headers
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net blob: data:; " +
          "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net blob:; " +
          "worker-src 'self' blob:; " +
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
          "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; " +
          "font-src 'self' https://fonts.gstatic.com data:; " +
          "img-src 'self' data: https: blob:; " +
          "connect-src 'self' https://opencode.ai https://api.z.ai https://*.opencode.ai https://*.z.ai https://html.duckduckgo.com https://api.openai.com https://api.anthropic.com https://webcache.googleusercontent.com; " +
          "object-src 'none'; " +
          "frame-ancestors 'none'; " +
          "base-uri 'self';"
        ]
      }
    })
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
  const raw = store[key]
  // Decrypt sensitive keys on read
  if (isSensitiveKey(key) && typeof raw === 'string' && raw) {
    return decryptValue(raw)
  }
  return raw
})

ipcMain.handle('store:set', (_e, key: string, value: any) => {
  // Encrypt sensitive keys on write
  if (isSensitiveKey(key) && typeof value === 'string' && value) {
    store[key] = encryptValue(value)
  } else {
    store[key] = value
  }
  saveStore(store)
})

// ─── IPC: Store Directory (for UI display) ─────────────────────────────────
ipcMain.handle('store:getDir', () => {
  return STORE_DIR
})

ipcMain.handle('store:isEncrypted', () => {
  return safeStorage.isEncryptionAvailable()
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

// ─── Input Validation Helper ───────────────────────────────────────────────
const DANGEROUS_SHELL_CHARS = /[;&|`$(){}[\]\<>\n\r]/

function validateFsPath(filePath: string, operation: string): string {
  // Validate input type
  if (typeof filePath !== 'string') {
    throw new Error(`Invalid path: expected string, got ${typeof filePath}`)
  }
  
  // Block empty paths
  if (!filePath || filePath.trim().length === 0) {
    throw new Error('Invalid path: empty path')
  }
  
  // Block UNC paths
  if (filePath.startsWith('\\\\') || filePath.startsWith('//')) {
    throw new Error('Access denied: UNC paths are not allowed')
  }
  
  // Block Windows extended paths
  if (filePath.startsWith('\\?\\')) {
    throw new Error('Access denied: Extended paths are not allowed')
  }
  
  // Block null bytes
  if (filePath.includes('\0')) {
    throw new Error('Access denied: null bytes in path')
  }
  
  const resolved = path.resolve(filePath)
  
  // Block resolved UNC paths
  if (resolved.startsWith('\\\\') || resolved.startsWith('//')) {
    throw new Error('Access denied: UNC paths are not allowed')
  }
  
  // Block dangerous system paths (case-insensitive)
  const dangerous = [
    'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData',
    '/usr', '/etc', '/bin', '/sbin', '/lib', '/lib64', '/sys', '/proc', '/dev',
  ]
  for (const d of dangerous) {
    if (resolved.toLowerCase().startsWith(d.toLowerCase())) {
      throw new Error(`Access denied: cannot ${operation} on system path`)
    }
  }
  
  return resolved
}

// ─── IPC: File System Operations ───────────────────────────────────────────
ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
  try {
    const validatedPath = validateFsPath(dirPath, 'read directory')
    const entries = await fs.promises.readdir(validatedPath, { withFileTypes: true })
    return entries
      .filter((e) => e.name !== '.git' && e.name !== 'node_modules')
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
    const validatedPath = validateFsPath(filePath, 'read file')
    return await fs.promises.readFile(validatedPath, 'utf-8')
  } catch (err: any) {
    console.error('fs:readFile error:', err.message)
    return ''
  }
})

ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  try {
    const validatedPath = validateFsPath(filePath, 'write file')
    await fs.promises.writeFile(validatedPath, content, 'utf-8')
  } catch (err: any) {
    console.error('fs:writeFile error:', err.message)
    throw err
  }
})

ipcMain.handle('fs:stat', async (_e, filePath: string) => {
  try {
    const validatedPath = validateFsPath(filePath, 'stat')
    const stat = await fs.promises.stat(validatedPath)
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
    const validatedPath = validateFsPath(dirPath, 'create directory')
    await fs.promises.mkdir(validatedPath, { recursive: true })
  } catch (err: any) {
    console.error('fs:createDir error:', err.message)
    throw err
  }
})

// ─── IPC: Delete File/Directory ──────────────────────────────────────────
ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  try {
    const validatedPath = validateFsPath(targetPath, 'delete')
    const stat = await fs.promises.stat(validatedPath)
    if (stat.isDirectory()) {
      await fs.promises.rm(validatedPath, { recursive: true, force: true })
    } else {
      await fs.promises.unlink(validatedPath)
    }
  } catch (err: any) {
    console.error('fs:delete error:', err.message)
    throw err
  }
})

// ─── IPC: Rename/Move File ─────────────────────────────────────────────────
ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
  try {
    const validatedOld = validateFsPath(oldPath, 'rename (source)')
    const validatedNew = validateFsPath(newPath, 'rename (destination)')
    await fs.promises.rename(validatedOld, validatedNew)
  } catch (err: any) {
    console.error('fs:rename error:', err.message)
    throw err
  }
})

// ─── IPC: Shell Operations ───────────────────────────────────────────────
ipcMain.handle('shell:openPath', async (_e, targetPath: string) => {
  try {
    if (typeof targetPath !== 'string' || !targetPath.trim()) {
      throw new Error('Invalid path: must be a non-empty string')
    }
    validateFsPath(targetPath, 'open')
    await shell.openPath(targetPath)
  } catch (err: any) {
    console.error('shell:openPath error:', err.message)
    throw err
  }
})

ipcMain.handle('shell:openExternal', async (_e, url: string) => {
  try {
    if (typeof url !== 'string' || (!url.startsWith('https://') && !url.startsWith('http://'))) {
      throw new Error('Invalid URL: must start with http:// or https://')
    }
    await shell.openExternal(url)
  } catch (err: any) {
    console.error('shell:openExternal error:', err.message)
    throw err
  }
})

// ─── IPC: Tool Execution ──────────────────────────────────────────────────

// Security: Parse a command string into [executable, ...args] without using a shell.
// This avoids shell injection by never passing user input through cmd.exe/sh -c.
function parseCommand(command: string): { exe: string; args: string[] } {
  const tokens: string[] = []
  let current = ''
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (ch === ' ' && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = '' }
      continue
    }
    current += ch
  }
  if (current) tokens.push(current)

  if (tokens.length === 0) return { exe: '', args: [] }
  return { exe: tokens[0], args: tokens.slice(1) }
}

ipcMain.handle('tools:runCommand', async (_e, command: string, cwd: string) => {
  // Security: Validate command to prevent injection
  if (!command || typeof command !== 'string') {
    return { stdout: '', stderr: 'Invalid command: expected string', exitCode: -1 }
  }
  
  // Security: Block dangerous shell metacharacters
  if (DANGEROUS_SHELL_CHARS.test(command)) {
    return { stdout: '', stderr: 'Access denied: command contains dangerous characters', exitCode: -1 }
  }

  // Security: Block Windows environment variable expansion (%VAR%) and caret escapes (^)
  if (process.platform === 'win32' && (/%[^%]+%/.test(command) || command.includes('^'))) {
    return { stdout: '', stderr: 'Access denied: command contains shell expansion characters', exitCode: -1 }
  }
  
  // Security: Block commands that try to access system directories
  const systemPaths = ['C:\\Windows', '/usr', '/etc', '/bin', '/sbin', '/sys', '/proc']
  for (const sysPath of systemPaths) {
    if (command.toLowerCase().includes(sysPath.toLowerCase())) {
      return { stdout: '', stderr: 'Access denied: command references system paths', exitCode: -1 }
    }
  }

  const { exe, args } = parseCommand(command)
  if (!exe) {
    return { stdout: '', stderr: 'Invalid command: empty executable', exitCode: -1 }
  }
  
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
    // Spawn directly without a shell — prevents all shell injection vectors
    const child = spawn(exe, args, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
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
  // Security: Validate pattern to prevent ReDoS attacks
  const MAX_PATTERN_LENGTH = 500
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) {
    return { error: `Invalid search pattern. Must be between 1 and ${MAX_PATTERN_LENGTH} characters.` }
  }
  
  // Reject patterns that could cause catastrophic backtracking
  const dangerousPatterns = [
    /\([^)]*\+\+?[^{}]*\)\??[+*]/,  // (a+)+, (a*)+, etc.
    /\([^)]*\*\+?[^{}]*\)\??[+*]/,  // (a*)*, etc.
    /\([^)]*\+\+?[^{}]*\)\??\{/,    // Quantified groups with repetition
  ]
  
  for (const dangerous of dangerousPatterns) {
    if (dangerous.test(pattern)) {
      return { error: 'Invalid search pattern: pattern contains potentially dangerous repetition that could cause performance issues.' }
    }
  }
  
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
            
            // Create regex with timeout protection using try-catch
            let regex: RegExp
            try {
              regex = new RegExp(pattern, 'gi')
            } catch (e) {
              return { error: 'Invalid regex pattern: ' + (e as Error).message }
            }
            
            for (let i = 0; i < lines.length && results.length < maxResults; i++) {
              // Limit line length to prevent regex performance issues
              const line = lines[i].slice(0, 1000)
              if (regex.test(line)) {
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

// ─── IPC: Session Management (PTY for regular terminal) ────────────────────
ipcMain.handle('session:create', (_event, { id, cwd }: { id: string; cwd: string }) => {
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
      if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`session:data:${id}`, data)
      }
    })

    ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
      if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`session:exit:${id}`, exitCode)
      }
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
// Security: URL allowlist for API proxy requests to prevent SSRF
const ALLOWED_API_DOMAINS = new Set([
  'opencode.ai', 'api.z.ai',
  'api.openai.com', 'api.anthropic.com',
  'html.duckduckgo.com',
])

function isAllowedApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    // Check exact domain or subdomain match
    const hostname = parsed.hostname.toLowerCase()
    const domains = Array.from(ALLOWED_API_DOMAINS)
    for (let i = 0; i < domains.length; i++) {
      if (hostname === domains[i] || hostname.endsWith('.' + domains[i])) return true
    }
    return false
  } catch {
    return false
  }
}

ipcMain.handle('zen:request', async (_e, options: {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}) => {
  try {
    // Security: Validate URL against allowlist to prevent SSRF
    if (!isAllowedApiUrl(options.url)) {
      return {
        ok: false,
        status: 0,
        statusText: 'Access denied: URL domain is not in the allowed list',
        data: '',
        headers: {},
        error: 'URL domain not allowed. Add it to ALLOWED_API_DOMAINS if needed.',
      }
    }

    const response = await fetch(options.url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    })

    const text = await response.text()
    const resHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => { resHeaders[key] = value })
    
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data: text,
      headers: resHeaders,
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

// ─── IPC: MCP Marketplace ───────────────────────────────────────────────────
mcpService.initMCPService(STORE_DIR)

// Reconnect previously installed MCP servers in the background
mcpService.reconnectInstalledServers().catch(err => {
  console.warn('[Artemis MCP] Background reconnect failed:', err)
})

ipcMain.handle('mcp:getServers', () => mcpService.getServers())
ipcMain.handle('mcp:installServer', (_e, serverId: string, config?: Record<string, any>) =>
  mcpService.installServer(serverId, config))
ipcMain.handle('mcp:uninstallServer', (_e, serverId: string) =>
  mcpService.uninstallServer(serverId))
ipcMain.handle('mcp:searchServers', (_e, query: string) =>
  mcpService.searchServers(query))

// Custom MCP servers
ipcMain.handle('mcp:addCustomServer', (_e, server: any) =>
  mcpService.addCustomServer(server))
ipcMain.handle('mcp:removeCustomServer', (_e, serverId: string) =>
  mcpService.removeCustomServer(serverId))
ipcMain.handle('mcp:getCustomServers', () =>
  mcpService.getCustomServersList())

// MCP Server Logs
ipcMain.handle('mcp:getServerLogs', (_e, serverId: string) =>
  mcpService.getServerLogs(serverId))
ipcMain.handle('mcp:clearServerLogs', (_e, serverId: string) =>
  mcpService.clearServerLogs(serverId))
ipcMain.handle('mcp:getAllServerLogs', () =>
  mcpService.getAllServerLogs())

// Get connected MCP tools for system prompt injection
ipcMain.handle('mcp:getConnectedTools', () => {
  const tools = mcpClientManager.getAllTools()
  return tools.map((t: any) => ({
    name: t.name,
    description: t.description,
    serverId: t.serverId,
  }))
})

// Get per-server connection status
ipcMain.handle('mcp:getConnectionStatus', () => {
  const servers = mcpService.getServers()
  return servers
    .filter(s => s.installed)
    .map(s => {
      const client = mcpClientManager.get(s.id)
      return {
        id: s.id,
        name: s.name,
        connected: client?.connected || false,
        toolCount: client?.tools?.length || 0,
        tools: (client?.tools || []).map((t: any) => t.name),
      }
    })
})

// ─── IPC: Web Search (DuckDuckGo) ──────────────────────────────────────────
ipcMain.handle('webSearch:search', async (_e, query: string) => {
  return webSearch(query)
})

// ─── IPC: Linter Auto-Fix ──────────────────────────────────────────────────
ipcMain.handle('linter:lint', async (_e, filePath: string, projectPath: string) => {
  return lintFile(filePath, projectPath)
})

// ─── IPC: Discord RPC ──────────────────────────────────────────────────────
ipcMain.handle('discord:toggle', async (_e, enable: boolean) => {
  const result = await discordRPC.toggle(enable)
  // Persist Discord RPC enabled state so it survives restart
  store['discordRpcEnabled'] = enable
  saveStore(store)
  return result
})
ipcMain.handle('discord:getState', () => discordRPC.getState())
ipcMain.handle('discord:updatePresence', async (_e, fileName?: string, language?: string, projectName?: string) => {
  discordRPC.updatePresence(fileName, language, projectName)
})
ipcMain.handle('discord:detectDiscord', () => discordRPC.detectDiscord())
ipcMain.handle('discord:setDebug', (_e, enabled: boolean) => discordRPC.setDebugMode(enabled))

// ─── Agent API System ─────────────────────────────────────────────────────
// Register the new provider-agnostic agent IPC handlers.
// This wires up: agent:run, agent:abort, agent:getTools, agent:executeTool,
// agent:httpRequest, agent:httpStream, and agent:activeRuns.
registerAgentIPC(() => mainWindow)

// ─── App Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createWindow()

  // Restore Discord RPC if it was enabled before restart
  if (store['discordRpcEnabled'] === true) {
    console.log('[Artemis] Restoring Discord RPC from saved state...')
    discordRPC.toggle(true).catch((err) => {
      console.error('[Artemis] Failed to restore Discord RPC:', err)
    })
  }
})

app.on('before-quit', () => {
  isQuitting = true

  // Kill all PTY sessions FIRST to prevent data events to destroyed window
  for (const [_id, session] of Array.from(sessions)) {
    try { session.kill() } catch {}
  }
  sessions.clear()

  // Graceful shutdown: disconnect all MCP servers to prevent orphan processes
  mcpClientManager.disconnectAll()

  // Disconnect Discord RPC
  discordRPC.disconnect()
})

app.on('window-all-closed', () => {
  // Kill all PTY sessions
  for (const [_id, session] of Array.from(sessions)) {
    try { session.kill() } catch {}
  }
  sessions.clear()

  // Disconnect all MCP servers to prevent orphan processes
  mcpClientManager.disconnectAll()

  // Disconnect Discord RPC
  discordRPC.disconnect()

  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
