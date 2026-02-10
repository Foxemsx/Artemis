
export interface Checkpoint {
  id: string
  sessionId: string
  messageId: string
  timestamp: number
  label: string
  files: Array<{ path: string; existed: boolean }>
}

// In-memory metadata cache (lightweight — no file content, only paths + labels)
const metadataCache = new Map<string, Checkpoint[]>()

export function getCheckpoints(sessionId: string): Checkpoint[] {
  return metadataCache.get(sessionId) || []
}

export async function loadCheckpoints(sessionId: string): Promise<Checkpoint[]> {
  try {
    const metas = await window.artemis.checkpoint.list(sessionId)
    metadataCache.set(sessionId, metas)
    return metas
  } catch {
    return []
  }
}

export async function createCheckpoint(
  sessionId: string,
  messageId: string,
  label: string,
  projectPath: string,
  filesToTrack?: string[],
): Promise<Checkpoint> {
  const meta = await window.artemis.checkpoint.create(
    sessionId, messageId, label, projectPath, filesToTrack,
  )

  // Update metadata cache
  const existing = metadataCache.get(sessionId) || []
  existing.unshift(meta)
  if (existing.length > 20) existing.pop()
  metadataCache.set(sessionId, existing)

  return meta
}

export async function restoreCheckpoint(checkpoint: Checkpoint): Promise<{ restored: number; errors: string[] }> {
  return window.artemis.checkpoint.restore(checkpoint.sessionId, checkpoint.id)
}

export async function deleteCheckpoints(sessionId: string, checkpointId?: string): Promise<void> {
  await window.artemis.checkpoint.delete(sessionId, checkpointId)
  if (checkpointId) {
    const existing = metadataCache.get(sessionId) || []
    metadataCache.set(sessionId, existing.filter(c => c.id !== checkpointId))
  } else {
    metadataCache.delete(sessionId)
  }
}

export function clearCheckpointCache(sessionId: string): void {
  metadataCache.delete(sessionId)
}

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
