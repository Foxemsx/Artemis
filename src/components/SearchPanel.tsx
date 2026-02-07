import { useState, useCallback, useRef, useEffect } from 'react'
import { Search, FileText, ChevronDown, ChevronRight, Replace, X } from 'lucide-react'

interface SearchResult {
  file: string
  line: number
  text: string
  col?: number
}

interface GroupedResults {
  file: string
  matches: SearchResult[]
}

interface Props {
  projectPath: string | null
  onOpenFile?: (filePath: string) => void
}

function groupByFile(results: SearchResult[]): GroupedResults[] {
  const map = new Map<string, SearchResult[]>()
  for (const r of results) {
    const existing = map.get(r.file) || []
    existing.push(r)
    map.set(r.file, existing)
  }
  return Array.from(map.entries()).map(([file, matches]) => ({ file, matches }))
}

export default function SearchPanel({ projectPath, onOpenFile }: Props) {
  const [query, setQuery] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [isRegex, setIsRegex] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [replacing, setReplacing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const doSearch = useCallback(async (searchQuery: string) => {
    if (!projectPath || !searchQuery.trim()) {
      setResults([])
      return
    }
    setLoading(true)
    try {
      const pattern = caseSensitive ? searchQuery : `(?i)${searchQuery}`
      const rawResults = await window.artemis.tools.searchFiles(
        isRegex ? pattern : searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        projectPath
      )
      if (Array.isArray(rawResults)) {
        setResults(rawResults.map(r => ({
          file: r.file.replace(/\\/g, '/'),
          line: r.line,
          text: r.text,
        })))
        setExpandedFiles(new Set(rawResults.map(r => r.file.replace(/\\/g, '/'))))
      }
    } catch (err) {
      console.error('[SearchPanel] Search failed:', err)
    }
    setLoading(false)
  }, [projectPath, isRegex, caseSensitive])

  const handleInputChange = (value: string) => {
    setQuery(value)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => doSearch(value), 300)
  }

  const handleReplace = async (file: string, line: number, oldText: string) => {
    if (!projectPath || !replaceText) return
    setReplacing(true)
    try {
      const filePath = file.startsWith(projectPath.replace(/\\/g, '/')) ? file : `${projectPath}/${file}`.replace(/\\/g, '/')
      const content = await window.artemis.fs.readFile(filePath)
      const lines = content.split('\n')
      if (lines[line - 1]) {
        lines[line - 1] = lines[line - 1].replace(query, replaceText)
        await window.artemis.fs.writeFile(filePath, lines.join('\n'))
        // Re-run search to update results
        await doSearch(query)
      }
    } catch (err) {
      console.error('[SearchPanel] Replace failed:', err)
    }
    setReplacing(false)
  }

  const handleReplaceAll = async () => {
    if (!projectPath || !replaceText || !query) return
    setReplacing(true)
    try {
      const grouped = groupByFile(results)
      for (const group of grouped) {
        const filePath = group.file.startsWith(projectPath.replace(/\\/g, '/')) ? group.file : `${projectPath}/${group.file}`.replace(/\\/g, '/')
        try {
          let content = await window.artemis.fs.readFile(filePath)
          if (isRegex) {
            const flags = caseSensitive ? 'g' : 'gi'
            content = content.replace(new RegExp(query, flags), replaceText)
          } else {
            const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const flags = caseSensitive ? 'g' : 'gi'
            content = content.replace(new RegExp(escaped, flags), replaceText)
          }
          await window.artemis.fs.writeFile(filePath, content)
        } catch {}
      }
      await doSearch(query)
    } catch (err) {
      console.error('[SearchPanel] Replace all failed:', err)
    }
    setReplacing(false)
  }

  const grouped = groupByFile(results)
  const totalMatches = results.length
  const fileCount = grouped.length

  const toggleFile = (file: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="shrink-0 px-3 py-2 space-y-1.5"
        style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
            Search
          </span>
          {totalMatches > 0 && (
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {totalMatches} result{totalMatches !== 1 ? 's' : ''} in {fileCount} file{fileCount !== 1 ? 's' : ''}
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setShowReplace(!showReplace)}
              className="p-1 rounded transition-colors"
              style={{ color: showReplace ? 'var(--accent)' : 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Toggle replace"
            >
              <Replace size={12} />
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-1">
          <div
            className="flex-1 flex items-center rounded-md px-2 py-1"
            style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}
          >
            <Search size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doSearch(query) }}
              placeholder="Search files..."
              className="flex-1 bg-transparent border-none outline-none text-[11px] ml-1.5"
              style={{ color: 'var(--text-primary)' }}
              spellCheck={false}
            />
            {query && (
              <button onClick={() => { setQuery(''); setResults([]) }} className="p-0.5" style={{ color: 'var(--text-muted)' }}>
                <X size={10} />
              </button>
            )}
          </div>
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className="px-1.5 py-1 rounded text-[10px] font-mono font-bold transition-colors"
            style={{
              color: caseSensitive ? 'var(--accent)' : 'var(--text-muted)',
              backgroundColor: caseSensitive ? 'var(--accent-glow)' : 'transparent',
              border: `1px solid ${caseSensitive ? 'var(--accent)' : 'var(--border-subtle)'}`,
            }}
            title="Match case"
          >
            Aa
          </button>
          <button
            onClick={() => setIsRegex(!isRegex)}
            className="px-1.5 py-1 rounded text-[10px] font-mono font-bold transition-colors"
            style={{
              color: isRegex ? 'var(--accent)' : 'var(--text-muted)',
              backgroundColor: isRegex ? 'var(--accent-glow)' : 'transparent',
              border: `1px solid ${isRegex ? 'var(--accent)' : 'var(--border-subtle)'}`,
            }}
            title="Use regex"
          >
            .*
          </button>
        </div>

        {/* Replace input */}
        {showReplace && (
          <div className="flex items-center gap-1">
            <div
              className="flex-1 flex items-center rounded-md px-2 py-1"
              style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}
            >
              <Replace size={11} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <input
                value={replaceText}
                onChange={e => setReplaceText(e.target.value)}
                placeholder="Replace with..."
                className="flex-1 bg-transparent border-none outline-none text-[11px] ml-1.5"
                style={{ color: 'var(--text-primary)' }}
                spellCheck={false}
              />
            </div>
            <button
              onClick={handleReplaceAll}
              disabled={replacing || !query || !replaceText}
              className="px-2 py-1 rounded text-[10px] font-semibold transition-colors"
              style={{
                backgroundColor: query && replaceText ? 'rgba(212, 168, 83, 0.12)' : 'var(--bg-elevated)',
                color: query && replaceText ? 'var(--accent)' : 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                opacity: replacing ? 0.5 : 1,
              }}
              title="Replace all"
            >
              All
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <span className="text-[11px] animate-pulse" style={{ color: 'var(--text-muted)' }}>Searching...</span>
          </div>
        )}

        {!loading && query && results.length === 0 && (
          <div className="flex items-center justify-center h-20">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No results found</span>
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
              <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {group.file}
              </span>
              <span className="text-[10px] font-mono ml-auto shrink-0" style={{ color: 'var(--text-muted)' }}>
                {group.matches.length}
              </span>
            </button>
            {expandedFiles.has(group.file) && group.matches.map((match, j) => (
              <div
                key={j}
                className="flex items-start gap-2 px-3 py-1 pl-8 cursor-pointer transition-colors group"
                onClick={() => {
                  if (onOpenFile && projectPath) {
                    const fullPath = match.file.startsWith('/') || match.file.includes(':')
                      ? match.file
                      : `${projectPath}/${match.file}`.replace(/\\/g, '/')
                    onOpenFile(fullPath)
                  }
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <span className="text-[10px] font-mono shrink-0 w-8 text-right" style={{ color: 'var(--text-muted)' }}>
                  {match.line}
                </span>
                <span className="text-[11px] font-mono flex-1 min-w-0 truncate" style={{ color: 'var(--text-secondary)' }}>
                  {match.text}
                </span>
                {showReplace && replaceText && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleReplace(match.file, match.line, match.text) }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity"
                    style={{ color: 'var(--accent)' }}
                    title="Replace this match"
                  >
                    <Replace size={10} />
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
