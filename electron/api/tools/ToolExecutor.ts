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

function validatePath(filePath: string, projectPath?: string): string {
  const resolved = path.resolve(filePath)

  // If project path is set, enforce containment
  if (projectPath) {
    const resolvedProject = path.resolve(projectPath)
    if (!resolved.startsWith(resolvedProject + path.sep) && resolved !== resolvedProject) {
      throw new Error(`Access denied: path ${resolved} is outside the project directory ${resolvedProject}`)
    }
  }

  // Always block obvious dangerous system paths
  const dangerous = ['C:\\Windows', 'C:\\Program Files', '/usr', '/etc', '/bin', '/sbin']
  for (const d of dangerous) {
    if (resolved.toLowerCase().startsWith(d.toLowerCase())) {
      throw new Error(`Access denied: cannot operate on system path ${resolved}`)
    }
  }
  return resolved
}

// ─── Tool Implementations ────────────────────────────────────────────────────

async function toolReadFile(args: Record<string, any>, projectPath?: string): Promise<string> {
  const filePath = validatePath(args.path, projectPath)
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

async function toolWriteFile(args: Record<string, any>, projectPath?: string): Promise<string> {
  const filePath = validatePath(args.path, projectPath)
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

async function toolStrReplace(args: Record<string, any>, projectPath?: string): Promise<string> {
  const filePath = validatePath(args.path, projectPath)
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

async function toolListDirectory(args: Record<string, any>, projectPath?: string): Promise<string> {
  const dirPath = validatePath(args.path, projectPath)
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

async function toolSearchFiles(args: Record<string, any>, projectPath?: string): Promise<string> {
  const searchPath = validatePath(args.path, projectPath)
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

async function toolExecuteCommand(args: Record<string, any>, projectPath: string): Promise<string> {
  const cwd = args.cwd || projectPath || '.'

  return new Promise<string>((resolve) => {
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
    const shellArgs = process.platform === 'win32' ? ['/c', args.command] : ['-c', args.command]

    const child = spawn(shell, shellArgs, {
      cwd,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
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

async function toolListCodeDefinitions(args: Record<string, any>, projectPath?: string): Promise<string> {
  const filePath = validatePath(args.path, projectPath)
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

async function toolCreateDirectory(args: Record<string, any>, projectPath?: string): Promise<string> {
  const dirPath = validatePath(args.path, projectPath)
  await fs.promises.mkdir(dirPath, { recursive: true })
  return `Directory created: ${dirPath}`
}

async function toolDeleteFile(args: Record<string, any>, projectPath?: string): Promise<string> {
  const filePath = validatePath(args.path, projectPath)
  const stat = await fs.promises.stat(filePath)
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory. Use execute_command with rmdir for directories.`)
  }
  await fs.promises.unlink(filePath)
  return `Deleted: ${filePath}`
}

async function toolMoveFile(args: Record<string, any>, projectPath?: string): Promise<string> {
  const oldPath = validatePath(args.old_path, projectPath)
  const newPath = validatePath(args.new_path, projectPath)

  // Ensure target directory exists
  const newDir = path.dirname(newPath)
  await fs.promises.mkdir(newDir, { recursive: true })

  await fs.promises.rename(oldPath, newPath)
  return `Moved: ${oldPath} → ${newPath}`
}

// ─── Tool Executor Class ─────────────────────────────────────────────────────

export class ToolExecutor {
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
    switch (name) {
      case 'read_file':             return toolReadFile(args, projectPath)
      case 'write_file':            return toolWriteFile(args, projectPath)
      case 'str_replace':           return toolStrReplace(args, projectPath)
      case 'list_directory':        return toolListDirectory(args, projectPath)
      case 'search_files':          return toolSearchFiles(args, projectPath)
      case 'execute_command':       return toolExecuteCommand(args, projectPath || '.')
      case 'get_git_diff':          return toolGetGitDiff(args, projectPath || '.')
      case 'list_code_definitions': return toolListCodeDefinitions(args, projectPath)
      case 'create_directory':      return toolCreateDirectory(args, projectPath)
      case 'delete_file':           return toolDeleteFile(args, projectPath)
      case 'move_file':             return toolMoveFile(args, projectPath)
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }
}

// Singleton
export const toolExecutor = new ToolExecutor()
