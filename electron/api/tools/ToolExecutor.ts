/**
 * ToolExecutor — Safe execution engine for all tools.
 * 
 * Runs in the Electron main process with full Node.js access.
 * Every tool execution is wrapped in try/catch with timeout handling.
 * Results are always returned (never thrown) so the agent can recover.
 */

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import type { ToolCall, ToolResult } from '../types'
import { webSearch, formatSearchForAgent } from '../../services/webSearchService'
import { lintFile, formatLintForAgent } from '../../services/linterService'
import { fetchUrl, formatFetchForAgent } from '../../services/urlFetchService'
import { mcpClientManager } from '../../services/mcpClient'

// ─── Configuration ───────────────────────────────────────────────────────────

const COMMAND_TIMEOUT_MS = 60_000
const MAX_OUTPUT_LENGTH = 50_000
const MAX_SEARCH_RESULTS = 100
const MAX_SEARCH_DEPTH = 8
const MAX_FILE_SIZE_FOR_SEARCH = 500_000

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  '.venv', 'venv', '.cache', 'coverage', '.idea', '.vscode',
  'dist-electron', '.svelte-kit', '.nuxt',
])

// ─── Path Safety ─────────────────────────────────────────────────────────────

type PathApprovalCallback = (filePath: string, reason: string) => Promise<boolean>

function validatePath(filePath: string, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  // Security: Block UNC paths and Windows extended paths that could bypass checks
  if (filePath.startsWith('\\\\') || filePath.startsWith('//') || filePath.startsWith('\\?\\')) {
    throw new Error(`Access denied: UNC or extended paths are not allowed`)
  }

  const resolved = path.resolve(filePath)

  // Security: Block resolved UNC paths
  if (resolved.startsWith('\\\\') || resolved.startsWith('//')) {
    throw new Error(`Access denied: UNC paths are not allowed`)
  }

  // Always block obvious dangerous system paths (case-insensitive)
  const dangerous = ['C:\\Windows', 'C:\\Program Files', '/usr', '/etc', '/bin', '/sbin', '/lib', '/lib64', '/sys', '/proc', '/dev']
  for (const d of dangerous) {
    if (resolved.toLowerCase().startsWith(d.toLowerCase())) {
      throw new Error(`Access denied: cannot operate on system path ${resolved}`)
    }
  }

  // If project path is set, enforce containment with case-insensitive comparison
  if (projectPath) {
    const resolvedProject = path.resolve(projectPath)
    const normalizedResolved = resolved.toLowerCase()
    const normalizedProject = resolvedProject.toLowerCase()
    const projectPrefix = normalizedProject + path.sep.toLowerCase()
    
    // Check if path is within project directory (case-insensitive)
    if (!normalizedResolved.startsWith(projectPrefix) && normalizedResolved !== normalizedProject) {
      // Path is outside project - ask for approval if callback provided
      if (onPathApproval) {
        return onPathApproval(resolved, `Path is outside the project directory (${resolvedProject})`)
          .then(approved => {
            if (!approved) {
              throw new Error(`Access denied: user declined access to ${resolved} (outside project)`)
            }
            return resolved
          })
      } else {
        throw new Error(`Access denied: path ${resolved} is outside the project directory ${resolvedProject}`)
      }
    }
  }

  return Promise.resolve(resolved)
}

// ─── Tool Implementations ────────────────────────────────────────────────────

