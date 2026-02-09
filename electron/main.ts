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
import { inlineCompletionService } from './services/inlineCompletionService'

type Capability = 'terminal' | 'commands'

app.name = 'Artemis IDE'
if (process.platform === 'win32') {
  app.setAppUserModelId('Artemis IDE')
}

app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,Autofill')

let isQuitting = false

let ptyModule: typeof import('node-pty') | null = null
try {
  ptyModule = require('node-pty')
} catch (e) {
  console.error('node-pty failed to load:', e)
}

const STORE_DIR = path.join(app.getPath('userData'))
const STORE_PATH = path.join(STORE_DIR, 'artemis-settings.json')

const SENSITIVE_KEY_PREFIXES = ['apiKey:']

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

function saveStore(data: Record<string, any>) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Failed to save store:', e)
  }
}

let store = loadStore()

let trustedFolders: Set<string> = new Set(
  Array.isArray(store['trustedFolders']) ? store['trustedFolders'] : []
)

function isFolderTrusted(folderPath: string): boolean {
  const resolved = path.resolve(folderPath).toLowerCase()
  const folders = Array.from(trustedFolders)
  for (let i = 0; i < folders.length; i++) {
    if (resolved === folders[i].toLowerCase()) return true
  }
  return false
}

function grantTrust(folderPath: string): void {
  const resolved = path.resolve(folderPath)
  trustedFolders.add(resolved)
  store['trustedFolders'] = Array.from(trustedFolders)
  saveStore(store)
  capabilities.terminal = true
  capabilities.commands = true
}

function revokeTrust(folderPath: string): void {
  const resolved = path.resolve(folderPath)
  trustedFolders.delete(resolved)
  const folders = Array.from(trustedFolders)
  for (let i = 0; i < folders.length; i++) {
    if (folders[i].toLowerCase() === resolved.toLowerCase()) {
      trustedFolders.delete(folders[i])
    }
  }
  store['trustedFolders'] = Array.from(trustedFolders)
  saveStore(store)
  capabilities.terminal = false
  capabilities.commands = false
}

const sessions = new Map<string, import('node-pty').IPty>()
const MAX_PTY_SESSIONS = 20

let mainWindow: BrowserWindow | null = null

let activeProjectPath: string | null = null

const capabilities: Record<Capability, boolean> = {
  terminal: false,
  commands: false,
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
    if (isFolderTrusted(projectPath)) {
      capabilities.terminal = true
      capabilities.commands = true
    } else {
      capabilities.terminal = false
      capabilities.commands = false
    }
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
  return { path: folderPath, name: path.basename(folderPath) }
})

