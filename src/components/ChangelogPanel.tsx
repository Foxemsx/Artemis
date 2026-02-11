import { useState, useEffect } from 'react'
import {
  RefreshCw, Tag, GitCommit, ChevronDown, ChevronRight,
  ExternalLink, Download, Clock, User, FileText, Loader2,
  Package, AlertCircle
} from 'lucide-react'

interface ChangelogEntry {
  tag: string
  name: string
  body: string
  publishedAt: string
  htmlUrl: string
  prerelease: boolean
  commits: Array<{
    sha: string
    message: string
    author: string
    date: string
    htmlUrl: string
  }>
  assets: Array<{
    name: string
    downloadUrl: string
    size: number
    downloadCount: number
  }>
}

export default function ChangelogPanel() {
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentVersion, setCurrentVersion] = useState('')
  const [expandedTags, setExpandedTags] = useState<Set<string>>(new Set())

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [entries, version] = await Promise.all([
        window.artemis.update.getChangelog(),
        window.artemis.update.getCurrentVersion(),
      ])
      setChangelog(entries)
      setCurrentVersion(version)
      // Auto-expand the first (latest) release
      if (entries.length > 0) {
        setExpandedTags(new Set([entries[0].tag]))
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch changelog')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const toggleTag = (tag: string) => {
    setExpandedTags(prev => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const parseCommitMessage = (message: string) => {
    const firstLine = message.split('\n')[0]
    const match = firstLine.match(/^(\w+)(?:\(([^)]+)\))?:\s*(.+)/)
    if (match) {
      return { type: match[1], scope: match[2] || null, subject: match[3] }
    }
    return { type: null, scope: null, subject: firstLine }
  }

  const getCommitTypeColor = (type: string | null) => {
    switch (type) {
      case 'feat': return 'var(--success)'
      case 'fix': return 'var(--error)'
      case 'docs': return 'var(--info, #60a5fa)'
      case 'chore': return 'var(--text-muted)'
      case 'refactor': return 'var(--warning)'
      case 'style': return '#c084fc'
      case 'test': return '#f472b6'
      case 'perf': return '#fb923c'
      default: return 'var(--text-secondary)'
    }
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--accent-glow)' }}
          >
            <FileText size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Changelog
            </h2>
            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {currentVersion ? `Current: v${currentVersion}` : 'Loading...'}
              {changelog.length > 0 && ` · ${changelog.length} release${changelog.length !== 1 ? 's' : ''}`}
            </p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="p-2 rounded-lg transition-all duration-150"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' }}
          title="Refresh changelog"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3" style={{ scrollbarWidth: 'thin' }}>
        {loading && changelog.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Fetching releases from GitHub...</span>
          </div>
        )}

        {error && (
          <div
            className="flex items-start gap-3 p-4 rounded-lg"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.15)',
            }}
          >
            <AlertCircle size={16} style={{ color: 'var(--error)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--error)' }}>Failed to load changelog</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{error}</p>
              <button
                onClick={fetchData}
                className="text-[10px] mt-2 font-medium underline"
                style={{ color: 'var(--accent)' }}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && changelog.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Package size={24} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No releases found</span>
          </div>
        )}

        {/* Release entries */}
        <div className="space-y-3">
          {changelog.map((entry, idx) => {
            const isExpanded = expandedTags.has(entry.tag)
            const isCurrent = entry.tag === `v${currentVersion}`
            const isLatest = idx === 0

            return (
              <div
                key={entry.tag}
                className="rounded-xl overflow-hidden"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: isCurrent
                    ? '1px solid rgba(var(--accent-rgb), 0.3)'
                    : '1px solid var(--border-subtle)',
                }}
              >
                {/* Release header */}
                <button
                  onClick={() => toggleTag(entry.tag)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all duration-100"
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  {isExpanded
                    ? <ChevronDown size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    : <ChevronRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  }
                  <Tag size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                        {entry.name || entry.tag}
                      </span>
                      {isCurrent && (
                        <span
                          className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full tracking-wide"
                          style={{
                            backgroundColor: 'var(--accent-glow)',
                            color: 'var(--accent)',
                            border: '1px solid rgba(var(--accent-rgb), 0.2)',
                          }}
                        >
                          Current
                        </span>
                      )}
                      {isLatest && !isCurrent && (
                        <span
                          className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full tracking-wide"
                          style={{
                            backgroundColor: 'rgba(74, 222, 128, 0.1)',
                            color: 'var(--success)',
                            border: '1px solid rgba(74, 222, 128, 0.15)',
                          }}
                        >
                          Latest
                        </span>
                      )}
                      {entry.prerelease && (
                        <span
                          className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full tracking-wide"
                          style={{
                            backgroundColor: 'rgba(251, 191, 36, 0.1)',
                            color: 'var(--warning)',
                            border: '1px solid rgba(251, 191, 36, 0.15)',
                          }}
                        >
                          Pre-release
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        <Clock size={9} /> {formatDate(entry.publishedAt)}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {entry.commits.length} commit{entry.commits.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      window.artemis.shell.openExternal(entry.htmlUrl)
                    }}
                    className="p-1.5 rounded-md transition-all cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                    title="View on GitHub"
                  >
                    <ExternalLink size={12} />
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div
                    className="px-4 pb-4"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                  >
                    {/* Release body/notes */}
                    {entry.body && (
                      <div className="mt-3 mb-3">
                        <div
                          className="text-[11px] leading-relaxed whitespace-pre-wrap rounded-lg p-3"
                          style={{
                            color: 'var(--text-secondary)',
                            backgroundColor: 'var(--bg-elevated)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          {entry.body}
                        </div>
                      </div>
                    )}

                    {/* Download assets */}
                    {entry.assets.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <Download size={10} style={{ color: 'var(--text-muted)' }} />
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Downloads
                          </span>
                        </div>
                        <div className="space-y-1">
                          {entry.assets.map(asset => (
                            <button
                              key={asset.name}
                              onClick={() => window.artemis.shell.openExternal(asset.downloadUrl)}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-all"
                              style={{
                                backgroundColor: 'var(--bg-elevated)',
                                border: '1px solid var(--border-subtle)',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                                e.currentTarget.style.borderColor = 'rgba(var(--accent-rgb), 0.3)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
                                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                              }}
                            >
                              <Package size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                              <span className="text-[11px] font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
                                {asset.name}
                              </span>
                              <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                                {formatSize(asset.size)}
                              </span>
                              <span className="text-[9px] shrink-0 flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
                                <Download size={8} /> {asset.downloadCount}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Commits */}
                    {entry.commits.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-2">
                          <GitCommit size={10} style={{ color: 'var(--text-muted)' }} />
                          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Commits
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {entry.commits.map(commit => {
                            const parsed = parseCommitMessage(commit.message)
                            return (
                              <div
                                key={commit.sha}
                                className="flex items-start gap-2 px-2.5 py-1.5 rounded-md transition-all group cursor-pointer"
                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
                                onClick={() => window.artemis.shell.openExternal(commit.htmlUrl)}
                              >
                                {/* Commit type badge */}
                                {parsed.type && (
                                  <span
                                    className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                                    style={{
                                      backgroundColor: `color-mix(in srgb, ${getCommitTypeColor(parsed.type)} 12%, transparent)`,
                                      color: getCommitTypeColor(parsed.type),
                                    }}
                                  >
                                    {parsed.type}
                                  </span>
                                )}
                                <div className="flex-1 min-w-0">
                                  <span className="text-[11px] block truncate" style={{ color: 'var(--text-secondary)' }}>
                                    {parsed.scope && (
                                      <span style={{ color: 'var(--text-muted)' }}>({parsed.scope}) </span>
                                    )}
                                    {parsed.subject}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                    {commit.sha.slice(0, 7)}
                                  </span>
                                  <ExternalLink
                                    size={9}
                                    style={{ color: 'var(--text-muted)', opacity: 0 }}
                                    className="group-hover:opacity-100 transition-opacity"
                                  />
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
