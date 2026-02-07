/**
 * Diff Utilities — Compute and represent file diffs for inline preview.
 * Uses a simple LCS-based diff algorithm (no external deps).
 */

export interface DiffHunk {
  id: string
  oldStart: number
  oldLines: string[]
  newStart: number
  newLines: string[]
  status: 'pending' | 'accepted' | 'rejected'
}

export interface FileDiff {
  filePath: string
  oldContent: string
  newContent: string
  hunks: DiffHunk[]
  isNewFile: boolean
  isDelete: boolean
}

export interface DiffLine {
  type: 'context' | 'add' | 'remove'
  content: string
  oldLineNum?: number
  newLineNum?: number
  hunkId: string
}

// ─── Simple Line Diff ────────────────────────────────────────────────────────

export function computeDiff(oldText: string, newText: string, filePath: string): FileDiff {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const isNewFile = oldText === ''
  const isDelete = newText === ''

  const hunks = computeHunks(oldLines, newLines)
  
  return { filePath, oldContent: oldText, newContent: newText, hunks, isNewFile, isDelete }
}

function computeHunks(oldLines: string[], newLines: string[]): DiffHunk[] {
  // Compute edit script using Myers-like approach (simplified)
  const edits = computeEdits(oldLines, newLines)
  const hunks: DiffHunk[] = []
  
  let i = 0
  while (i < edits.length) {
    // Skip context lines
    if (edits[i].type === 'equal') { i++; continue }
    
    // Found a change — collect consecutive changes with 3-line context
    const contextBefore = 3
    const contextAfter = 3
    
    const hunkStart = i
    let hunkEnd = i
    
    // Extend to include all consecutive changes (with gap merging)
    while (hunkEnd < edits.length) {
      if (edits[hunkEnd].type !== 'equal') {
        hunkEnd++
        continue
      }
      // Check if next change is within merge distance
      let nextChange = hunkEnd
      while (nextChange < edits.length && edits[nextChange].type === 'equal') nextChange++
      if (nextChange < edits.length && nextChange - hunkEnd <= contextAfter + contextBefore) {
        hunkEnd = nextChange + 1
      } else {
        break
      }
    }
    
    // Compute line numbers for this hunk
    let oldStart = 1, newStart = 1
    for (let j = 0; j < hunkStart; j++) {
      if (edits[j].type === 'equal' || edits[j].type === 'remove') oldStart++
      if (edits[j].type === 'equal' || edits[j].type === 'add') newStart++
    }
    
    const removedLines: string[] = []
    const addedLines: string[] = []
    for (let j = hunkStart; j < hunkEnd; j++) {
      if (edits[j].type === 'remove') removedLines.push(edits[j].content)
      if (edits[j].type === 'add') addedLines.push(edits[j].content)
    }
    
    hunks.push({
      id: `hunk-${hunks.length}`,
      oldStart,
      oldLines: removedLines,
      newStart,
      newLines: addedLines,
      status: 'pending',
    })
    
    i = hunkEnd
  }
  
  return hunks
}

interface Edit {
  type: 'equal' | 'add' | 'remove'
  content: string
}

function computeEdits(oldLines: string[], newLines: string[]): Edit[] {
  // Simple LCS-based diff
  const m = oldLines.length
  const n = newLines.length
  
  // For very large files, use a simplified approach
  if (m + n > 10000) {
    return simpleDiff(oldLines, newLines)
  }
  
  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }
  
  // Backtrack to find edits
  const edits: Edit[] = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      edits.unshift({ type: 'equal', content: oldLines[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: 'add', content: newLines[j - 1] })
      j--
    } else {
      edits.unshift({ type: 'remove', content: oldLines[i - 1] })
      i--
    }
  }
  
  return edits
}

function simpleDiff(oldLines: string[], newLines: string[]): Edit[] {
  // Fallback for large files: line-by-line comparison
  const edits: Edit[] = []
  const maxLen = Math.max(oldLines.length, newLines.length)
  
  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined
    const newLine = i < newLines.length ? newLines[i] : undefined
    
    if (oldLine === newLine) {
      edits.push({ type: 'equal', content: oldLine! })
    } else {
      if (oldLine !== undefined) edits.push({ type: 'remove', content: oldLine })
      if (newLine !== undefined) edits.push({ type: 'add', content: newLine })
    }
  }
  
  return edits
}

// ─── Apply Hunks ─────────────────────────────────────────────────────────────

export function applyAcceptedHunks(diff: FileDiff): string {
  // If all hunks are accepted, return new content
  if (diff.hunks.every(h => h.status === 'accepted')) {
    return diff.newContent
  }
  // If all hunks are rejected, return old content
  if (diff.hunks.every(h => h.status === 'rejected')) {
    return diff.oldContent
  }
  
  // Mixed: rebuild from old content, applying only accepted hunks
  const oldLines = diff.oldContent.split('\n')
  const result: string[] = []
  let oldIdx = 0
  
  for (const hunk of diff.hunks) {
    const hunkOldStart = hunk.oldStart - 1 // 0-indexed
    
    // Copy lines before this hunk
    while (oldIdx < hunkOldStart && oldIdx < oldLines.length) {
      result.push(oldLines[oldIdx])
      oldIdx++
    }
    
    if (hunk.status === 'accepted') {
      // Use new lines
      result.push(...hunk.newLines)
      oldIdx += hunk.oldLines.length
    } else {
      // Keep old lines
      for (let i = 0; i < hunk.oldLines.length && oldIdx < oldLines.length; i++) {
        result.push(oldLines[oldIdx])
        oldIdx++
      }
    }
  }
  
  // Copy remaining old lines
  while (oldIdx < oldLines.length) {
    result.push(oldLines[oldIdx])
    oldIdx++
  }
  
  return result.join('\n')
}
