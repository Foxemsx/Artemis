import { useState, useEffect, useCallback } from 'react'
import { Search, Download, Check, X, Package, ExternalLink, RefreshCw, Loader2, Server, Database, FileText, Wrench, Cloud } from 'lucide-react'

// ─── Types ──────────────────────────────────────────────────────────────────

interface MCPServer {
  id: string
  name: string
  description: string
  author: string
  version: string
  category: 'code' | 'data' | 'docs' | 'productivity' | 'devops'
  icon: string
  npmPackage?: string
  repoUrl?: string
  tools?: string[]
  installed?: boolean
  configuredAt?: number
}

// ─── Category Icons ─────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, typeof Server> = {
  code: Server,
  data: Database,
  docs: FileText,
  productivity: Wrench,
  devops: Cloud,
}

const CATEGORY_COLORS: Record<string, string> = {
  code: '#4ade80',
  data: '#22d3ee',
  docs: '#fbbf24',
  productivity: '#a78bfa',
  devops: '#f97316',
}

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  visible?: boolean
}

export default function MCPMarketplace({ visible = true }: Props) {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load servers on mount
  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.artemis.mcp.getServers()
      setServers(result)
    } catch (err: any) {
      setError(err.message || 'Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInstall = useCallback(async (serverId: string) => {
    setInstallingId(serverId)
    try {
      const result = await window.artemis.mcp.installServer(serverId)
      if (result.success) {
        setServers(prev => prev.map(s =>
          s.id === serverId ? { ...s, installed: true, configuredAt: Date.now() } : s
        ))
      } else {
        setError(result.error || 'Install failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setInstallingId(null)
    }
  }, [])

  const handleUninstall = useCallback(async (serverId: string) => {
    try {
      const result = await window.artemis.mcp.uninstallServer(serverId)
      if (result.success) {
        setServers(prev => prev.map(s =>
          s.id === serverId ? { ...s, installed: false, configuredAt: undefined } : s
        ))
      }
    } catch (err: any) {
      setError(err.message)
    }
  }, [])

  // Filter servers
  const filteredServers = servers.filter(s => {
    const matchesSearch = !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || s.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const categories = ['code', 'data', 'docs', 'productivity', 'devops']
  const installedCount = servers.filter(s => s.installed).length

  if (!visible) return null

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Header */}
      <div
        className="px-4 py-3 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package size={16} style={{ color: 'var(--accent)' }} />
            <h2 className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>
              MCP Marketplace
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-md" style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--accent)' }}>
              {installedCount} active
            </span>
            <button
              onClick={loadServers}
              className="p-1 rounded-md transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Refresh"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <Search size={13} style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search MCP servers..."
            className="flex-1 bg-transparent text-[12px] outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')}>
              <X size={12} style={{ color: 'var(--text-muted)' }} />
            </button>
          )}
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 mt-2 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className="px-2 py-1 rounded-md text-[10px] font-medium shrink-0 transition-all"
            style={{
              backgroundColor: !selectedCategory ? 'var(--accent-glow)' : 'transparent',
              color: !selectedCategory ? 'var(--accent)' : 'var(--text-muted)',
              border: !selectedCategory ? '1px solid rgba(var(--accent-rgb), 0.12)' : '1px solid transparent',
            }}
          >
            All
          </button>
          {categories.map(cat => {
            const isActive = selectedCategory === cat
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(isActive ? null : cat)}
                className="px-2 py-1 rounded-md text-[10px] font-medium shrink-0 capitalize transition-all"
                style={{
                  backgroundColor: isActive ? `${CATEGORY_COLORS[cat]}15` : 'transparent',
                  color: isActive ? CATEGORY_COLORS[cat] : 'var(--text-muted)',
                  border: isActive ? `1px solid ${CATEGORY_COLORS[cat]}30` : '1px solid transparent',
                }}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      {/* Server List */}
      <div className="flex-1 overflow-y-auto px-3 py-2" style={{ scrollbarWidth: 'thin' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-[11px]" style={{ color: 'var(--error)' }}>{error}</p>
            <button
              onClick={loadServers}
              className="mt-2 text-[11px] px-3 py-1 rounded-md"
              style={{ color: 'var(--accent)', backgroundColor: 'var(--accent-glow)' }}
            >
              Retry
            </button>
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="text-center py-8">
            <Package size={20} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', opacity: 0.4 }} />
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No servers found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredServers.map(server => {
              const CatIcon = CATEGORY_ICONS[server.category] || Package
              const catColor = CATEGORY_COLORS[server.category] || 'var(--accent)'
              const isInstalling = installingId === server.id

              return (
                <div
                  key={server.id}
                  className="rounded-xl p-3.5 transition-all duration-150"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: server.installed
                      ? `1px solid ${catColor}30`
                      : '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Header Row */}
                  <div className="flex items-start gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[16px]"
                      style={{ backgroundColor: `${catColor}12` }}
                    >
                      {server.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {server.name}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${catColor}12`, color: catColor }}>
                          {server.category}
                        </span>
                        {server.installed && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-md font-semibold" style={{ backgroundColor: 'rgba(74, 222, 128, 0.1)', color: 'var(--success)' }}>
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        by {server.author} · v{server.version}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {server.description}
                  </p>

                  {/* Tools */}
                  {server.tools && server.tools.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      {server.tools.slice(0, 4).map(tool => (
                        <span
                          key={tool}
                          className="text-[9px] px-1.5 py-0.5 rounded-md font-mono"
                          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                        >
                          {tool}
                        </span>
                      ))}
                      {server.tools.length > 4 && (
                        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                          +{server.tools.length - 4} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    {server.installed ? (
                      <button
                        onClick={() => handleUninstall(server.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                        style={{ backgroundColor: 'rgba(192, 57, 43, 0.08)', color: 'var(--error)', border: '1px solid rgba(192, 57, 43, 0.15)' }}
                        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(192, 57, 43, 0.15)' }}
                        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(192, 57, 43, 0.08)' }}
                      >
                        <X size={11} />
                        Remove
                      </button>
                    ) : (
                      <button
                        onClick={() => handleInstall(server.id)}
                        disabled={isInstalling}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                        style={{
                          backgroundColor: isInstalling ? 'var(--bg-elevated)' : 'var(--accent)',
                          color: isInstalling ? 'var(--text-muted)' : '#000',
                        }}
                      >
                        {isInstalling ? (
                          <><Loader2 size={11} className="animate-spin" /> Installing...</>
                        ) : (
                          <><Download size={11} /> Install</>
                        )}
                      </button>
                    )}

                    {server.repoUrl && (
                      <a
                        href={server.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] transition-all"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
                      >
                        <ExternalLink size={10} />
                        Repo
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2.5 shrink-0"
        style={{ borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}
      >
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          MCP servers extend your AI agent with tools for external services.
          Active servers are auto-detected by the active model.
        </p>
      </div>
    </div>
  )
}
