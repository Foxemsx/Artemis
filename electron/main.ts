import { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'
import safeRegex from 'safe-regex2'
import { registerAgentIPC } from './api'
import { webSearch } from './services/webSearchService'
import { lintFile } from './services/linterService'
import * as mcpService from './services/mcpService'
import { mcpClientManager } from './services/mcpClient'
import * as discordRPC from './services/discordRPCService'
import { inlineCompletionService } from './services/inlineCompletionService'
import * as checkpointService from './services/checkpointService'
import { initLogger, logError } from './shared/logger'
import {
  isAllowedApiUrl, PROVIDER_BASE_URLS,
  DANGEROUS_SHELL_CHARS, ALLOWED_EXECUTABLES, RUNTIME_EVAL_FLAGS,
  parseCommandTokens, validateFsPath, enforceProjectContainment,
} from './shared/security'

type Capability = 'terminal' | 'commands'

app.name = 'Artemis IDE'
if (process.platform === 'win32') {
  app.setAppUserModelId('Artemis IDE')
}

app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,Autofill')

let isQuitting = false

const STORE_DIR = path.join(app.getPath('userData'))
const STORE_PATH = path.join(STORE_DIR, 'artemis-settings.json')

// Initialize error-only crash logger (writes to {userData}/error.log)
initLogger(STORE_DIR)

let ptyModule: typeof import('node-pty') | null = null
try {
  ptyModule = require('node-pty')
} catch (e) {
  logError('main', 'node-pty failed to load', { error: String(e) })
}

const SENSITIVE_KEY_PREFIXES = ['apiKey:']

const STORE_SET_ALLOWLIST = new Set([
  'setupComplete',
  'pendingApiKeys',
  'lastProject',
  'recentProjects',
  'chatSessions',
  'activeModel',
  'agentMode',
  'editApprovalMode',
  'soundSettings',
  'keybinds',
  'theme',
  'baseUrl:ollama',
])

const STORE_SET_PREFIX_ALLOWLIST = [
  'apiKey:',
  'messages-',
  'tokenUsage-',
  'baseUrl:',
]

function isStoreKeyAllowed(key: string): boolean {
  if (STORE_SET_ALLOWLIST.has(key)) return true
  return STORE_SET_PREFIX_ALLOWLIST.some(prefix => key.startsWith(prefix))
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))
}

let plaintextWarningShown = false

function encryptValue(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    if (!plaintextWarningShown) {
      plaintextWarningShown = true
      console.warn('[Artemis] ⚠ safeStorage encryption NOT available — refusing to store API keys.')
      console.warn('[Artemis] Ensure your OS keychain/credential manager is configured.')
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('security:plaintextWarning')
      }
    }
    throw new Error('Encryption unavailable: cannot store sensitive value without OS keychain. Please configure your system credential manager.')
  }
  const encrypted = safeStorage.encryptString(value)
  return 'enc:' + encrypted.toString('base64')
}