async function toolReadFile(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const filePath = await validatePath(args.path, projectPath, onPathApproval)
  const stat = await fs.promises.stat(filePath)
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory, not a file: ${filePath}`)
  }
  if (stat.size > 2_000_000) {
    throw new Error(`File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max 2MB.`)
  }
  const content = await fs.promises.readFile(filePath, 'utf-8')
  return content || '(empty file)'
}

async function toolWriteFile(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const filePath = await validatePath(args.path, projectPath, onPathApproval)
  // Ensure parent directory exists
  const dir = path.dirname(filePath)
  await fs.promises.mkdir(dir, { recursive: true })
  // Atomic write: write to temp file then rename
  const tmpPath = filePath + '.tmp.' + Date.now()
  try {
    await fs.promises.writeFile(tmpPath, args.content, 'utf-8')
    await fs.promises.rename(tmpPath, filePath)
  } catch (err) {
    // Clean up temp file on failure
    try { await fs.promises.unlink(tmpPath) } catch {}
    throw err
  }
  return `File written successfully: ${filePath} (${Buffer.byteLength(args.content, 'utf-8')} bytes)`
}

async function toolStrReplace(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const filePath = await validatePath(args.path, projectPath, onPathApproval)
  const content = await fs.promises.readFile(filePath, 'utf-8')

  if (!content.includes(args.old_str)) {
    // Provide helpful context for debugging
    const lines = content.split('\n').length
    throw new Error(
      `Could not find the specified text in ${filePath} (${lines} lines). ` +
      `The old_str must match the file content exactly, including whitespace and indentation.`
    )
  }

  // Check for multiple occurrences
  const occurrences = content.split(args.old_str).length - 1
  if (occurrences > 1) {
    throw new Error(
      `Found ${occurrences} occurrences of old_str in ${filePath}. ` +
      `Please provide a more specific/unique string to replace.`
    )
  }

  const newContent = content.replace(args.old_str, args.new_str)
  await fs.promises.writeFile(filePath, newContent, 'utf-8')
  return `File edited successfully: ${filePath}`
}

async function toolListDirectory(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const dirPath = await validatePath(args.path, projectPath, onPathApproval)
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
  const filtered = entries
    .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
    .sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    .map(e => `${e.isDirectory() ? '[DIR]' : '[FILE]'} ${e.name}`)

  return filtered.length > 0 ? filtered.join('\n') : '(empty directory)'
}

async function toolSearchFiles(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const searchPath = await validatePath(args.path, projectPath, onPathApproval)

  // Try ripgrep first — orders of magnitude faster for large codebases
  try {
    const rgResult = await searchWithRipgrep(args.pattern, searchPath, args.include)
    if (rgResult !== null) return rgResult
  } catch {
    // ripgrep not available or failed — fall back to JS implementation
  }

  return searchWithJS(args, searchPath)
}

// ─── Ripgrep-based search (fast path) ─────────────────────────────────────────

let ripgrepAvailable: boolean | null = null // null = unknown, lazy-detected

async function searchWithRipgrep(pattern: string, searchPath: string, include?: string): Promise<string | null> {
  // Lazy-detect ripgrep availability
  if (ripgrepAvailable === false) return null

  return new Promise((resolve) => {
    const rgArgs = [
      '--line-number',
      '--no-heading',
      '--color', 'never',
      '--max-count', String(MAX_SEARCH_RESULTS),
      '--max-filesize', `${MAX_FILE_SIZE_FOR_SEARCH}b`,
      '--max-depth', String(MAX_SEARCH_DEPTH),
      '-i', // case-insensitive to match JS behavior
    ]

    // Add glob filter if specified
    if (include) {
      rgArgs.push('--glob', include)
    }

    // Add ignore patterns
    for (const dir of Array.from(IGNORE_DIRS)) {
      rgArgs.push('--glob', `!${dir}`)
    }

    rgArgs.push('--', pattern, searchPath)

    const rg = spawn('rg', rgArgs, { timeout: 30_000 })
    let stdout = ''
    let stderr = ''

    rg.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
      // Cap output to avoid memory issues
      if (stdout.length > MAX_OUTPUT_LENGTH) {
        rg.kill()
      }
    })

    rg.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    rg.on('error', () => {
      // rg binary not found
      ripgrepAvailable = false
      resolve(null)
    })

    rg.on('close', (code) => {
      if (ripgrepAvailable === false) return // already resolved via error

      ripgrepAvailable = true

      if (code === 1) {
        // rg exit code 1 = no matches
        resolve('No matches found.')
        return
      }

      if (code !== 0 && code !== 1) {
        // Unexpected error — fall back to JS
        resolve(null)
        return
      }

      const lines = stdout.trim().split('\n').filter(Boolean)
      if (lines.length === 0) {
        resolve('No matches found.')
        return
      }

      // Truncate each line's match text to 200 chars
      const formatted = lines.slice(0, MAX_SEARCH_RESULTS).map(line => {
        // rg output: filepath:line:text
        const firstColon = line.indexOf(':')
        const secondColon = line.indexOf(':', firstColon + 1)
        if (secondColon === -1) return line.slice(0, 250)
        const prefix = line.slice(0, secondColon + 1)
        const text = line.slice(secondColon + 1).trim().slice(0, 200)
        return `${prefix} ${text}`
      })

      let output = formatted.join('\n')
      if (lines.length >= MAX_SEARCH_RESULTS) {
        output += `\n... (truncated at ${MAX_SEARCH_RESULTS} results)`
      }
      resolve(output)
    })
  })
}

// ─── JS fallback search (original implementation) ─────────────────────────────

async function searchWithJS(args: Record<string, any>, searchPath: string): Promise<string> {
  const results: string[] = []

  async function search(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SEARCH_DEPTH || results.length >= MAX_SEARCH_RESULTS) return

    let entries: fs.Dirent[]
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true })
    } catch { return }

    for (const entry of entries) {
      if (results.length >= MAX_SEARCH_RESULTS) break
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await search(fullPath, depth + 1)
        }
      } else if (entry.isFile()) {
        // Apply include filter if specified
        if (args.include) {
          const ext = path.extname(entry.name)
          const pattern = args.include.replace('*', '')
          if (!entry.name.endsWith(pattern) && ext !== pattern) continue
        }

        try {
          const stat = await fs.promises.stat(fullPath)
          if (stat.size > MAX_FILE_SIZE_FOR_SEARCH) continue

          const content = await fs.promises.readFile(fullPath, 'utf-8')
          const lines = content.split('\n')
          const regex = new RegExp(args.pattern, 'gi')

          for (let i = 0; i < lines.length && results.length < MAX_SEARCH_RESULTS; i++) {
            if (regex.test(lines[i])) {
              results.push(`${fullPath}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
            }
            regex.lastIndex = 0
          }
        } catch {
          // Skip binary/unreadable files
        }
      }
    }
  }

  await search(searchPath, 0)

  if (results.length === 0) return 'No matches found.'
  let output = results.join('\n')
  if (results.length >= MAX_SEARCH_RESULTS) {
    output += `\n... (truncated at ${MAX_SEARCH_RESULTS} results)`
  }
  return output
}

