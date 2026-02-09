/**
 * Linter Service — Real-time linting integration for ESLint (JS/TS) and Pylint (Python).
 * 
 * Spawns linter processes and parses their output into structured diagnostics.
 * Results are piped to the active model context for auto-fix suggestions.
 */

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

// Security: Dangerous shell metacharacters that could enable command injection via filePath
const DANGEROUS_PATH_CHARS = /[;&|`$(){}[\]\<>\n\r]/

/** Security: Resolve a bare command name to a full path on Windows so spawn works with shell:false.
 *  Finds .cmd/.bat/.exe variants in PATH. */
function resolveCommand(command: string): string {
  if (process.platform !== 'win32') return command
  if (path.isAbsolute(command)) return command
  const cmdExtensions = ['.cmd', '.bat', '.exe']
  const pathDirs = (process.env.PATH || '').split(path.delimiter)
  for (const dir of pathDirs) {
    for (const ext of cmdExtensions) {
      const withExt = path.join(dir, command + ext)
      try { if (fs.existsSync(withExt)) return withExt } catch {}
    }
    const exact = path.join(dir, command)
    try { if (fs.existsSync(exact)) return exact } catch {}
  }
  return command
}

/** Security: Validate that a file path doesn't contain shell metacharacters. */
function validateLintPath(filePath: string): void {
  if (DANGEROUS_PATH_CHARS.test(filePath)) {
    throw new Error(`Lint path contains dangerous characters: ${filePath}`)
  }
  if (filePath.includes('\0')) {
    throw new Error('Lint path contains null bytes')
  }
}

export interface LintDiagnostic {
  file: string
  line: number
  column: number
  severity: 'error' | 'warning' | 'info'
  message: string
  ruleId: string
  source: 'eslint' | 'pylint'
}

export interface LintResult {
  file: string
  diagnostics: LintDiagnostic[]
  error?: string
}

const LINT_TIMEOUT_MS = 30_000

/**
 * Run ESLint on a file and return structured diagnostics.
 */
export async function runESLint(filePath: string, projectPath: string): Promise<LintResult> {
  const result: LintResult = { file: filePath, diagnostics: [] }

  // Security: Validate filePath to prevent injection when passed as argument
  try {
    validateLintPath(filePath)
  } catch (err: any) {
    result.error = err.message
    return result
  }

  // Try to find eslint in the project's node_modules
  const eslintPaths = [
    path.join(projectPath, 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint'),
    'eslint', // fallback to global
  ]

  let eslintBin = ''
  for (const p of eslintPaths) {
    try {
      if (p.includes('node_modules')) {
        await fs.promises.access(p)
      }
      eslintBin = p
      break
    } catch {
      continue
    }
  }

  if (!eslintBin) {
    result.error = 'ESLint not found. Install with: npm install --save-dev eslint'
    return result
  }

  try {
    const output = await spawnLinter(eslintBin, [
      filePath,
      '--format', 'json',
      '--no-ignore',
    ], projectPath)

    try {
      const parsed = JSON.parse(output.stdout)
      if (Array.isArray(parsed) && parsed.length > 0) {
        const fileResult = parsed[0]
        if (fileResult.messages && Array.isArray(fileResult.messages)) {
          for (const msg of fileResult.messages) {
            result.diagnostics.push({
              file: filePath,
              line: msg.line || 1,
              column: msg.column || 1,
              severity: msg.severity === 2 ? 'error' : msg.severity === 1 ? 'warning' : 'info',
              message: msg.message || 'Unknown issue',
              ruleId: msg.ruleId || 'unknown',
              source: 'eslint',
            })
          }
        }
      }
    } catch {
      // If JSON parse fails, try line-based parsing
      if (output.stderr) {
        result.error = output.stderr.slice(0, 500)
      }
    }
  } catch (err: any) {
    result.error = `ESLint execution failed: ${err.message}`
  }

  return result
}

/**
 * Run Pylint on a file and return structured diagnostics.
 */
export async function runPylint(filePath: string, projectPath: string): Promise<LintResult> {
  const result: LintResult = { file: filePath, diagnostics: [] }

  // Security: Validate filePath to prevent injection when passed as argument
  try {
    validateLintPath(filePath)
  } catch (err: any) {
    result.error = err.message
    return result
  }

  try {
    const output = await spawnLinter(
      process.platform === 'win32' ? 'pylint.exe' : 'pylint',
      [filePath, '--output-format=json', '--disable=C0114,C0115,C0116'],
      projectPath
    )

    try {
      const parsed = JSON.parse(output.stdout)
      if (Array.isArray(parsed)) {
        for (const msg of parsed) {
          result.diagnostics.push({
            file: filePath,
            line: msg.line || 1,
            column: msg.column || 1,
            severity: msg.type === 'error' || msg.type === 'fatal' ? 'error'
              : msg.type === 'warning' ? 'warning' : 'info',
            message: msg.message || 'Unknown issue',
            ruleId: msg['message-id'] || msg.symbol || 'unknown',
            source: 'pylint',
          })
        }
      }
    } catch {
      if (output.stderr) {
        result.error = output.stderr.slice(0, 500)
      }
    }
  } catch (err: any) {
    result.error = `Pylint execution failed: ${err.message}`
  }

  return result
}

/**
 * Auto-detect the appropriate linter and run it.
 */
export async function lintFile(filePath: string, projectPath: string): Promise<LintResult> {
  const ext = path.extname(filePath).toLowerCase()

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    return runESLint(filePath, projectPath)
  }

  if (ext === '.py') {
    return runPylint(filePath, projectPath)
  }

  return {
    file: filePath,
    diagnostics: [],
    error: `No linter configured for ${ext} files`,
  }
}

/**
 * Format lint results for agent context (auto-fix prompt).
 */
export function formatLintForAgent(result: LintResult): string {
  if (result.error) {
    return `Linter error for ${result.file}: ${result.error}`
  }

  if (result.diagnostics.length === 0) {
    return `No lint issues found in ${result.file}.`
  }

  const lines = [`Lint issues in ${result.file} (${result.diagnostics.length} issues):\n`]
  for (const d of result.diagnostics) {
    lines.push(`  Line ${d.line}:${d.column} [${d.severity.toUpperCase()}] ${d.message} (${d.ruleId})`)
  }
  lines.push('\nPlease fix these lint issues. Propose minimal, targeted edits.')
  return lines.join('\n')
}

/**
 * Spawn a linter process and capture output.
 */
function spawnLinter(
  command: string,
  args: string[],
  cwd: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // Security: Resolve binary path and use shell:false to prevent command injection.
    // On Windows, route .cmd/.bat through cmd.exe /c explicitly instead of shell:true.
    let spawnExe = resolveCommand(command)
    let spawnArgs = args
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(spawnExe)) {
      spawnArgs = ['/c', spawnExe, ...args]
      spawnExe = process.env.ComSpec || 'cmd.exe'
    }

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
      resolve({ stdout: stdout.slice(0, 50000), stderr: 'Linter timed out', exitCode: -1 })
    }, LINT_TIMEOUT_MS)

    child.on('close', (code: number | null) => {
      clearTimeout(timeout)
      resolve({ stdout: stdout.slice(0, 50000), stderr: stderr.slice(0, 10000), exitCode: code ?? -1 })
    })

    child.on('error', (err: Error) => {
      clearTimeout(timeout)
      resolve({ stdout: '', stderr: err.message, exitCode: -1 })
    })
  })
}