function decryptValue(stored: string): string {
  if (!stored.startsWith('enc:')) {
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

let saveStoreTimer: ReturnType<typeof setTimeout> | null = null
let saveStorePending = false

function saveStore(data: Record<string, any>) {
  saveStorePending = true
  if (saveStoreTimer) return // already scheduled
  saveStoreTimer = setTimeout(() => {
    saveStoreTimer = null
    if (!saveStorePending) return
    saveStorePending = false
    try {
      const tmpPath = STORE_PATH + '.tmp'
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
      fs.renameSync(tmpPath, STORE_PATH)
    } catch (e) {
      logError('store', 'Failed to save store', { error: String(e) })
    }
  }, 100)
}

// Flush pending store writes synchronously (called on app quit)
function flushStore(data: Record<string, any>) {
  if (saveStoreTimer) {
    clearTimeout(saveStoreTimer)
    saveStoreTimer = null
  }
  try {
    const tmpPath = STORE_PATH + '.tmp'
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
    fs.renameSync(tmpPath, STORE_PATH)
  } catch (e) {
    logError('store', 'Failed to flush store', { error: String(e) })
  }
}

let store = loadStore()

let trustedFolders: Set<string> = new Set(
  Array.isArray(store['trustedFolders'])
    ? store['trustedFolders']
      .filter((p: any) => typeof p === 'string' && p.trim().length > 0)
      .map((p: string) => path.resolve(p).toLowerCase())
    : []
)

function isFolderTrusted(folderPath: string): boolean {
  const resolved = path.resolve(folderPath).toLowerCase()
  return trustedFolders.has(resolved)
}

function grantTrust(folderPath: string): void {
  const resolved = path.resolve(folderPath).toLowerCase()
  trustedFolders.add(resolved)
  store['trustedFolders'] = Array.from(trustedFolders)
  saveStore(store)
  updateCapabilitiesForActiveProject()
}

function revokeTrust(folderPath: string): void {
  const resolved = path.resolve(folderPath).toLowerCase()
  trustedFolders.delete(resolved)
  store['trustedFolders'] = Array.from(trustedFolders)
  saveStore(store)
  updateCapabilitiesForActiveProject()
}

const sessions = new Map<string, import('node-pty').IPty>()
const MAX_PTY_SESSIONS = 20

let mainWindow: BrowserWindow | null = null

let activeProjectPath: string | null = null

const capabilities: Record<Capability, boolean> = {
  terminal: false,
  commands: false,
}

function updateCapabilitiesForActiveProject(): void {
  const trusted = activeProjectPath ? isFolderTrusted(activeProjectPath) : false
  capabilities.terminal = trusted
  capabilities.commands = trusted
}

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
      sandbox: true,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (process.env.VITE_DEV_SERVER_URL) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const appOrigin = process.env.VITE_DEV_SERVER_URL || 'file://'
    if (!url.startsWith(appOrigin)) {
      event.preventDefault()
      if (url.startsWith('http://') || url.startsWith('https://')) {
        shell.openExternal(url)
      }
    }
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

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

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          `default-src 'self' blob: data:; ` +
          `script-src 'self' ${process.env.VITE_DEV_SERVER_URL ? "'unsafe-inline' " : ""}blob:; ` +
          `worker-src 'self' blob:; ` +
          `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; ` +
          `style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com; ` +
          `font-src 'self' https://fonts.gstatic.com data:; ` +
          `img-src 'self' data: https: blob:; ` +
          `connect-src 'self' https://opencode.ai https://*.opencode.ai https://api.z.ai https://*.z.ai https://api.openai.com https://api.anthropic.com https://openrouter.ai https://*.openrouter.ai https://generativelanguage.googleapis.com https://api.deepseek.com https://api.groq.com https://api.mistral.ai https://api.moonshot.cn https://api.perplexity.ai https://api.synthetic.new https://html.duckduckgo.com https://webcache.googleusercontent.com http://localhost:11434; ` +
          `object-src 'none'; ` +
          `frame-ancestors 'none'; ` +
          `base-uri 'self';`
        ]
      }
    })
  })
}

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

ipcMain.handle('store:get', (_e, key: string) => {
  const raw = store[key]
  if (isSensitiveKey(key) && typeof raw === 'string' && raw) {
    return decryptValue(raw)
  }
  return raw
})

ipcMain.handle('store:set', (_e, key: string, value: any) => {
  if (!isStoreKeyAllowed(key)) {
    throw new Error(`Access denied: store key '${key}' is not writable from the renderer`)
  }
  if (isSensitiveKey(key) && typeof value === 'string' && value) {
    store[key] = encryptValue(value)
    const providerMatch = key.match(/^apiKey:(.+)$/)
    if (providerMatch) {
      inlineCompletionService.setApiKey(providerMatch[1], value)
    }
  } else {
    store[key] = value
  }
  saveStore(store)
})

ipcMain.handle('store:delete', (_e, key: string) => {
  if (!isStoreKeyAllowed(key)) {
    throw new Error(`Access denied: store key '${key}' is not writable from the renderer`)
  }
  delete store[key]
  saveStore(store)
})

ipcMain.handle('store:getDir', () => {
  return STORE_DIR
})

ipcMain.handle('store:isEncrypted', () => {
  return safeStorage.isEncryptionAvailable()
})