// Dangerous shell metacharacters that could enable command injection
const DANGEROUS_SHELL_CHARS = /[;&|`$(){}[\]\<>\n\r]/

// Parse a command string into [executable, ...args] without using a shell
function parseCommandTokens(command: string): { exe: string; args: string[] } {
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

async function toolExecuteCommand(args: Record<string, any>, projectPath: string): Promise<string> {
  const cwd = args.cwd || projectPath || '.'
  
  // Security: Validate command to prevent injection
  if (!args.command || typeof args.command !== 'string') {
    return 'Error: No command provided'
  }
  
  // Block dangerous characters that could enable command injection
  if (DANGEROUS_SHELL_CHARS.test(args.command)) {
    return `Error: Command contains potentially dangerous characters. Commands should be simple and not include shell metacharacters like ; & | \` $ ( ) etc.`
  }

  // Block Windows environment variable expansion (%VAR%) and caret escapes (^)
  if (process.platform === 'win32' && (/%[^%]+%/.test(args.command) || args.command.includes('^'))) {
    return 'Error: Command contains shell expansion characters that are not allowed.'
  }

  const { exe, args: cmdArgs } = parseCommandTokens(args.command)
  if (!exe) {
    return 'Error: Empty command'
  }

  return new Promise<string>((resolve) => {
    // Spawn directly without a shell — prevents shell injection vectors
    const child = spawn(exe, cmdArgs, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => { stdout += data.toString() })
    child.stderr?.on('data', (data: Buffer) => { stderr += data.toString() })

    const timeout = setTimeout(() => {
      child.kill()
      resolve(`Command timed out after ${COMMAND_TIMEOUT_MS / 1000} seconds.\nPartial stdout: ${stdout.slice(0, MAX_OUTPUT_LENGTH)}`)
    }, COMMAND_TIMEOUT_MS)

    child.on('close', (code: number | null) => {
      clearTimeout(timeout)
      let output = ''
      if (stdout) output += stdout.slice(0, MAX_OUTPUT_LENGTH)
      if (stderr) output += (output ? '\n' : '') + `stderr: ${stderr.slice(0, 10000)}`
      if (!output) output = `Command completed with exit code ${code ?? -1}`
      if (code !== 0 && code !== null) {
        output = `Exit code: ${code}\n${output}`
      }
      resolve(output)
    })

    child.on('error', (err: Error) => {
      clearTimeout(timeout)
      resolve(`Command failed: ${err.message}`)
    })
  })
}

