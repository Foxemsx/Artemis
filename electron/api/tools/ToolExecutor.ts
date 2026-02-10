
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import type { ToolCall, ToolResult } from '../types'
import { webSearch, formatSearchForAgent } from '../../services/webSearchService'
import { lintFile, formatLintForAgent } from '../../services/linterService'
import { fetchUrl, formatFetchForAgent } from '../../services/urlFetchService'
import { mcpClientManager } from '../../services/mcpClient'
import {
  DANGEROUS_SHELL_CHARS, ALLOWED_EXECUTABLES,
  parseCommandTokens, validateFsPath, resolveCommand,
} from '../../shared/security'


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


type PathApprovalCallback = (filePath: string, reason: string) => Promise<boolean>

function validatePath(filePath: string, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const resolved = validateFsPath(filePath, 'access')

  if (projectPath) {
    const resolvedProject = path.resolve(projectPath)
    const normalizedResolved = resolved.toLowerCase()
    const normalizedProject = resolvedProject.toLowerCase()
    const projectPrefix = normalizedProject + path.sep.toLowerCase()
    
    if (!normalizedResolved.startsWith(projectPrefix) && normalizedResolved !== normalizedProject) {
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
  const dir = path.dirname(filePath)
  await fs.promises.mkdir(dir, { recursive: true })
  const tmpPath = filePath + '.tmp.' + Date.now()
  try {
    await fs.promises.writeFile(tmpPath, args.content, 'utf-8')
    await fs.promises.rename(tmpPath, filePath)
  } catch (err) {
    try { await fs.promises.unlink(tmpPath) } catch {}
    throw err
  }
  return `File written successfully: ${filePath} (${Buffer.byteLength(args.content, 'utf-8')} bytes)`
}

async function toolStrReplace(args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
  const filePath = await validatePath(args.path, projectPath, onPathApproval)
  const content = await fs.promises.readFile(filePath, 'utf-8')

  if (!content.includes(args.old_str)) {
    const lines = content.split('\n').length
    throw new Error(
      `Could not find the specified text in ${filePath} (${lines} lines). ` +
      `The old_str must match the file content exactly, including whitespace and indentation.`
    )
  }

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

  try {
    const rgResult = await searchWithRipgrep(args.pattern, searchPath, args.include)
    if (rgResult !== null) return rgResult
  } catch {
  }

  return searchWithJS(args, searchPath)
}



let ripgrepAvailable: boolean | null = null

async function searchWithRipgrep(pattern: string, searchPath: string, include?: string): Promise<string | null> {
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

    if (include) {
      rgArgs.push('--glob', include)
    }

    for (const dir of Array.from(IGNORE_DIRS)) {
      rgArgs.push('--glob', `!${dir}`)
    }

    rgArgs.push('--', pattern, searchPath)

    const rg = spawn('rg', rgArgs, { timeout: 30_000 })
    let stdout = ''
    let stderr = ''

    rg.stdout.on('data', (data: Buffer) => {
      stdout += data.toString()
      if (stdout.length > MAX_OUTPUT_LENGTH) {
        rg.kill()
      }
    })

    rg.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })

    rg.on('error', () => {
      ripgrepAvailable = false
      resolve(null)
    })

    rg.on('close', (code) => {

      ripgrepAvailable = true

      if (code === 1) {
        resolve('No matches found.')
        return
      }

      if (code !== 0 && code !== 1) {
        resolve(null)
        return
      }

      const lines = stdout.trim().split('\n').filter(Boolean)
      if (lines.length === 0) {
        resolve('No matches found.')
        return
      }

      const formatted = lines.slice(0, MAX_SEARCH_RESULTS).map(line => {
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

async function collectFilesForSearch(root: string, include?: string): Promise<string[]> {
  const files: string[] = []
  const includePattern = include ? include.replace('*', '') : ''

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SEARCH_DEPTH) return
    let entries: fs.Dirent[]
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(fullPath, depth + 1)
        }
      } else if (entry.isFile()) {
        if (includePattern) {
          const ext = path.extname(entry.name)
          if (!entry.name.endsWith(includePattern) && ext !== includePattern) continue
        }
        files.push(fullPath)
      }
    }
  }

  await walk(root, 0)
  return files
}

async function processFilesWithConcurrency(
  files: string[],
  limit: number,
  processor: (filePath: string) => Promise<void>
): Promise<void> {
  let index = 0
  const workers = Array.from({ length: limit }, async () => {
    while (index < files.length) {
      const current = files[index++]
      await processor(current)
    }
  })
  await Promise.all(workers)
}