const DANGEROUS_SHELL_CHARS = /[;&|`$(){}[\]<>\n\r]/

const ALLOWED_EXECUTABLES = new Set([
  'npm', 'npx', 'yarn', 'pnpm', 'bun', 'bunx', 'deno', 'node', 'tsx', 'ts-node',
  'git',
  'tsc', 'vite', 'webpack', 'esbuild', 'rollup', 'turbo', 'nx',
  'eslint', 'prettier', 'biome',
  'python', 'python3', 'pip', 'pip3', 'cargo', 'rustc', 'go', 'java', 'javac', 'ruby', 'gem',
  'cat', 'echo', 'ls', 'dir', 'find', 'grep', 'rg', 'sed', 'awk', 'head', 'tail', 'wc',
  'mkdir', 'rm', 'cp', 'mv', 'touch', 'chmod',
  'docker', 'docker-compose', 'podman',
  'jest', 'vitest', 'mocha', 'pytest',
])

function validateFsPath(filePath: string, operation: string): string {
  if (typeof filePath !== 'string') {
    throw new Error(`Invalid path: expected string, got ${typeof filePath}`)
  }
  
  if (!filePath || filePath.trim().length === 0) {
    throw new Error('Invalid path: empty path')
  }
  
  if (filePath.startsWith('\\\\') || filePath.startsWith('//')) {
    throw new Error('Access denied: UNC paths are not allowed')
  }
  
  if (filePath.startsWith('\\?\\')) {
    throw new Error('Access denied: Extended paths are not allowed')
  }
  
  if (filePath.includes('\0')) {
    throw new Error('Access denied: null bytes in path')
  }
  
  const resolved = path.resolve(filePath)
  
  if (resolved.startsWith('\\\\') || resolved.startsWith('//')) {
    throw new Error('Access denied: UNC paths are not allowed')
  }
  
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

function enforceProjectContainment(resolved: string, operation: string): void {
  const normalizedResolved = resolved.toLowerCase()

  const userDataDir = app.getPath('userData').toLowerCase()
  const userDataPrefix = userDataDir + path.sep.toLowerCase()
  if (normalizedResolved === userDataDir || normalizedResolved.startsWith(userDataPrefix)) return

  if (!activeProjectPath) {
    throw new Error(`Access denied: cannot ${operation} without an active project directory`)
  }

  const normalizedProject = path.resolve(activeProjectPath).toLowerCase()
  const projectPrefix = normalizedProject + path.sep.toLowerCase()
  if (normalizedResolved !== normalizedProject && !normalizedResolved.startsWith(projectPrefix)) {
    throw new Error(`Access denied: cannot ${operation} outside the active project directory`)
  }
}

ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
  try {
    const validatedPath = validateFsPath(dirPath, 'read directory')
    enforceProjectContainment(validatedPath, 'read directory')
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
    enforceProjectContainment(validatedPath, 'read file')
    return await fs.promises.readFile(validatedPath, 'utf-8')
  } catch (err: any) {
    console.error('fs:readFile error:', err.message)
    return ''
  }
})

ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  try {
    const validatedPath = validateFsPath(filePath, 'write file')
    enforceProjectContainment(validatedPath, 'write file')
    await fs.promises.writeFile(validatedPath, content, 'utf-8')
  } catch (err: any) {
    console.error('fs:writeFile error:', err.message)
    throw err
  }
})

ipcMain.handle('fs:stat', async (_e, filePath: string) => {
  try {
    const validatedPath = validateFsPath(filePath, 'stat')
    enforceProjectContainment(validatedPath, 'stat')
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
    enforceProjectContainment(validatedPath, 'create directory')
    await fs.promises.mkdir(validatedPath, { recursive: true })
  } catch (err: any) {
    console.error('fs:createDir error:', err.message)
    throw err
  }
})

ipcMain.handle('fs:delete', async (_e, targetPath: string) => {
  try {
    const validatedPath = validateFsPath(targetPath, 'delete')
    enforceProjectContainment(validatedPath, 'delete')
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
    enforceProjectContainment(validatedOld, 'rename (source)')
    enforceProjectContainment(validatedNew, 'rename (destination)')
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
      enforceProjectContainment(path.resolve(cwd), 'execute command in')
    } catch (err: any) {
      return { stdout: '', stderr: `Invalid cwd: ${err.message}`, exitCode: -1 }
    }
  }

  const { exe, args } = parseCommand(command)
  if (!exe) {
    return { stdout: '', stderr: 'Invalid command: empty executable', exitCode: -1 }
  }

  const exeBasename = path.basename(exe).replace(/\.(cmd|bat|exe|sh)$/i, '').toLowerCase()
  if (!ALLOWED_EXECUTABLES.has(exeBasename)) {
    return { stdout: '', stderr: `Access denied: executable '${exe}' is not in the allowed list`, exitCode: -1 }
  }

  const RUNTIME_EVAL_FLAGS: Record<string, string[]> = {
    'node': ['-e', '--eval', '--input-type', '-p', '--print'],
    'tsx': ['-e', '--eval'],
    'ts-node': ['-e', '--eval'],
    'python': ['-c', '--command'],
    'python3': ['-c', '--command'],
    'ruby': ['-e'],
    'deno': ['eval'],
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
  if (cwd && typeof cwd === 'string') {
    try {
      validateFsPath(cwd, 'run git in')
      enforceProjectContainment(path.resolve(cwd), 'run git in')
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
  
  const dangerousPatterns = [
    /\([^)]*\+\+?[^{}]*\)\??[+*]/,  
    /\([^)]*\*\+?[^{}]*\)\??[+*]/,  
    /\([^)]*\+\+?[^{}]*\)\??\{/,    
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
          try {
            const stat = await fs.promises.stat(fullPath)
            if (stat.size > 500000) continue
          } catch { continue }
          
          try {
            const content = await fs.promises.readFile(fullPath, 'utf-8')
            const lines = content.split('\n')
            
            let regex: RegExp
            try {
              regex = new RegExp(pattern, 'gi')
            } catch (e) {
              return { error: 'Invalid regex pattern: ' + (e as Error).message }
            }
            
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
          } catch {
          }
        }
      }
    } catch {}
  }
  
  await searchDir(dirPath, 0)
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

  try {
    validateFsPath(cwd, 'create terminal session in')
    enforceProjectContainment(path.resolve(cwd), 'create terminal session in')
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

const ALLOWED_API_DOMAINS = new Set([
  'opencode.ai', 'api.z.ai',
  'api.openai.com', 'api.anthropic.com',
  'openrouter.ai',
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'api.groq.com',
  'api.mistral.ai',
  'api.moonshot.cn',
  'api.perplexity.ai',
  'api.synthetic.new',
  'localhost',
  'html.duckduckgo.com',
  'webcache.googleusercontent.com',
])

function isAllowedApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
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

mcpService.initMCPService(STORE_DIR)

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

ipcMain.handle('linter:lint', async (_e, filePath: string, projectPath: string) => {
  return lintFile(filePath, projectPath)
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
    console.error('[InlineCompletion] Error:', err.message)
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
        console.error('[InlineCompletion] Failed to decrypt API key on config change:', err)
      }
    }
    if (config.provider === 'ollama') {
      const baseUrl = store['baseUrl:ollama'] as string
      if (baseUrl) inlineCompletionService.setBaseUrl('ollama', baseUrl)
    }
  }
})

ipcMain.handle('inlineCompletion:fetchModels', async (_e, providerId: string) => {
  const PROVIDER_BASE_URLS: Record<string, string> = {
    zen: 'https://opencode.ai/zen/v1',
    zai: 'https://api.z.ai/api/paas/v4',
    anthropic: 'https://api.anthropic.com/v1',
    openai: 'https://api.openai.com/v1',
    openrouter: 'https://openrouter.ai/api/v1',
    moonshot: 'https://api.moonshot.cn/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta/openai',
    deepseek: 'https://api.deepseek.com',
    groq: 'https://api.groq.com/openai/v1',
    mistral: 'https://api.mistral.ai/v1',
    perplexity: 'https://api.perplexity.ai',
    synthetic: 'https://api.synthetic.new/openai/v1',
    ollama: 'http://localhost:11434/v1',
  }

  try {
    const customUrl = store[`baseUrl:${providerId}`] as string | undefined
    const baseUrl = customUrl || PROVIDER_BASE_URLS[providerId] || ''
    if (!baseUrl) return { models: [], error: 'Unknown provider' }

    let apiKey = ''
    const encKey = store[`apiKey:${providerId}`]
    if (encKey) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          apiKey = safeStorage.decryptString(Buffer.from(encKey as string, 'base64'))
        } else {
          apiKey = encKey as string
        }
      } catch {
        apiKey = encKey as string
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
    console.error('[InlineCompletion] Failed to sync API key on ready:', err)
  }

  if (store['discordRpcEnabled'] === true) {
    console.log('[Artemis] Restoring Discord RPC from saved state...')
    discordRPC.toggle(true).catch((err) => {
      console.error('[Artemis] Failed to restore Discord RPC:', err)
    })
  }
})

app.on('before-quit', () => {
  isQuitting = true

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