async function toolGetGitDiff(args: Record<string, any>, projectPath: string): Promise<string> {
  return toolExecuteCommand({ command: 'git diff', cwd: projectPath }, projectPath)
}

async function toolListCodeDefinitions(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const filePath = await validatePath(args.path, projectPath, onPathApproval)
  const content = await fs.promises.readFile(filePath, 'utf-8')
  const lines = content.split('\n')
  const definitions: string[] = []

  const ext = path.extname(filePath).toLowerCase()
  const isTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs'].includes(ext)
  const isPython = ext === '.py'
  const isRust = ext === '.rs'
  const isGo = ext === '.go'

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    if (isTS) {
      if (/^\s*(?:export\s+)?(?:async\s+)?function\s+\w+/.test(line)) {
        definitions.push(`L${lineNum}: ${line.trim()}`)
      } else if (/^\s*(?:export\s+)?(?:abstract\s+)?class\s+\w+/.test(line)) {
        definitions.push(`L${lineNum}: ${line.trim()}`)
      } else if (/^\s*(?:export\s+)?(?:type|interface)\s+\w+/.test(line)) {
        definitions.push(`L${lineNum}: ${line.trim()}`)
      } else if (/^\s*(?:export\s+)?const\s+\w+\s*=\s*(?:async\s+)?\(/.test(line)) {
        definitions.push(`L${lineNum}: ${line.trim()}`)
      }
    } else if (isPython) {
      if (/^(?:async\s+)?def\s+\w+/.test(line) || /^class\s+\w+/.test(line)) {
        definitions.push(`L${lineNum}: ${line.trim()}`)
      }
    } else if (isRust) {
      if (/^\s*(?:pub\s+)?(?:async\s+)?fn\s+\w+/.test(line) || /^\s*(?:pub\s+)?struct\s+\w+/.test(line) ||
          /^\s*(?:pub\s+)?enum\s+\w+/.test(line) || /^\s*(?:pub\s+)?trait\s+\w+/.test(line)) {
        definitions.push(`L${lineNum}: ${line.trim()}`)
      }
    } else if (isGo) {
      if (/^func\s+/.test(line) || /^type\s+\w+\s+struct/.test(line) || /^type\s+\w+\s+interface/.test(line)) {
        definitions.push(`L${lineNum}: ${line.trim()}`)
      }
    } else {
      // Generic: look for function-like patterns
      if (/^\s*(?:export\s+)?(?:async\s+)?function\s+\w+/.test(line) ||
          /^\s*(?:export\s+)?class\s+\w+/.test(line)) {
        definitions.push(`L${lineNum}: ${line.trim()}`)
      }
    }
  }

  if (definitions.length === 0) return `No top-level definitions found in ${filePath}`
  return definitions.join('\n')
}

async function toolCreateDirectory(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const dirPath = await validatePath(args.path, projectPath, onPathApproval)
  await fs.promises.mkdir(dirPath, { recursive: true })
  return `Directory created: ${dirPath}`
}