async function searchWithJS(args: Record<string, any>, searchPath: string): Promise<string> {
  const MAX_PATTERN_LENGTH = 500
  if (!args.pattern || typeof args.pattern !== 'string') {
    return 'Error: No search pattern provided'
  }
  if (args.pattern.length > MAX_PATTERN_LENGTH) {
    return `Error: Search pattern too long (max ${MAX_PATTERN_LENGTH} characters)`
  }

  let regex: RegExp
  try {
    regex = new RegExp(args.pattern, 'gi')
  } catch (e: any) {
    return searchWithJSLiteral(args.pattern, args, searchPath)
  }

  const results: string[] = []
  const files = await collectFilesForSearch(searchPath, args.include)
  const maxConcurrency = 12

  await processFilesWithConcurrency(files, maxConcurrency, async (fullPath) => {
    if (results.length >= MAX_SEARCH_RESULTS) return
    try {
      const stat = await fs.promises.stat(fullPath)
      if (stat.size > MAX_FILE_SIZE_FOR_SEARCH) return

      const content = await fs.promises.readFile(fullPath, 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length && results.length < MAX_SEARCH_RESULTS; i++) {
        const line = lines[i].slice(0, 1000)
        if (regex.test(line)) {
          results.push(`${fullPath}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
        }
        regex.lastIndex = 0
      }
    } catch {}
  })

  if (results.length === 0) return 'No matches found.'
  let output = results.join('\n')
  if (results.length >= MAX_SEARCH_RESULTS) {
    output += `\n... (truncated at ${MAX_SEARCH_RESULTS} results)`
  }
  return output
}

async function searchWithJSLiteral(pattern: string, args: Record<string, any>, searchPath: string): Promise<string> {
  const results: string[] = []
  const lowerPattern = pattern.toLowerCase()
  const files = await collectFilesForSearch(searchPath, args.include)
  const maxConcurrency = 12

  await processFilesWithConcurrency(files, maxConcurrency, async (fullPath) => {
    if (results.length >= MAX_SEARCH_RESULTS) return
    try {
      const stat = await fs.promises.stat(fullPath)
      if (stat.size > MAX_FILE_SIZE_FOR_SEARCH) return
      const content = await fs.promises.readFile(fullPath, 'utf-8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length && results.length < MAX_SEARCH_RESULTS; i++) {
        if (lines[i].toLowerCase().includes(lowerPattern)) {
          results.push(`${fullPath}:${i + 1}: ${lines[i].trim().slice(0, 200)}`)
        }
      }
    } catch {}
  })
  if (results.length === 0) return 'No matches found.'
  let output = `(Note: used literal string search because pattern is not valid regex)\n${results.join('\n')}`
  if (results.length >= MAX_SEARCH_RESULTS) output += `\n... (truncated at ${MAX_SEARCH_RESULTS} results)`
  return output
}

// DANGEROUS_SHELL_CHARS, ALLOWED_EXECUTABLES, parseCommandTokens, resolveCommand imported from ../../shared/security

async function toolExecuteCommand(args: Record<string, any>, projectPath: string): Promise<string> {
  const cwd = args.cwd || projectPath || '.'
  
  if (!args.command || typeof args.command !== 'string') {
    return 'Error: No command provided'
  }
  
  if (DANGEROUS_SHELL_CHARS.test(args.command)) {
    return `Error: Command contains potentially dangerous characters. Commands should be simple and not include shell metacharacters like ; & | \` $ ( ) etc.`
  }

  if (process.platform === 'win32' && (/%[^%]+%/.test(args.command) || args.command.includes('^'))) {
    return 'Error: Command contains shell expansion characters that are not allowed.'
  }

  const { exe, args: cmdArgs } = parseCommandTokens(args.command)
  if (!exe) {
    return 'Error: Empty command'
  }

  const exeBasename = path.basename(exe).replace(/\.(cmd|bat|exe|sh)$/i, '').toLowerCase()
  if (!ALLOWED_EXECUTABLES.has(exeBasename)) {
    return `Error: Executable '${exe}' is not in the allowed list. Allowed: ${Array.from(ALLOWED_EXECUTABLES).slice(0, 20).join(', ')}...`
  }

  let spawnExe = process.platform === 'win32' ? await resolveCommand(exe) : exe
  let spawnArgs = cmdArgs
  if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(spawnExe)) {
    spawnArgs = ['/c', spawnExe, ...cmdArgs]
    spawnExe = process.env.ComSpec || 'cmd.exe'
  }

  return new Promise<string>((resolve, reject) => {
    const child = spawn(spawnExe, spawnArgs, {
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
      reject(new Error(`Command failed: ${err.message}`))
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


export class ToolExecutor {
  async execute(toolCall: ToolCall, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<ToolResult> {
    const startTime = Date.now()

    try {
      const output = await this.dispatch(toolCall.name, toolCall.arguments, projectPath, onPathApproval)
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

  async executeAll(toolCalls: ToolCall[], projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<ToolResult[]> {
    const results: ToolResult[] = []
    for (const tc of toolCalls) {
      results.push(await this.execute(tc, projectPath, onPathApproval))
    }
    return results
  }

  private async dispatch(name: string, args: Record<string, any>, projectPath?: string, onPathApproval?: PathApprovalCallback): Promise<string> {
    if (name.startsWith('mcp_')) {
      return mcpClientManager.callTool(name, args)
    }

    switch (name) {
      case 'read_file':             return toolReadFile(args, projectPath, onPathApproval)
      case 'write_file':            return toolWriteFile(args, projectPath, onPathApproval)
      case 'str_replace':           return toolStrReplace(args, projectPath, onPathApproval)
      case 'list_directory':        return toolListDirectory(args, projectPath, onPathApproval)
      case 'search_files':          return toolSearchFiles(args, projectPath, onPathApproval)
      case 'execute_command':       return toolExecuteCommand(args, projectPath || '.')
      case 'get_git_diff':          return toolGetGitDiff(args, projectPath || '.')
      case 'list_code_definitions': return toolListCodeDefinitions(args, projectPath, onPathApproval)
      case 'create_directory':      return toolCreateDirectory(args, projectPath, onPathApproval)
      case 'delete_file':           return toolDeleteFile(args, projectPath, onPathApproval)
      case 'move_file':             return toolMoveFile(args, projectPath, onPathApproval)
      case 'web_search':            return toolWebSearch(args)
      case 'lint_file':             return toolLintFile(args, projectPath || '.')
      case 'fetch_url':             return toolFetchUrl(args)
      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  }
}

export const toolExecutor = new ToolExecutor()