ipcMain.handle('security:getCapabilities', () => {
  return { ...capabilities }
})

ipcMain.handle('security:requestCapability', async (_e, capRaw: string) => {
  const cap = (capRaw || '').toLowerCase() as Capability
  if (cap !== 'terminal' && cap !== 'commands') return false
  return capabilities[cap]
})

ipcMain.handle('trust:check', (_e, folderPath: string) => {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return false
  return isFolderTrusted(folderPath)
})

ipcMain.handle('trust:grant', (_e, folderPath: string) => {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return false
  grantTrust(folderPath)
  return true
})

ipcMain.handle('trust:revoke', (_e, folderPath: string) => {
  if (typeof folderPath !== 'string' || !folderPath.trim()) return false
  revokeTrust(folderPath)
  return true
})

ipcMain.handle('project:setPath', (_e, projectPath: string) => {
  if (typeof projectPath === 'string' && projectPath.trim().length > 0) {
    activeProjectPath = path.resolve(projectPath)
    updateCapabilitiesForActiveProject()
    return true
  }
  return false
})

ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Project Folder',
  })

  if (result.canceled || result.filePaths.length === 0) return null

  const folderPath = result.filePaths[0]
  activeProjectPath = path.resolve(folderPath)
  updateCapabilitiesForActiveProject()
  return { path: folderPath, name: path.basename(folderPath) }
})

// Security constants (DANGEROUS_SHELL_CHARS, ALLOWED_EXECUTABLES, validateFsPath,
// enforceProjectContainment, etc.) are imported from ./shared/security

function enforceProjectContainmentLocal(resolved: string, operation: string): void {
  if (resolved.toLowerCase() === STORE_PATH.toLowerCase()) {
    throw new Error(`Access denied: cannot ${operation} on application settings file`)
  }
  enforceProjectContainment(resolved, operation, activeProjectPath)
}

ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
  try {
    const validatedPath = validateFsPath(dirPath, 'read directory')
    enforceProjectContainmentLocal(validatedPath, 'read directory')
    const entries = await fs.promises.readdir(validatedPath, { withFileTypes: true })
    return entries
      .filter((e) => e.name !== '.git' && e.name !== 'node_modules')
      .map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' as const : 'file' as const,
      }))
      .sort((a, b) => {
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
    enforceProjectContainmentLocal(validatedPath, 'read file')
    return await fs.promises.readFile(validatedPath, 'utf-8')
  } catch (err: any) {
    console.error('fs:readFile error:', err.message)
    return ''
  }
})

ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  try {
    const validatedPath = validateFsPath(filePath, 'write file')
    enforceProjectContainmentLocal(validatedPath, 'write file')
    const tmpPath = validatedPath + '.tmp.' + Date.now()
    try {
      await fs.promises.writeFile(tmpPath, content, 'utf-8')
      await fs.promises.rename(tmpPath, validatedPath)
    } catch (err) {
      try { await fs.promises.unlink(tmpPath) } catch {}
      throw err
    }
  } catch (err: any) {
    console.error('fs:writeFile error:', err.message)
    throw err
  }
})

