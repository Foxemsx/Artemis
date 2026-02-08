/**
 * Checkpoint System — Snapshots project file state before each agent run.
 * Stores file contents in memory so the user can revert to any checkpoint.
 */

export interface FileSnapshot {
  path: string
  content: string
  existed: boolean
}

export interface Checkpoint {
  id: string
  sessionId: string
  messageId: string
  timestamp: number
  label: string
  files: FileSnapshot[]
}

// In-memory checkpoint store (per session)
const checkpoints = new Map<string, Checkpoint[]>()

/** Get all checkpoints for a session */
export function getCheckpoints(sessionId: string): Checkpoint[] {
  return checkpoints.get(sessionId) || []
}

/** Add a checkpoint */
export function addCheckpoint(checkpoint: Checkpoint): void {
  const existing = checkpoints.get(checkpoint.sessionId) || []
  existing.push(checkpoint)
  // Keep max 20 checkpoints per session
  if (existing.length > 20) existing.shift()
  checkpoints.set(checkpoint.sessionId, existing)
}

/**
 * Create a checkpoint by reading all files the agent might modify.
 * We snapshot tracked files: any files mentioned in the conversation or
 * previously modified by the agent in this session.
 */
export async function createCheckpoint(
  sessionId: string,
  messageId: string,
  label: string,
  projectPath: string,
  filesToTrack?: string[],
): Promise<Checkpoint> {
  const files: FileSnapshot[] = []

  // If specific files provided, snapshot those
  if (filesToTrack && filesToTrack.length > 0) {
    for (const filePath of filesToTrack) {
      try {
        const content = await window.artemis.fs.readFile(filePath)
        files.push({ path: filePath, content, existed: true })
      } catch {
        files.push({ path: filePath, content: '', existed: false })
      }
    }
  } else {
    // Snapshot top-level project files as a baseline
    try {
      const entries = await window.artemis.fs.readDir(projectPath)
      const ignore = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.next', '__pycache__', '.venv', 'venv', 'build', '.cache'])
      for (const entry of entries) {
        if (entry.type === 'file' && !ignore.has(entry.name) && !entry.name.startsWith('.')) {
          const filePath = `${projectPath}/${entry.name}`.replace(/\\/g, '/')
          try {
            const content = await window.artemis.fs.readFile(filePath)
            files.push({ path: filePath, content, existed: true })
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Can't read project dir
    }
  }

  const checkpoint: Checkpoint = {
    id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    sessionId,
    messageId,
    timestamp: Date.now(),
    label,
    files,
  }

  addCheckpoint(checkpoint)
  return checkpoint
}

/**
 * Restore a checkpoint — writes all snapshot files back to disk.
 * Files that didn't exist at checkpoint time are deleted.
 */
export async function restoreCheckpoint(checkpoint: Checkpoint): Promise<{ restored: number; errors: string[] }> {
  let restored = 0
  const errors: string[] = []

  for (const snap of checkpoint.files) {
    try {
      if (snap.existed) {
        await window.artemis.fs.writeFile(snap.path, snap.content)
        restored++
      } else {
        // File didn't exist at checkpoint time — try to delete it
        try {
          await window.artemis.fs.delete(snap.path)
          restored++
        } catch {
          // File may already not exist
        }
      }
    } catch (err: any) {
      errors.push(`${snap.path}: ${err.message || 'Failed to restore'}`)
    }
  }

  return { restored, errors }
}

/**
 * Collect file paths that might be modified from tool calls in messages.
 * Used to determine which files to snapshot.
 */
export function extractModifiedFiles(parts: Array<{ type: string; toolCall?: { name: string; args: Record<string, unknown> } }>): string[] {
  const files = new Set<string>()
  for (const part of parts) {
    if (part.type === 'tool-call' && part.toolCall) {
      const args = part.toolCall.args || {}
      const name = part.toolCall.name
      if (['write_file', 'str_replace', 'delete_file', 'read_file'].includes(name)) {
        const path = (args.path || args.file_path) as string | undefined
        if (path) files.add(path.replace(/\\/g, '/'))
      }
      if (name === 'move_file') {
        const oldPath = args.old_path as string | undefined
        const newPath = args.new_path as string | undefined
        if (oldPath) files.add(oldPath.replace(/\\/g, '/'))
        if (newPath) files.add(newPath.replace(/\\/g, '/'))
      }
    }
  }
  return Array.from(files)
}
