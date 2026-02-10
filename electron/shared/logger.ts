import fs from 'fs'
import path from 'path'

const MAX_LOG_SIZE = 2 * 1024 * 1024 // 2MB

class CrashLogger {
  private logPath: string

  constructor(userDataDir: string) {
    this.logPath = path.join(userDataDir, 'error.log')
  }

  error(module: string, msg: string, data?: Record<string, any>) {
    const entry = `[${new Date().toISOString()}] [${module}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`
    console.error(entry.trim())
    try {
      // Rotate if too large
      try {
        const stat = fs.statSync(this.logPath)
        if (stat.size > MAX_LOG_SIZE) {
          const prev = this.logPath + '.prev'
          try { fs.unlinkSync(prev) } catch {}
          fs.renameSync(this.logPath, prev)
        }
      } catch {} // file doesn't exist yet — that's fine
      fs.appendFileSync(this.logPath, entry)
    } catch {}
  }
}

let instance: CrashLogger | null = null

export function initLogger(userDataDir: string) {
  instance = new CrashLogger(userDataDir)
}

export function logError(module: string, msg: string, data?: Record<string, any>) {
  if (instance) {
    instance.error(module, msg, data)
  } else {
    console.error(`[${module}]`, msg, data || '')
  }
}
