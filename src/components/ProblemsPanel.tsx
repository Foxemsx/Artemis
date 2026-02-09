import { useState, useCallback, useEffect } from 'react'
import { AlertTriangle, AlertCircle, Info, RefreshCw, FileText, ChevronDown, ChevronRight } from 'lucide-react'

interface Problem {
  file: string
  line: number
  col: number
  severity: 'error' | 'warning' | 'info'
  message: string
  source: string
}

interface GroupedProblems {
  file: string
  problems: Problem[]
}

interface Props {
  projectPath: string | null
  onOpenFile?: (filePath: string) => void
}

function parseTscOutput(output: string, projectPath: string): Problem[] {
  const problems: Problem[] = []
  const lines = output.split('\n')
  // TSC output format: file(line,col): error TS1234: message
  const regex = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s+(.+)$/
  for (const line of lines) {
    const match = line.trim().match(regex)
    if (match) {
      const filePath = match[1].replace(/\\/g, '/')
      const relativePath = filePath.startsWith(projectPath.replace(/\\/g, '/'))
        ? filePath.slice(projectPath.replace(/\\/g, '/').length + 1)
        : filePath
      problems.push({
        file: relativePath,
        line: parseInt(match[2]),
        col: parseInt(match[3]),
        severity: match[4] as 'error' | 'warning',
        message: match[6],
        source: match[5],
      })
    }
  }
  return problems
}

function groupByFile(problems: Problem[]): GroupedProblems[] {
  const map = new Map<string, Problem[]>()
  for (const p of problems) {
    const existing = map.get(p.file) || []
    existing.push(p)
    map.set(p.file, existing)
  }
  return Array.from(map.entries()).map(([file, problems]) => ({ file, problems }))
}

export default function ProblemsPanel({ projectPath, onOpenFile }: Props) {
  const [problems, setProblems] = useState<Problem[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [lastRun, setLastRun] = useState<string | null>(null)
  const [commandsEnabled, setCommandsEnabled] = useState(false)

  const runCheck = useCallback(async () => {
    if (!projectPath) return

    const allowed = await window.artemis.security.requestCapability('commands')
    if (!allowed) return
    setCommandsEnabled(true)

    setLoading(true)
    try {
      const result = await window.artemis.tools.runCommand(
        'npx tsc --noEmit --pretty false',
        projectPath
      )
      const output = result.stdout || result.stderr || ''
      const parsed = parseTscOutput(output, projectPath)
      setProblems(parsed)
      // Auto-expand all files
      setExpandedFiles(new Set(parsed.map(p => p.file)))
      setLastRun(new Date().toLocaleTimeString())
    } catch (err) {
      console.error('[ProblemsPanel] Failed to run tsc:', err)
    }
    setLoading(false)
  }, [projectPath])

  useEffect(() => {
    if (!projectPath) return
    let cancelled = false
    window.artemis.security.getCapabilities()
      .then((caps) => {
        if (cancelled) return
        setCommandsEnabled(!!caps.commands)
        if (caps.commands) runCheck()
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [projectPath, runCheck])

  const grouped = groupByFile(problems)
  const errorCount = problems.filter(p => p.severity === 'error').length
  const warningCount = problems.filter(p => p.severity === 'warning').length

  const toggleFile = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  const SeverityIcon = ({ severity }: { severity: Problem['severity'] }) => {
    switch (severity) {
      case 'error': return <AlertCircle size={12} style={{ color: 'var(--error)', flexShrink: 0 }} />
      case 'warning': return <AlertTriangle size={12} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
      default: return <Info size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between h-9 px-3 shrink-0"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            Problems
          </span>
          {errorCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(192,57,43,0.15)', color: 'var(--error)' }}>
              {errorCount} error{errorCount !== 1 ? 's' : ''}
            </span>
          )}
          {warningCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: 'var(--warning, #f59e0b)' }}>
              {warningCount} warning{warningCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {lastRun && <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{lastRun}</span>}
          {!commandsEnabled && (
            <button
              onClick={runCheck}
              disabled={!projectPath}
              className="px-2 py-1 rounded text-[10px] font-medium transition-colors"
              style={{ color: 'var(--accent)', backgroundColor: 'rgba(212,168,83,0.10)', border: '1px solid rgba(212,168,83,0.25)' }}
              title="Enable command execution to run TypeScript checks"
            >
              Enable
            </button>
          )}
          <button
            onClick={runCheck}
            disabled={loading}
            className="p-1 rounded transition-colors"
            style={{ color: loading ? 'var(--text-muted)' : 'var(--text-secondary)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
            title="Re-run TypeScript check"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && problems.length === 0 && (
          <div className="flex items-center justify-center h-32">
            <span className="text-[11px] animate-pulse" style={{ color: 'var(--text-muted)' }}>Running TypeScript check...</span>
          </div>
        )}

        {!loading && problems.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(74,222,128,0.1)' }}>
              <AlertCircle size={14} style={{ color: '#4ade80' }} />
            </div>
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No problems found</span>
          </div>
        )}

        {grouped.map(group => (
          <div key={group.file}>
            <button
              onClick={() => toggleFile(group.file)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors"
              style={{ backgroundColor: 'var(--bg-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'var(--bg-secondary)' }}
            >
              {expandedFiles.has(group.file) ? <ChevronDown size={10} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={10} style={{ color: 'var(--text-muted)' }} />}
              <FileText size={11} style={{ color: 'var(--text-muted)' }} />
              <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>{group.file}</span>
              <span className="text-[10px] font-mono ml-auto shrink-0" style={{ color: 'var(--text-muted)' }}>{group.problems.length}</span>
            </button>
            {expandedFiles.has(group.file) && group.problems.map((problem, j) => (
              <div
                key={j}
                className="flex items-start gap-2 px-3 py-1 pl-8 cursor-pointer transition-colors"
                onClick={() => {
                  if (onOpenFile && projectPath) {
                    onOpenFile(`${projectPath}/${problem.file}`.replace(/\\/g, '/'))
                  }
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <SeverityIcon severity={problem.severity} />
                <span className="text-[11px] flex-1 min-w-0" style={{ color: 'var(--text-secondary)' }}>
                  {problem.message}
                </span>
                <span className="text-[9px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {problem.source} [{problem.line}:{problem.col}]
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
