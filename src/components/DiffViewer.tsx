import { useState } from 'react'
import { Check, X, ChevronDown, ChevronRight, FileCode, FilePlus, FileX } from 'lucide-react'
import type { FileDiff, DiffHunk } from '../lib/diffUtils'

interface Props {
  diff: FileDiff
  onAcceptHunk: (hunkId: string) => void
  onRejectHunk: (hunkId: string) => void
  onAcceptAll: () => void
  onRejectAll: () => void
}

export default function DiffViewer({ diff, onAcceptHunk, onRejectHunk, onAcceptAll, onRejectAll }: Props) {
  const [expanded, setExpanded] = useState(true)
  const fileName = diff.filePath.split(/[\\/]/).pop() || diff.filePath
  const pendingCount = diff.hunks.filter(h => h.status === 'pending').length
  const allResolved = pendingCount === 0

  return (
    <div
      className="rounded-lg overflow-hidden my-2"
      style={{ border: '1px solid var(--border-default)', backgroundColor: 'var(--bg-card)' }}
    >
      {/* File Header */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer"
        style={{ backgroundColor: 'var(--bg-elevated)', borderBottom: expanded ? '1px solid var(--border-subtle)' : 'none' }}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          {expanded ? <ChevronDown size={12} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={12} style={{ color: 'var(--text-muted)' }} />}
          {diff.isNewFile ? <FilePlus size={13} style={{ color: 'var(--success)' }} /> :
           diff.isDelete ? <FileX size={13} style={{ color: 'var(--error)' }} /> :
           <FileCode size={13} style={{ color: 'var(--accent)' }} />}
          <span className="text-[11px] font-mono truncate" style={{ color: 'var(--text-primary)' }}>{fileName}</span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {diff.isNewFile ? '(new file)' : diff.isDelete ? '(deleted)' : `${diff.hunks.length} change${diff.hunks.length !== 1 ? 's' : ''}`}
          </span>
          {!allResolved && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(var(--accent-rgb), 0.1)', color: 'var(--accent)' }}>
              {pendingCount} pending
            </span>
          )}
        </div>
        {!allResolved && (
          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onClick={onAcceptAll}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-100"
              style={{ backgroundColor: 'rgba(74, 222, 128, 0.1)', color: 'var(--success)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.1)' }}
            >
              <Check size={10} /> Accept All
            </button>
            <button
              onClick={onRejectAll}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-100"
              style={{ backgroundColor: 'rgba(192, 57, 43, 0.1)', color: 'var(--error)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(192, 57, 43, 0.2)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(192, 57, 43, 0.1)' }}
            >
              <X size={10} /> Reject All
            </button>
          </div>
        )}
      </div>

      {/* Hunks */}
      {expanded && (
        <div className="overflow-x-auto">
          {diff.hunks.map(hunk => (
            <HunkView
              key={hunk.id}
              hunk={hunk}
              onAccept={() => onAcceptHunk(hunk.id)}
              onReject={() => onRejectHunk(hunk.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function HunkView({ hunk, onAccept, onReject }: { hunk: DiffHunk; onAccept: () => void; onReject: () => void }) {
  const isPending = hunk.status === 'pending'
  const isAccepted = hunk.status === 'accepted'
  const isRejected = hunk.status === 'rejected'

  return (
    <div
      style={{
        borderBottom: '1px solid var(--border-subtle)',
        opacity: isRejected ? 0.4 : 1,
      }}
    >
      {/* Hunk header with accept/reject */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          @@ -{hunk.oldStart},{hunk.oldLines.length} +{hunk.newStart},{hunk.newLines.length} @@
        </span>
        {isPending ? (
          <div className="flex items-center gap-1">
            <button
              onClick={onAccept}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all duration-100"
              style={{ color: 'var(--success)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Accept this change"
            >
              <Check size={10} /> Accept
            </button>
            <button
              onClick={onReject}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all duration-100"
              style={{ color: 'var(--error)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(192, 57, 43, 0.15)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Reject this change"
            >
              <X size={10} /> Reject
            </button>
          </div>
        ) : (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded font-semibold"
            style={{
              color: isAccepted ? 'var(--success)' : 'var(--error)',
              backgroundColor: isAccepted ? 'rgba(74, 222, 128, 0.1)' : 'rgba(192, 57, 43, 0.1)',
            }}
          >
            {isAccepted ? 'Accepted' : 'Rejected'}
          </span>
        )}
      </div>

      {/* Diff lines */}
      <div className="font-mono text-[11px] leading-[18px]">
        {hunk.oldLines.map((line, i) => (
          <div
            key={`old-${i}`}
            className="flex"
            style={{
              backgroundColor: isRejected ? 'transparent' : 'rgba(192, 57, 43, 0.08)',
              textDecoration: isRejected ? 'none' : undefined,
            }}
          >
            <span className="w-8 shrink-0 text-right pr-2 select-none" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              {hunk.oldStart + i}
            </span>
            <span className="w-4 shrink-0 text-center select-none" style={{ color: 'var(--error)' }}>-</span>
            <span className="flex-1 px-1 whitespace-pre" style={{ color: 'var(--error)', opacity: 0.85 }}>{line}</span>
          </div>
        ))}
        {hunk.newLines.map((line, i) => (
          <div
            key={`new-${i}`}
            className="flex"
            style={{
              backgroundColor: isRejected ? 'transparent' : 'rgba(74, 222, 128, 0.08)',
            }}
          >
            <span className="w-8 shrink-0 text-right pr-2 select-none" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              {hunk.newStart + i}
            </span>
            <span className="w-4 shrink-0 text-center select-none" style={{ color: 'var(--success)' }}>+</span>
            <span className="flex-1 px-1 whitespace-pre" style={{ color: 'var(--success)', opacity: 0.85 }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