ipcMain.handle('fs:stat', async (_e, filePath: string) => {
  try {
    const validatedPath = validateFsPath(filePath, 'stat')
    enforceProjectContainmentLocal(validatedPath, 'stat')
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

ipcMain.handle('fs:createDir', async (_e, dirPath: string) => {
  try {
    const validatedPath = validateFsPath(dirPath, 'create directory')
    enforceProjectContainmentLocal(validatedPath, 'create directory')
    await fs.promises.mkdir(validatedPath, { recursive: true })
  } catch (err: any) {
    console.error('fs:createDir error:', err.message)
    throw err
  }
})

ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  try {
    const validatedPath = validateFsPath(targetPath, 'delete')
    enforceProjectContainmentLocal(validatedPath, 'delete')
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

ipcMain.handle('fs:rename', async (_e, oldPath: string, newPath: string) => {
  try {
    const validatedOld = validateFsPath(oldPath, 'rename (source)')
    const validatedNew = validateFsPath(newPath, 'rename (destination)')
    enforceProjectContainmentLocal(validatedOld, 'rename (source)')
    enforceProjectContainmentLocal(validatedNew, 'rename (destination)')
    await fs.promises.rename(validatedOld, validatedNew)
  } catch (err: any) {
    console.error('fs:rename error:', err.message)
    throw err
  }
})

ipcMain.handle('shell:openPath', async (_e, targetPath: string) => {
  try {
    if (typeof targetPath !== 'string' || !targetPath.trim()) {
      throw new Error('Invalid path: must be a non-empty string')
    }
    const resolved = validateFsPath(targetPath, 'open')
    enforceProjectContainmentLocal(resolved, 'open')
    await shell.openPath(resolved)
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

// parseCommand replaced by parseCommandTokens from ./shared/security

ipcMain.handle('tools:runCommand', async (_e, command: string, cwd: string) => {
  if (!capabilities.commands) {
    return { stdout: '', stderr: 'Permission denied: command execution is disabled. Enable it when prompted.', exitCode: -1 }
  }

  if (!command || typeof command !== 'string') {
    return { stdout: '', stderr: 'Invalid command: expected string', exitCode: -1 }
  }
  
  if (DANGEROUS_SHELL_CHARS.test(command)) {
    return { stdout: '', stderr: 'Access denied: command contains dangerous characters', exitCode: -1 }
  }

  if (process.platform === 'win32' && (/%[^%]+%/.test(command) || command.includes('^'))) {
    return { stdout: '', stderr: 'Access denied: command contains shell expansion characters', exitCode: -1 }
  }
  
  const systemPaths = ['C:\\Windows', '/usr', '/etc', '/bin', '/sbin', '/sys', '/proc']
  for (const sysPath of systemPaths) {
    if (command.toLowerCase().includes(sysPath.toLowerCase())) {
      return { stdout: '', stderr: 'Access denied: command references system paths', exitCode: -1 }
    }
  }

  if (cwd && typeof cwd === 'string') {
    try {
      validateFsPath(cwd, 'execute command in')
      enforceProjectContainmentLocal(path.resolve(cwd), 'execute command in')
    } catch (err: any) {
      return { stdout: '', stderr: `Invalid cwd: ${err.message}`, exitCode: -1 }
    }
  }

  const { exe, args } = parseCommandTokens(command)
  if (!exe) {
    return { stdout: '', stderr: 'Invalid command: empty executable', exitCode: -1 }
  }

  const exeBasename = path.basename(exe).replace(/\.(cmd|bat|exe|sh)$/i, '').toLowerCase()
  if (!ALLOWED_EXECUTABLES.has(exeBasename)) {
    return { stdout: '', stderr: `Access denied: executable '${exe}' is not in the allowed list`, exitCode: -1 }
  }

  const dangerousFlags = RUNTIME_EVAL_FLAGS[exeBasename]
  if (dangerousFlags) {
    const lowerArgs = args.map(a => a.toLowerCase())
    for (const flag of dangerousFlags) {
      if (lowerArgs.includes(flag)) {
        return { stdout: '', stderr: `Access denied: '${flag}' flag is not allowed for '${exeBasename}' to prevent arbitrary code execution`, exitCode: -1 }
      }
    }
  }
  
  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
    const child = spawn(exe, args, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    
    let stdout = ''
    let stderr = ''
    const MAX_STDOUT = 50000
    const MAX_STDERR = 10000
    
    child.stdout?.on('data', (data: Buffer) => {
      if (stdout.length < MAX_STDOUT) stdout += data.toString()
    })
    child.stderr?.on('data', (data: Buffer) => {
      if (stderr.length < MAX_STDERR) stderr += data.toString()
    })
    
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

ipcMain.handle('git:run', async (_e, args: string[], cwd: string) => {
  if (!capabilities.commands) {
    return { stdout: '', stderr: 'Permission denied: command execution is disabled.', exitCode: -1 }
  }
  if (!Array.isArray(args) || args.length === 0) {
    return { stdout: '', stderr: 'Invalid git args', exitCode: -1 }
  }

  const blockedArgs = new Set([
    '-c',
    '--config',
    '--config-env',
    '--exec-path',
    '--upload-pack',
    '--receive-pack',
    '--git-dir',
    '--work-tree',
    '-C',
  ])
  for (const arg of args) {
    const lower = arg.toLowerCase()
    if (blockedArgs.has(arg) || blockedArgs.has(lower)) {
      return { stdout: '', stderr: `Access denied: git argument '${arg}' is not allowed`, exitCode: -1 }
    }
    if (lower.startsWith('-c') && lower !== '-c') {
      return { stdout: '', stderr: `Access denied: git argument '${arg}' is not allowed`, exitCode: -1 }
    }
    const blockedPrefixes = [
      '--config=',
      '--config-env=',
      '--exec-path=',
      '--upload-pack=',
      '--receive-pack=',
      '--git-dir=',
      '--work-tree=',
    ]
    if (blockedPrefixes.some(p => lower.startsWith(p))) {
      return { stdout: '', stderr: `Access denied: git argument '${arg}' is not allowed`, exitCode: -1 }
    }
  }
  if (cwd && typeof cwd === 'string') {
    try {
      validateFsPath(cwd, 'run git in')
      enforceProjectContainmentLocal(path.resolve(cwd), 'run git in')
    } catch (err: any) {
      return { stdout: '', stderr: `Invalid cwd: ${err.message}`, exitCode: -1 }
    }
  }

  return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
    const child = spawn('git', args, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (data: Buffer) => { if (stdout.length < 50000) stdout += data.toString() })
    child.stderr?.on('data', (data: Buffer) => { if (stderr.length < 10000) stderr += data.toString() })
    const timeout = setTimeout(() => { child.kill(); resolve({ stdout, stderr: 'Git command timed out', exitCode: -1 }) }, 60000)
    child.on('close', (code: number | null) => { clearTimeout(timeout); resolve({ stdout, stderr, exitCode: code ?? -1 }) })
    child.on('error', (err: Error) => { clearTimeout(timeout); resolve({ stdout: '', stderr: err.message, exitCode: -1 }) })
  })
})

ipcMain.handle('tools:searchFiles', async (_e, pattern: string, dirPath: string) => {
  const MAX_PATTERN_LENGTH = 500
  if (!pattern || pattern.length > MAX_PATTERN_LENGTH) {
    return { error: `Invalid search pattern. Must be between 1 and ${MAX_PATTERN_LENGTH} characters.` }
  }
  
  try {
    if (!safeRegex(pattern)) {
      return { error: 'Invalid search pattern: regex may cause excessive backtracking.' }
    }
  } catch {
    // If validation fails, fall back to existing regex error handling later
  }
  
  let validatedDir = ''
  try {
    validatedDir = validateFsPath(dirPath, 'search files')
    enforceProjectContainmentLocal(validatedDir, 'search files')
  } catch (err: any) {
    return { error: `Invalid search path: ${err.message}` }
  }

  let regex: RegExp
  try {
    let normalizedPattern = pattern
    let flags = 'g'
    if (normalizedPattern.startsWith('(?i)')) {
      normalizedPattern = normalizedPattern.slice(4)
      flags += 'i'
    } else {
      flags += 'i'
    }
    regex = new RegExp(normalizedPattern, flags)
  } catch (e) {
    return { error: 'Invalid regex pattern: ' + (e as Error).message }
  }
  
  const results: { file: string; line: number; text: string }[] = []
  const maxResults = 50
  const maxDepth = 8
  const maxConcurrency = 12
  
  const ignoreDirs = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
    '.venv', 'venv', '.cache', 'coverage', '.idea', '.vscode',
  ])
  
  const filePaths: string[] = []

  async function collectFiles(dir: string, depth: number) {
    if (depth > maxDepth) return
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!ignoreDirs.has(entry.name) && !entry.name.startsWith('.')) {
            await collectFiles(fullPath, depth + 1)
          }
        } else if (entry.isFile()) {
          filePaths.push(fullPath)
        }
      }
    } catch {}
  }

  await collectFiles(validatedDir, 0)

  let fileIndex = 0
  async function worker() {
    while (fileIndex < filePaths.length && results.length < maxResults) {
      const idx = fileIndex++
      const fullPath = filePaths[idx]
      try {
        const stat = await fs.promises.stat(fullPath)
        if (stat.size > 500000) continue
      } catch { continue }

      try {
        const content = await fs.promises.readFile(fullPath, 'utf-8')
        const lines = content.split('\n')

        for (let i = 0; i < lines.length && results.length < maxResults; i++) {
          const line = lines[i].slice(0, 1000)
          if (regex.test(line)) {
            results.push({
              file: fullPath,
              line: i + 1,
              text: lines[i].trim().slice(0, 200),
            })
          }
          regex.lastIndex = 0
        }
      } catch {}
    }
  }

  await Promise.all(Array.from({ length: maxConcurrency }, () => worker()))
  return results
})

ipcMain.handle('session:create', (_event, { id, cwd }: { id: string; cwd: string }) => {
  if (!capabilities.terminal) {
    return { error: 'Permission denied: terminal is disabled. Enable it when prompted.' }
  }

  if (!ptyModule) {
    return { error: 'Terminal engine (node-pty) is not available. Please reinstall dependencies.' }
  }

  if (sessions.size >= MAX_PTY_SESSIONS) {
    return { error: `Maximum terminal sessions reached (${MAX_PTY_SESSIONS}). Close an existing terminal first.` }
  }
  
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{3,64}$/.test(id)) {
    return { error: 'Invalid session id: must be 3-64 chars (letters, numbers, hyphen, underscore).' }
  }
  
  if (sessions.has(id)) {
    return { error: `Session id already in use: ${id}` }
  }

  try {
    validateFsPath(cwd, 'create terminal session in')
    enforceProjectContainmentLocal(path.resolve(cwd), 'create terminal session in')
  } catch (err: any) {
    return { error: `Access denied: ${err.message}` }
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
  if (!capabilities.terminal) return
  sessions.get(id)?.write(data)
})

ipcMain.handle('session:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
  if (!capabilities.terminal) return
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

// Periodic PTY dead session cleanup — every 60s, remove sessions whose process has exited
setInterval(() => {
  for (const [id, session] of Array.from(sessions)) {
    try {
      // node-pty process exposes pid; check if still alive
      if (session.pid) {
        try {
          process.kill(session.pid, 0) // signal 0 = existence check, no actual kill
        } catch {
          // process.kill throws if PID doesn't exist — session is dead
          sessions.delete(id)
        }
      }
    } catch {
      sessions.delete(id)
    }
  }
}, 60_000)

// ALLOWED_API_DOMAINS and isAllowedApiUrl imported from ./shared/security

ipcMain.handle('zen:request', async (_e, options: {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}) => {
  try {
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

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    let response: Response
    try {
      response = await fetch(options.url, {
        method: options.method,
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

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
      statusText: err.name === 'AbortError' ? 'Request timed out' : (err.message || 'Network error'),
      data: '',
      headers: {},
      error: err.message,
    }
  }
})

checkpointService.initCheckpointService(STORE_DIR)

ipcMain.handle('checkpoint:create', async (_e, sessionId: string, messageId: string, label: string, projectPath: string, filesToTrack?: string[]) => {
  try {
    const validatedProject = validateFsPath(projectPath, 'create checkpoint')
    enforceProjectContainmentLocal(validatedProject, 'create checkpoint')
    let validatedFiles: string[] | undefined
    if (Array.isArray(filesToTrack) && filesToTrack.length > 0) {
      validatedFiles = filesToTrack.map((p) => {
        const validated = validateFsPath(p, 'create checkpoint file')
        enforceProjectContainmentLocal(validated, 'create checkpoint file')
        return validated
      })
    }
    return checkpointService.createCheckpoint(sessionId, messageId, label, validatedProject, validatedFiles)
  } catch (err: any) {
    throw err
  }
})

ipcMain.handle('checkpoint:restore', async (_e, sessionId: string, checkpointId: string) => {
  if (!activeProjectPath) {
    return { restored: 0, errors: ['No active project directory'] }
  }
  return checkpointService.restoreCheckpoint(sessionId, checkpointId, activeProjectPath)
})

ipcMain.handle('checkpoint:list', async (_e, sessionId: string) => {
  return checkpointService.listCheckpoints(sessionId)
})

ipcMain.handle('checkpoint:delete', async (_e, sessionId: string, checkpointId?: string) => {
  return checkpointService.deleteCheckpoint(sessionId, checkpointId)
})


ipcMain.handle('mcp:getServers', () => mcpService.getServers())
ipcMain.handle('mcp:installServer', (_e, serverId: string, config?: Record<string, any>) =>
  mcpService.installServer(serverId, config))
ipcMain.handle('mcp:uninstallServer', (_e, serverId: string) =>
  mcpService.uninstallServer(serverId))
ipcMain.handle('mcp:searchServers', (_e, query: string) =>
  mcpService.searchServers(query))

ipcMain.handle('mcp:addCustomServer', (_e, server: any) =>
  mcpService.addCustomServer(server))
ipcMain.handle('mcp:removeCustomServer', (_e, serverId: string) =>
  mcpService.removeCustomServer(serverId))
ipcMain.handle('mcp:getCustomServers', () =>
  mcpService.getCustomServersList())

ipcMain.handle('mcp:getServerLogs', (_e, serverId: string) =>
  mcpService.getServerLogs(serverId))
ipcMain.handle('mcp:clearServerLogs', (_e, serverId: string) =>
  mcpService.clearServerLogs(serverId))
ipcMain.handle('mcp:getAllServerLogs', () =>
  mcpService.getAllServerLogs())

ipcMain.handle('mcp:getConnectedTools', () => {
  const tools = mcpClientManager.getAllTools()
  return tools.map((t: any) => ({
    name: t.name,
    description: t.description,
    serverId: t.serverId,
  }))
})

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

ipcMain.handle('webSearch:search', async (_e, query: string) => {
  return webSearch(query)
})

ipcMain.handle('fetchUrl:fetch', async (_e, url: string) => {
  const { fetchUrl } = await import('./services/urlFetchService')
  return fetchUrl(url)
})

ipcMain.handle('linter:lint', async (_e, filePath: string, projectPath: string) => {
  try {
    const validatedFile = validateFsPath(filePath, 'lint file')
    const validatedProject = validateFsPath(projectPath, 'lint project')
    enforceProjectContainmentLocal(validatedFile, 'lint file')
    enforceProjectContainmentLocal(validatedProject, 'lint project')
    return lintFile(validatedFile, validatedProject)
  } catch (err: any) {
    return { file: filePath, diagnostics: [], error: err.message || 'Invalid lint path' }
  }
})

ipcMain.handle('discord:toggle', async (_e, enable: boolean) => {
  const result = await discordRPC.toggle(enable)
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

;(() => {
  try {
    const saved = store['inlineCompletionConfig'] as any
    if (saved) {
      inlineCompletionService.setConfig(saved)
      if (saved.provider === 'ollama') {
        const baseUrl = store['baseUrl:ollama'] as string
        if (baseUrl) inlineCompletionService.setBaseUrl('ollama', baseUrl)
      }
    }
  } catch {}
})()

ipcMain.handle('inlineCompletion:complete', async (_e, request) => {
  try {
    return await inlineCompletionService.complete(request)
  } catch (err: any) {
    logError('inlineCompletion', 'Completion error', { error: err.message })
    return { completion: '' }
  }
})

ipcMain.handle('inlineCompletion:getConfig', () => {
  return inlineCompletionService.getConfig()
})

ipcMain.handle('inlineCompletion:setConfig', async (_e, config) => {
  inlineCompletionService.setConfig(config)
  store['inlineCompletionConfig'] = inlineCompletionService.getConfig()
  saveStore(store)

  if (config.provider) {
    const keyStoreKey = `apiKey:${config.provider}`
    const encryptedKey = store[keyStoreKey]
    if (encryptedKey && typeof encryptedKey === 'string') {
      try {
        const decrypted = decryptValue(encryptedKey)
        if (decrypted) inlineCompletionService.setApiKey(config.provider, decrypted)
      } catch (err) {
        logError('inlineCompletion', 'Failed to decrypt API key on config change', { error: String(err) })
      }
    }
    if (config.provider === 'ollama') {
      const baseUrl = store['baseUrl:ollama'] as string
      if (baseUrl) inlineCompletionService.setBaseUrl('ollama', baseUrl)
    }
  }
})

ipcMain.handle('inlineCompletion:fetchModels', async (_e, providerId: string) => {
  // PROVIDER_BASE_URLS imported from ./shared/security

  try {
    const customUrl = store[`baseUrl:${providerId}`] as string | undefined
    const baseUrl = customUrl || PROVIDER_BASE_URLS[providerId] || ''
    if (!baseUrl) return { models: [], error: 'Unknown provider' }

    let apiKey = ''
    const encKey = store[`apiKey:${providerId}`]
    if (encKey && typeof encKey === 'string') {
      try {
        apiKey = decryptValue(encKey)
      } catch {
        apiKey = ''
      }
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey && providerId !== 'ollama') {
      headers['Authorization'] = `Bearer ${apiKey}`
    }
    if (providerId === 'openrouter') {
      headers['HTTP-Referer'] = 'https://artemis.ide'
      headers['X-Title'] = 'Artemis IDE'
    }

    const { net } = require('electron')
    const result = await new Promise<{ ok: boolean; data: any }>((resolve) => {
      const req = net.request({ method: 'GET', url: `${baseUrl}/models` })
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)
      let body = ''
      req.on('response', (res: any) => {
        res.on('data', (chunk: Buffer) => { body += chunk.toString() })
        res.on('end', () => {
          try {
            resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data: JSON.parse(body) })
          } catch { resolve({ ok: false, data: null }) }
        })
      })
      req.on('error', () => resolve({ ok: false, data: null }))
      setTimeout(() => { req.abort(); resolve({ ok: false, data: null }) }, 15000)
      req.end()
    })

    if (!result.ok || !result.data) return { models: [], error: 'Failed to fetch models' }

    const raw = Array.isArray(result.data) ? result.data : (result.data?.data && Array.isArray(result.data.data) ? result.data.data : [])
    const models = raw
      .filter((m: any) => m.id)
      .map((m: any) => ({ id: m.id, name: m.name || m.id }))

    return { models }
  } catch (err: any) {
    return { models: [], error: err.message }
  }
})

registerAgentIPC(() => mainWindow)

app.whenReady().then(async () => {
  createWindow()

  mcpService.initMCPService(STORE_DIR)
  mcpService.reconnectInstalledServers().catch(err => {
    console.warn('[Artemis MCP] Background reconnect failed:', err)
  })

  try {
    const inlineConfig = store['inlineCompletionConfig'] as any
    if (inlineConfig?.provider && inlineConfig.provider !== 'ollama') {
      const encryptedKey = store[`apiKey:${inlineConfig.provider}`]
      if (encryptedKey && typeof encryptedKey === 'string') {
        const decrypted = decryptValue(encryptedKey)
        if (decrypted) inlineCompletionService.setApiKey(inlineConfig.provider, decrypted)
      }
    }
  } catch (err) {
    logError('inlineCompletion', 'Failed to sync API key on ready', { error: String(err) })
  }

  if (store['discordRpcEnabled'] === true) {
    console.log('[Artemis] Restoring Discord RPC from saved state...')
    discordRPC.toggle(true).catch((err) => {
      logError('discord', 'Failed to restore Discord RPC', { error: String(err) })
    })
  }
})

app.on('before-quit', () => {
  isQuitting = true

  // Flush any pending store writes before quitting
  flushStore(store)

  for (const [_id, session] of Array.from(sessions)) {
    try { session.kill() } catch {}
  }
  sessions.clear()

  mcpClientManager.disconnectAll()

  discordRPC.disconnect()
})

app.on('window-all-closed', () => {
  for (const [_id, session] of Array.from(sessions)) {
    try { session.kill() } catch {}
  }
  sessions.clear()

  mcpClientManager.disconnectAll()

  discordRPC.disconnect()

  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
