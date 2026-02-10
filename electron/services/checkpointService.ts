import fs from 'fs'
import path from 'path'
import { validateFsPath, enforceProjectContainment } from '../shared/security'

export interface CheckpointMeta {
  id: string
  sessionId: string
  messageId: string
  timestamp: number
  label: string
  files: Array<{ path: string; existed: boolean }>
}

const MAX_CHECKPOINTS_PER_SESSION = 20
const MAX_SESSIONS_WITH_CHECKPOINTS = 50

let checkpointsDir = ''

const ID_PATTERN = /^[a-zA-Z0-9_-]{3,64}$/

function validateId(id: string, label: string): void {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${label}: must be 3-64 chars (letters, numbers, hyphen, underscore)`)
  }
}

function resolveProjectPath(projectPath: string): string {
  return validateFsPath(projectPath, 'checkpoint project')
}

function validateCheckpointFilePath(filePath: string, projectPath: string, operation: string): string {
  const resolved = validateFsPath(filePath, operation)
  enforceProjectContainment(resolved, operation, projectPath)
  return resolved
}

export function initCheckpointService(userDataDir: string): void {
  checkpointsDir = path.join(userDataDir, 'checkpoints')
  try {
    fs.mkdirSync(checkpointsDir, { recursive: true })
  } catch {}
}

function sessionDir(sessionId: string): string {
  return path.join(checkpointsDir, sessionId)
}

function cpDir(sessionId: string, cpId: string): string {
  return path.join(checkpointsDir, sessionId, cpId)
}

function metaPath(sessionId: string, cpId: string): string {
  return path.join(cpDir(sessionId, cpId), 'meta.json')
}

function filesDir(sessionId: string, cpId: string): string {
  return path.join(cpDir(sessionId, cpId), 'files')
}

export async function createCheckpoint(
  sessionId: string,
  messageId: string,
  label: string,
  projectPath: string,
  filesToTrack?: string[],
): Promise<CheckpointMeta> {
  validateId(sessionId, 'session id')
  const resolvedProject = resolveProjectPath(projectPath)
  const id = `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  const snapFiles: Array<{ path: string; content: string; existed: boolean }> = []

  if (filesToTrack && filesToTrack.length > 0) {
    for (const filePath of filesToTrack) {
      try {
        const validatedPath = validateCheckpointFilePath(filePath, resolvedProject, 'snapshot file')
        const content = await fs.promises.readFile(validatedPath, 'utf-8')
        snapFiles.push({ path: validatedPath, content, existed: true })
      } catch {
        const validatedPath = validateCheckpointFilePath(filePath, resolvedProject, 'snapshot file')
        snapFiles.push({ path: validatedPath, content: '', existed: false })
      }
    }
  } else {
    // Snapshot root-level files in project (same behavior as old in-memory version)
    const ignore = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.next', '__pycache__', '.venv', 'venv', 'build', '.cache'])
    try {
      const entries = await fs.promises.readdir(resolvedProject, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && !ignore.has(entry.name) && !entry.name.startsWith('.')) {
          const filePath = path.join(resolvedProject, entry.name)
          try {
            const content = await fs.promises.readFile(filePath, 'utf-8')
            snapFiles.push({ path: filePath, content, existed: true })
          } catch {}
        }
      }
    } catch {}
  }

  // Write checkpoint to disk
  const fDir = filesDir(sessionId, id)
  await fs.promises.mkdir(fDir, { recursive: true })

  const meta: CheckpointMeta = {
    id,
    sessionId,
    messageId,
    timestamp: Date.now(),
    label,
    files: snapFiles.map(f => ({ path: f.path, existed: f.existed })),
  }

  // Write file contents
  for (let i = 0; i < snapFiles.length; i++) {
    await fs.promises.writeFile(path.join(fDir, `${i}.snap`), snapFiles[i].content, 'utf-8')
  }

  // Write metadata
  await fs.promises.writeFile(metaPath(sessionId, id), JSON.stringify(meta), 'utf-8')

  // Evict old checkpoints if over limit
  await evictOldCheckpoints(sessionId)

  return meta
}

