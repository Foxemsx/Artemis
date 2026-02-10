import { useState, useEffect, useCallback } from 'react'
import {
  GitBranch, GitCommit, RefreshCw, Plus, Minus, Check, X, ChevronDown, ChevronRight,
  Upload, Download, RotateCcw, FileText, Trash2, Eye, FolderOpen, Sparkles, Loader2,
} from 'lucide-react'
import { playSound, showNotification, type SoundSettings } from '../lib/sounds'

interface GitFileStatus {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
  staged: boolean
}

interface GitBranchInfo {
  current: string
  branches: string[]
}

interface Props {
  projectPath: string | null
  onOpenFile?: (filePath: string) => void
  isRestrictedMode?: boolean
  soundSettings?: SoundSettings
}

function parseGitStatus(raw: string): GitFileStatus[] {
  const files: GitFileStatus[] = []
  const lines = raw.split('\n').filter(l => l.trim())

  for (const line of lines) {
    if (line.length < 4) continue
    const x = line[0] // index (staged) status
    const y = line[1] // work tree status
    const path = line.slice(3).trim().replace(/^"(.+)"$/, '$1')
    if (!path) continue

    // Staged changes
    if (x !== ' ' && x !== '?') {
      let status: GitFileStatus['status'] = 'modified'
      if (x === 'A') status = 'added'
      else if (x === 'D') status = 'deleted'
      else if (x === 'R') status = 'renamed'
      else if (x === 'U') status = 'conflicted'
      files.push({ path, status, staged: true })
    }

    // Unstaged changes
    if (y !== ' ' && y !== '?') {
      let status: GitFileStatus['status'] = 'modified'
      if (y === 'D') status = 'deleted'
      else if (y === 'U') status = 'conflicted'
      // Avoid duplicating if already in staged with same path
      const existing = files.find(f => f.path === path && f.staged)
      if (!existing || y !== x) {
        files.push({ path, status, staged: false })
      }
    }

    // Untracked
    if (x === '?' && y === '?') {
      files.push({ path, status: 'untracked', staged: false })
    }
  }

  return files
}

const STATUS_COLORS: Record<GitFileStatus['status'], string> = {
  modified: '#e2b93d',
  added: '#4ade80',
  deleted: '#f87171',
  renamed: '#60a5fa',
  untracked: '#94a3b8',
  conflicted: '#f97316',
}

const STATUS_LABELS: Record<GitFileStatus['status'], string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
  conflicted: 'C',
}

