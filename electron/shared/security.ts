import path from 'path'
import fs from 'fs'

// ─── Allowed API Domains ─────────────────────────────────────────────────────
// Single source of truth for all outbound API domain allowlisting.
// Used by both main.ts (zen:request) and AgentIPC.ts (agent:httpRequest/stream).
export const ALLOWED_API_DOMAINS = new Set([
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
  'api.github.com',
])

const LOCALHOST_ALLOWED_PORTS = new Set(['11434'])

export function isAllowedApiUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    const hostname = parsed.hostname.toLowerCase()

    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
      return LOCALHOST_ALLOWED_PORTS.has(port)
    }

    const domains = Array.from(ALLOWED_API_DOMAINS)
    for (let i = 0; i < domains.length; i++) {
      if (hostname === domains[i] || hostname.endsWith('.' + domains[i])) return true
    }
    return false
  } catch {
    return false
  }
}

// ─── Provider Base URLs ──────────────────────────────────────────────────────
export const PROVIDER_BASE_URLS: Record<string, string> = {
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

// ─── Dangerous Shell Characters ──────────────────────────────────────────────
export const DANGEROUS_SHELL_CHARS = /[;&|`$(){}[\]<>\n\r]/

const COMMAND_RESOLVE_CACHE = new Map<string, string>()

// ─── Allowed Executables ─────────────────────────────────────────────────────
export const ALLOWED_EXECUTABLES = new Set([
  'npm', 'npx', 'yarn', 'pnpm', 'bun', 'bunx', 'deno', 'node', 'tsx', 'ts-node',
  'git',
  'tsc', 'vite', 'webpack', 'esbuild', 'rollup', 'turbo', 'nx',
  'eslint', 'prettier', 'biome',
  'python', 'python3', 'pip', 'pip3', 'cargo', 'rustc', 'go', 'java', 'javac', 'ruby', 'gem',
  'cat', 'echo', 'ls', 'dir', 'find', 'grep', 'rg', 'sed', 'awk', 'head', 'tail', 'wc',
  'mkdir', 'rm', 'cp', 'mv', 'touch', 'chmod', 'curl', 'wget',
  'docker', 'docker-compose', 'podman',
  'jest', 'vitest', 'mocha', 'pytest',
])

// ─── Runtime Eval Flags ──────────────────────────────────────────────────────
export const RUNTIME_EVAL_FLAGS: Record<string, string[]> = {
  'node': ['-e', '--eval', '--input-type', '-p', '--print'],
  'tsx': ['-e', '--eval'],
  'ts-node': ['-e', '--eval'],
  'python': ['-c', '--command'],
  'python3': ['-c', '--command'],
  'ruby': ['-e'],
  'deno': ['eval'],
}

// ─── Command Parsing ─────────────────────────────────────────────────────────
export function parseCommandTokens(command: string): { exe: string; args: string[] } {
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

async function canAccess(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function resolveCommand(command: string): Promise<string> {
  if (process.platform !== 'win32') return command

  const cacheKey = command.toLowerCase()
  const cached = COMMAND_RESOLVE_CACHE.get(cacheKey)
  if (cached) return cached

  if (path.isAbsolute(command)) {
    COMMAND_RESOLVE_CACHE.set(cacheKey, command)
    return command
  }

  const cmdExtensions = ['.cmd', '.bat', '.exe']
  const pathDirs = (process.env.PATH || '').split(path.delimiter)
  for (const dir of pathDirs) {
    for (const ext of cmdExtensions) {
      const withExt = path.join(dir, command + ext)
      if (await canAccess(withExt)) {
        COMMAND_RESOLVE_CACHE.set(cacheKey, withExt)
        return withExt
      }
    }
    const exact = path.join(dir, command)
    if (await canAccess(exact)) {
      COMMAND_RESOLVE_CACHE.set(cacheKey, exact)
      return exact
    }
  }

  COMMAND_RESOLVE_CACHE.set(cacheKey, command)
  return command
}

// ─── Dangerous System Paths ──────────────────────────────────────────────────
const DANGEROUS_SYSTEM_PATHS = [
  'C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)', 'C:\\ProgramData',
  '/usr', '/etc', '/bin', '/sbin', '/lib', '/lib64', '/sys', '/proc', '/dev',
]

// ─── Path Validation ─────────────────────────────────────────────────────────
export function validateFsPath(filePath: string, operation: string): string {
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
  
  for (const d of DANGEROUS_SYSTEM_PATHS) {
    if (resolved.toLowerCase().startsWith(d.toLowerCase())) {
      throw new Error(`Access denied: cannot ${operation} on system path`)
    }
  }
  
  return resolved
}

// ─── Project Containment ─────────────────────────────────────────────────────
export function enforceProjectContainment(
  resolved: string,
  operation: string,
  activeProjectPath: string | null,
  userDataDir?: string,
): void {
  const normalizedResolved = resolved.toLowerCase()

  if (userDataDir) {
    const normalizedUserData = userDataDir.toLowerCase()
    const userDataPrefix = normalizedUserData + path.sep.toLowerCase()
    if (normalizedResolved === normalizedUserData || normalizedResolved.startsWith(userDataPrefix)) return
  }

  if (!activeProjectPath) {
    throw new Error(`Access denied: cannot ${operation} without an active project directory`)
  }

  const normalizedProject = path.resolve(activeProjectPath).toLowerCase()
  const projectPrefix = normalizedProject + path.sep.toLowerCase()
  if (normalizedResolved !== normalizedProject && !normalizedResolved.startsWith(projectPrefix)) {
    throw new Error(`Access denied: cannot ${operation} outside the active project directory`)
  }
}