async function toolDeleteFile(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const filePath = await validatePath(args.path, projectPath, onPathApproval)
  const stat = await fs.promises.stat(filePath)
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory. Use execute_command with rmdir for directories.`)
  }
  await fs.promises.unlink(filePath)
  return `Deleted: ${filePath}`
}

async function toolMoveFile(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const oldPath = await validatePath(args.old_path, projectPath, onPathApproval)
  const newPath = await validatePath(args.new_path, projectPath, onPathApproval)

  // Ensure target directory exists
  const newDir = path.dirname(newPath)
  await fs.promises.mkdir(newDir, { recursive: true })

  await fs.promises.rename(oldPath, newPath)
  return `Moved: ${oldPath} → ${newPath}`
}

async function toolWebSearch(args: Record<string, any>): Promise<string> {
  if (!args.query || typeof args.query !== 'string') {
    throw new Error('web_search requires a "query" parameter')
  }
  const response = await webSearch(args.query)
  return formatSearchForAgent(response)
}

async function toolLintFile(args: Record<string, any>, projectPath: string): Promise<string> {
  if (!args.path || typeof args.path !== 'string') {
    throw new Error('lint_file requires a "path" parameter')
  }
  const result = await lintFile(args.path, projectPath)
  return formatLintForAgent(result)
}

async function toolFetchUrl(args: Record<string, any>): Promise<string> {
  if (!args.url || typeof args.url !== 'string') {
    throw new Error('fetch_url requires a "url" parameter')
  }
  const result = await fetchUrl(args.url)
  return formatFetchForAgent(result)
}

// ─── Tool Executor Class ─────────────────────────────────────────────────────

export class ToolExecutor {
  private onPathApproval?: PathApprovalCallback

  /**
   * Set the path approval callback
   */
  setPathApprovalCallback(callback: PathApprovalCallback): void {
    this.onPathApproval = callback
  }

  /**
   * Execute a tool call safely. Always returns a ToolResult, never throws.
   */
  async execute(toolCall: ToolCall, projectPath?: string): Promise<ToolResult> {
    const startTime = Date.now()

    try {
      const output = await this.dispatch(toolCall.name, toolCall.arguments, projectPath)
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: true,
        output,
        durationMs: Date.now() - startTime,
      }
    } catch (err: any) {
      return {
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        success: false,
        output: `Error executing ${toolCall.name}: ${err.message || 'Unknown error'}`,
        durationMs: Date.now() - startTime,
      }
    }
  }

  /**
   * Execute multiple tool calls sequentially.
   */
  async executeAll(toolCalls: ToolCall[], projectPath?: string): Promise<ToolResult[]> {
    const results: ToolResult[] = []
    for (const tc of toolCalls) {
      results.push(await this.execute(tc, projectPath))
    }
    return results
  }

  /**
   * Dispatch to the correct tool implementation.
   */
  private async dispatch(name: string, args: Record<string, any>, projectPath?: string): Promise<string> {
    // Route MCP tools to the MCP client manager
    if (name.startsWith('mcp_')) {
      return mcpClientManager.callTool(name, args)
    }

    switch (name) {
      case 'read_file':             return toolReadFile(args, projectPath, this.onPathApproval)
      case 'write_file':            return toolWriteFile(args, projectPath, this.onPathApproval)
      case 'str_replace':           return toolStrReplace(args, projectPath, this.onPathApproval)
      case 'list_directory':        return toolListDirectory(args, projectPath, this.onPathApproval)
      case 'search_files':          return toolSearchFiles(args, projectPath, this.onPathApproval)
      case 'execute_command':       return toolExecuteCommand(args, projectPath || '.')
      case 'get_git_diff':          return toolGetGitDiff(args, projectPath || '.')
      case 'list_code_definitions': return toolListCodeDefinitions(args, projectPath, this.onPathApproval)
      case 'create_directory':      return toolCreateDirectory(args, projectPath, this.onPathApproval)
      case 'delete_file':           return toolDeleteFile(args, projectPath, this.onPathApproval)
      case 'move_file':             return toolMoveFile(args, projectPath, this.onPathApproval)
      case 'web_search':            return toolWebSearch(args)
      case 'lint_file':             return toolLintFile(args, projectPath || '.')
      case 'fetch_url':             return toolFetchUrl(args)
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }
}

// Singleton
export const toolExecutor = new ToolExecutor()