export default function SourceControlPanel({ projectPath, onOpenFile, isRestrictedMode = false, soundSettings }: Props) {
  const [files, setFiles] = useState<GitFileStatus[]>([])
  const [branch, setBranch] = useState<GitBranchInfo>({ current: '', branches: [] })
  const [commitMsg, setCommitMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [diffText, setDiffText] = useState<string | null>(null)
  const [diffFile, setDiffFile] = useState<string | null>(null)
  const [stagedExpanded, setStagedExpanded] = useState(true)
  const [unstagedExpanded, setUnstagedExpanded] = useState(true)
  const [isGitRepo, setIsGitRepo] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [pulling, setPulling] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const runGit = useCallback(async (args: string[]): Promise<string> => {
    if (!projectPath) throw new Error('No project open')
    const result = await window.artemis.git.run(args, projectPath)
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed with exit code ${result.exitCode}`)
    }
    return result.stdout
  }, [projectPath])

  const refresh = useCallback(async () => {
    if (!projectPath) return
    setLoading(true)
    setError(null)

    try {
      // Check if this is a git repo
      try {
        await runGit(['rev-parse', '--is-inside-work-tree'])
        setIsGitRepo(true)
      } catch {
        setIsGitRepo(false)
        setLoading(false)
        return
      }

      // Get current branch
      try {
        const branchName = (await runGit(['branch', '--show-current'])).trim()
        const branchList = (await runGit(['branch', '--no-color'])).split('\n')
          .map(b => b.replace(/^\*?\s+/, '').trim())
          .filter(Boolean)
        setBranch({ current: branchName || 'HEAD (detached)', branches: branchList })
      } catch {
        setBranch({ current: 'unknown', branches: [] })
      }

      // Get status
      const statusRaw = await runGit(['status', '--porcelain'])
      setFiles(parseGitStatus(statusRaw))
    } catch (err: any) {
      setError(err.message || 'Failed to get git status')
    } finally {
      setLoading(false)
    }
  }, [projectPath, runGit])

  useEffect(() => { refresh() }, [refresh])

  const stageFile = useCallback(async (path: string) => {
    if (isRestrictedMode) return
    try {
      await runGit(['add', path])
      await refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }, [runGit, refresh])

  const unstageFile = useCallback(async (path: string) => {
    if (isRestrictedMode) return
    try {
      await runGit(['reset', 'HEAD', path])
      await refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }, [runGit, refresh])

  const stageAll = useCallback(async () => {
    if (isRestrictedMode) return
    try {
      await runGit(['add', '-A'])
      await refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }, [runGit, refresh])

  const unstageAll = useCallback(async () => {
    if (isRestrictedMode) return
    try {
      await runGit(['reset', 'HEAD'])
      await refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }, [runGit, refresh])

  const discardFile = useCallback(async (path: string) => {
    if (isRestrictedMode) return
    try {
      await runGit(['checkout', '--', path])
      await refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }, [runGit, refresh])

  const commit = useCallback(async () => {
    if (isRestrictedMode || !commitMsg.trim()) return
    try {
      await runGit(['commit', '-m', commitMsg.trim()])
      setCommitMsg('')
      if (soundSettings) {
        playSound('task-done', soundSettings)
        showNotification('Commit Successful', `Committed: ${commitMsg.trim().slice(0, 60)}`, soundSettings)
      }
      setSuccessMsg('Committed successfully')
      setTimeout(() => setSuccessMsg(null), 3000)
      await refresh()
    } catch (err: any) {
      setError(err.message)
    }
  }, [commitMsg, runGit, refresh])

  const push = useCallback(async () => {
    if (isRestrictedMode) return
    setPushing(true)
    try {
      await runGit(['push'])
      if (soundSettings) {
        playSound('task-done', soundSettings)
        showNotification('Push Successful', `Pushed to ${branch.current}`, soundSettings)
      }
      setSuccessMsg('Pushed successfully')
      setTimeout(() => setSuccessMsg(null), 3000)
      await refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPushing(false)
    }
  }, [runGit, refresh, soundSettings, branch.current])

  const pull = useCallback(async () => {
    if (isRestrictedMode) return
    setPulling(true)
    try {
      await runGit(['pull'])
      await refresh()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPulling(false)
    }
  }, [runGit, refresh])

  const showDiff = useCallback(async (path: string, staged: boolean) => {
    try {
      const diff = await runGit(staged ? ['diff', '--cached', '--', path] : ['diff', '--', path])
      setDiffText(diff || '(no diff)')
      setDiffFile(path)
    } catch (err: any) {
      setDiffText(`Error: ${err.message}`)
      setDiffFile(path)
    }
  }, [runGit])

  const stagedFiles = files.filter(f => f.staged)
  const unstagedFiles = files.filter(f => !f.staged)

  const generateCommitMessage = useCallback(async () => {
    if (!projectPath) return
    setGenerating(true)
    setError(null)
    try {
      // Get the staged diff (or all diff if nothing staged)
      let diff: string
      const hasStaged = files.some(f => f.staged)
      try {
        diff = hasStaged
          ? await runGit(['diff', '--cached'])
          : await runGit(['diff'])
      } catch {
        diff = ''
      }
      if (!diff.trim()) {
        setError('No diff available to generate a commit message from. Stage some changes first.')
        setGenerating(false)
        return
      }
      const result = await window.artemis.commitMessage.generate(diff)
      if (result.error) {
        setError(result.error)
      } else if (result.message) {
        setCommitMsg(result.message)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate commit message')
    } finally {
      setGenerating(false)
    }
  }, [projectPath, runGit, files])

  if (!projectPath) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <FolderOpen size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
        <p className="text-[11px] mt-3 text-center" style={{ color: 'var(--text-muted)' }}>
          Open a project to use Source Control
        </p>
      </div>
    )
  }

  if (!isGitRepo) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <GitBranch size={24} style={{ color: 'var(--text-muted)', opacity: 0.5 }} />
        <p className="text-[12px] mt-3 font-medium text-center" style={{ color: 'var(--text-secondary)' }}>
          Not a Git Repository
        </p>
        <p className="text-[10px] mt-1 text-center" style={{ color: 'var(--text-muted)' }}>
          Initialize a repository to track changes.
        </p>
        <button
          onClick={async () => {
            try {
              await runGit(['init'])
              setIsGitRepo(true)
              await refresh()
            } catch (err: any) {
              setError(err.message)
            }
          }}
          className="mt-4 px-4 py-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 transition-all"
          style={{ backgroundColor: 'var(--accent)', color: '#000' }}
        >
          <Plus size={12} />
          Initialize Repository
        </button>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <GitBranch size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            Source Control
          </span>
          {files.length > 0 && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--accent)' }}
            >
              {files.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={pull}
            disabled={pulling}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
            title="Pull"
          >
            <Download size={13} className={pulling ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={push}
            disabled={pushing}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
            title="Push"
          >
            <Upload size={13} className={pushing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Branch Info */}
      <div
        className="flex items-center gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <GitBranch size={11} style={{ color: 'var(--accent)' }} />
        <span className="text-[11px] font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
          {branch.current}
        </span>
      </div>

      {/* Commit Input */}
      <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={commitMsg}
            onChange={e => setCommitMsg(e.target.value)}
            placeholder="Commit message..."
            className="flex-1 px-3 py-1.5 rounded-md text-[11px] outline-none transition-all"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            onFocus={e => { e.target.style.borderColor = 'var(--accent)' }}
            onBlur={e => { e.target.style.borderColor = 'var(--border-subtle)' }}
            onKeyDown={e => { if (e.key === 'Enter' && commitMsg.trim()) commit() }}
          />
          <button
            onClick={generateCommitMessage}
            disabled={generating || files.length === 0}
            className="px-2 py-1.5 rounded-md text-[10px] font-semibold flex items-center gap-1 transition-all shrink-0"
            style={{
              backgroundColor: 'rgba(167, 139, 250, 0.08)',
              color: generating ? 'var(--text-muted)' : '#a78bfa',
              border: '1px solid rgba(167, 139, 250, 0.2)',
            }}
            onMouseEnter={e => { if (!generating) e.currentTarget.style.backgroundColor = 'rgba(167, 139, 250, 0.18)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(167, 139, 250, 0.08)' }}
            title="AI Generate Commit Message"
          >
            {generating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          </button>
          <button
            onClick={commit}
            disabled={!commitMsg.trim() || stagedFiles.length === 0}
            className="px-3 py-1.5 rounded-md text-[10px] font-semibold flex items-center gap-1.5 transition-all shrink-0"
            style={{
              backgroundColor: commitMsg.trim() && stagedFiles.length > 0 ? 'var(--accent)' : 'var(--bg-elevated)',
              color: commitMsg.trim() && stagedFiles.length > 0 ? '#000' : 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <GitCommit size={11} />
            Commit
          </button>
        </div>
      </div>

      {/* Success */}
      {successMsg && (
        <div className="px-3 py-2 shrink-0" style={{ backgroundColor: 'rgba(74, 222, 128, 0.06)', borderBottom: '1px solid rgba(74, 222, 128, 0.15)' }}>
          <div className="flex items-center gap-2">
            <Check size={11} className="shrink-0" style={{ color: '#4ade80' }} />
            <p className="text-[10px] font-medium" style={{ color: '#4ade80' }}>{successMsg}</p>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-3 py-2 shrink-0" style={{ backgroundColor: 'rgba(248, 113, 113, 0.06)', borderBottom: '1px solid rgba(248, 113, 113, 0.15)' }}>
          <div className="flex items-start gap-2">
            <X size={11} className="shrink-0 mt-0.5" style={{ color: '#f87171' }} />
            <p className="text-[10px] leading-relaxed" style={{ color: '#f87171' }}>{error.slice(0, 200)}</p>
            <button onClick={() => setError(null)} className="ml-auto shrink-0 p-0.5 rounded" style={{ color: '#f87171' }}>
              <X size={9} />
            </button>
          </div>
        </div>
      )}

      {/* File Lists */}
      <div className="flex-1 overflow-y-auto">
        {/* Staged Changes */}
        <div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setStagedExpanded(!stagedExpanded)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setStagedExpanded(!stagedExpanded) }}
            className="w-full flex items-center justify-between px-3 py-1.5 text-left cursor-pointer select-none"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="flex items-center gap-1.5">
              {stagedExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Staged Changes
              </span>
              {stagedFiles.length > 0 && (
                <span className="text-[9px] px-1 rounded" style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)', color: '#4ade80' }}>
                  {stagedFiles.length}
                </span>
              )}
            </div>
            {stagedFiles.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); unstageAll() }}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Unstage All"
              >
                <Minus size={11} />
              </button>
            )}
          </div>
          {stagedExpanded && stagedFiles.map(f => (
            <FileRow
              key={`staged-${f.path}`}
              file={f}
              onStage={() => unstageFile(f.path)}
              onDiscard={() => discardFile(f.path)}
              onShowDiff={() => showDiff(f.path, true)}
              onOpen={() => onOpenFile?.(projectPath + '/' + f.path)}
              staged
            />
          ))}
          {stagedExpanded && stagedFiles.length === 0 && (
            <p className="text-[10px] px-4 py-2" style={{ color: 'var(--text-muted)' }}>No staged changes</p>
          )}
        </div>

        {/* Unstaged Changes */}
        <div>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setUnstagedExpanded(!unstagedExpanded)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setUnstagedExpanded(!unstagedExpanded) }}
            className="w-full flex items-center justify-between px-3 py-1.5 text-left cursor-pointer select-none"
            style={{ backgroundColor: 'var(--bg-secondary)' }}
          >
            <div className="flex items-center gap-1.5">
              {unstagedExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                Changes
              </span>
              {unstagedFiles.length > 0 && (
                <span className="text-[9px] px-1 rounded" style={{ backgroundColor: 'rgba(226, 185, 61, 0.15)', color: '#e2b93d' }}>
                  {unstagedFiles.length}
                </span>
              )}
            </div>
            {unstagedFiles.length > 0 && (
              <button
                onClick={e => { e.stopPropagation(); stageAll() }}
                className="p-0.5 rounded transition-colors"
                style={{ color: 'var(--text-muted)' }}
                title="Stage All"
              >
                <Plus size={11} />
              </button>
            )}
          </div>
          {unstagedExpanded && unstagedFiles.map(f => (
            <FileRow
              key={`unstaged-${f.path}`}
              file={f}
              onStage={() => stageFile(f.path)}
              onDiscard={() => discardFile(f.path)}
              onShowDiff={() => showDiff(f.path, false)}
              onOpen={() => onOpenFile?.(projectPath + '/' + f.path)}
              staged={false}
            />
          ))}
          {unstagedExpanded && unstagedFiles.length === 0 && (
            <p className="text-[10px] px-4 py-2" style={{ color: 'var(--text-muted)' }}>No changes</p>
          )}
        </div>

        {/* Inline Diff Viewer */}
        {diffText && diffFile && (
          <div className="mx-3 my-2 rounded-lg overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
            <div
              className="flex items-center justify-between px-3 py-1.5"
              style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}
            >
              <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>
                {diffFile}
              </span>
              <button onClick={() => { setDiffText(null); setDiffFile(null) }} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
                <X size={10} />
              </button>
            </div>
            <pre
              className="text-[10px] leading-[16px] p-2 overflow-auto max-h-[300px] font-mono"
              style={{ backgroundColor: 'rgba(0,0,0,0.15)', color: 'var(--text-secondary)' }}
            >
              {diffText.split('\n').map((line, i) => {
                let color = 'var(--text-muted)'
                let bg = 'transparent'
                if (line.startsWith('+') && !line.startsWith('+++')) { color = '#4ade80'; bg = 'rgba(74, 222, 128, 0.06)' }
                else if (line.startsWith('-') && !line.startsWith('---')) { color = '#f87171'; bg = 'rgba(248, 113, 113, 0.06)' }
                else if (line.startsWith('@@')) { color = '#60a5fa'; bg = 'rgba(96, 165, 250, 0.06)' }
                return (
                  <div key={i} style={{ color, backgroundColor: bg }}>{line}</div>
                )
              })}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

function FileRow({ file, onStage, onDiscard, onShowDiff, onOpen, staged }: {
  file: GitFileStatus
  onStage: () => void
  onDiscard: () => void
  onShowDiff: () => void
  onOpen: () => void
  staged: boolean
}) {
  const fileName = file.path.split('/').pop() || file.path
  const dirPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''

  return (
    <div
      className="flex items-center gap-1.5 px-4 py-1 group/row transition-colors cursor-pointer"
      style={{ borderBottom: '1px solid transparent' }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
      onClick={onShowDiff}
    >
      <FileText size={11} style={{ color: STATUS_COLORS[file.status], flexShrink: 0, opacity: 0.7 }} />
      <span className="text-[11px] truncate flex-1 min-w-0" style={{ color: 'var(--text-primary)' }}>
        {fileName}
        {dirPath && (
          <span className="ml-1.5" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>{dirPath}</span>
        )}
      </span>
      <span
        className="text-[9px] font-mono font-bold w-3 text-center shrink-0"
        style={{ color: STATUS_COLORS[file.status] }}
        title={file.status}
      >
        {STATUS_LABELS[file.status]}
      </span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
        <button
          onClick={e => { e.stopPropagation(); onOpen() }}
          className="p-0.5 rounded"
          style={{ color: 'var(--text-muted)' }}
          title="Open File"
        >
          <Eye size={10} />
        </button>
        {!staged && file.status !== 'untracked' && (
          <button
            onClick={e => { e.stopPropagation(); onDiscard() }}
            className="p-0.5 rounded"
            style={{ color: '#f87171' }}
            title="Discard Changes"
          >
            <RotateCcw size={10} />
          </button>
        )}
        <button
          onClick={e => { e.stopPropagation(); onStage() }}
          className="p-0.5 rounded"
          style={{ color: staged ? '#e2b93d' : '#4ade80' }}
          title={staged ? 'Unstage' : 'Stage'}
        >
          {staged ? <Minus size={10} /> : <Plus size={10} />}
        </button>
      </div>
    </div>
  )
}