export async function restoreCheckpoint(
  sessionId: string,
  checkpointId: string,
  projectPath: string,
): Promise<{ restored: number; errors: string[] }> {
  let restored = 0
  const errors: string[] = []

  try {
    validateId(sessionId, 'session id')
    validateId(checkpointId, 'checkpoint id')
  } catch (err: any) {
    return { restored: 0, errors: [err.message || 'Invalid checkpoint id'] }
  }

  let resolvedProject = ''
  try {
    resolvedProject = resolveProjectPath(projectPath)
  } catch (err: any) {
    return { restored: 0, errors: [err.message || 'Invalid project path'] }
  }

  try {
    const raw = await fs.promises.readFile(metaPath(sessionId, checkpointId), 'utf-8')
    const meta: CheckpointMeta = JSON.parse(raw)
    const fDir = filesDir(sessionId, checkpointId)

    for (let i = 0; i < meta.files.length; i++) {
      const fileMeta = meta.files[i]
      try {
        if (!fileMeta || typeof fileMeta.path !== 'string') {
          throw new Error('Invalid checkpoint file entry')
        }
        const validatedPath = validateCheckpointFilePath(fileMeta.path, resolvedProject, 'restore file')
        const snapPath = path.join(fDir, `${i}.snap`)
        if (fileMeta.existed) {
          const content = await fs.promises.readFile(snapPath, 'utf-8')
          // Ensure parent directory exists
          await fs.promises.mkdir(path.dirname(validatedPath), { recursive: true })
          await fs.promises.writeFile(validatedPath, content, 'utf-8')
          restored++
        } else {
          // File didn't exist at checkpoint time — delete it
          try {
            await fs.promises.unlink(validatedPath)
            restored++
          } catch {}
        }
      } catch (err: any) {
        errors.push(`${fileMeta?.path || 'unknown'}: ${err.message || 'Failed to restore'}`)
      }
    }
  } catch (err: any) {
    errors.push(`Failed to read checkpoint: ${err.message}`)
  }

  return { restored, errors }
}

export async function listCheckpoints(sessionId: string): Promise<CheckpointMeta[]> {
  try {
    validateId(sessionId, 'session id')
  } catch {
    return []
  }
  const sDir = sessionDir(sessionId)
  try {
    const entries = await fs.promises.readdir(sDir, { withFileTypes: true })
    const metas: CheckpointMeta[] = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const raw = await fs.promises.readFile(metaPath(sessionId, entry.name), 'utf-8')
        metas.push(JSON.parse(raw))
      } catch {}
    }

    // Sort by timestamp descending (newest first)
    metas.sort((a, b) => b.timestamp - a.timestamp)
    return metas
  } catch {
    return []
  }
}

export async function deleteCheckpoint(sessionId: string, checkpointId?: string): Promise<void> {
  validateId(sessionId, 'session id')
  if (checkpointId) validateId(checkpointId, 'checkpoint id')
  if (checkpointId) {
    // Delete a single checkpoint
    const dir = cpDir(sessionId, checkpointId)
    try {
      await fs.promises.rm(dir, { recursive: true, force: true })
    } catch {}
  } else {
    // Delete all checkpoints for a session
    const dir = sessionDir(sessionId)
    try {
      await fs.promises.rm(dir, { recursive: true, force: true })
    } catch {}
  }
}

async function evictOldCheckpoints(sessionId: string): Promise<void> {
  const metas = await listCheckpoints(sessionId)
  if (metas.length > MAX_CHECKPOINTS_PER_SESSION) {
    // Remove oldest checkpoints (metas is sorted newest-first)
    const toRemove = metas.slice(MAX_CHECKPOINTS_PER_SESSION)
    for (const meta of toRemove) {
      await deleteCheckpoint(sessionId, meta.id)
    }
  }

  // Limit total sessions with checkpoints
  try {
    const entries = await fs.promises.readdir(checkpointsDir, { withFileTypes: true })
    const sessionDirs = entries.filter(e => e.isDirectory()).map(e => e.name)
    if (sessionDirs.length > MAX_SESSIONS_WITH_CHECKPOINTS) {
      // Get modification times and sort by oldest
      const dirStats = await Promise.all(
        sessionDirs.map(async (name) => {
          try {
            const stat = await fs.promises.stat(path.join(checkpointsDir, name))
            return { name, mtimeMs: stat.mtimeMs }
          } catch {
            return { name, mtimeMs: 0 }
          }
        })
      )
      dirStats.sort((a, b) => a.mtimeMs - b.mtimeMs)
      const excess = dirStats.slice(0, dirStats.length - MAX_SESSIONS_WITH_CHECKPOINTS)
      for (const dir of excess) {
        await deleteCheckpoint(dir.name)
      }
    }
  } catch {}
}
