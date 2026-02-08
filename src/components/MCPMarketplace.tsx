import { useState, useEffect, useCallback, useRef } from 'react'
import { Search, Download, X, Package, ExternalLink, RefreshCw, Loader2, Plus, Terminal, Trash2, Eye } from 'lucide-react'

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

interface MCPLogEntry {
  timestamp: number
  stream: 'stdout' | 'stderr'
  message: string
}

// ─── Category Colors ────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  code: '#4ade80',
  data: '#22d3ee',
  docs: '#fbbf24',
  productivity: '#a78bfa',
  devops: '#f97316',
}

// ─── Brand SVG Icons ────────────────────────────────────────────────────────

const BrandIcon = ({ icon, size = 24 }: { icon: string; size?: number }) => {
  const s = size
  const common = { width: s, height: s, viewBox: '0 0 24 24', fill: 'currentColor' }
  switch (icon) {
    case 'github':
      return <svg {...common}><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
    case 'git':
      return <svg {...common}><path d="M23.546 10.93L13.067.452a1.55 1.55 0 00-2.188 0L8.708 2.627l2.76 2.76a1.838 1.838 0 012.327 2.341l2.66 2.66a1.838 1.838 0 011.9 3.039 1.837 1.837 0 01-2.6 0 1.846 1.846 0 01-.404-2.003l-2.48-2.48v6.53a1.844 1.844 0 01.494 3.028 1.838 1.838 0 01-2.598 0 1.838 1.838 0 010-2.598c.18-.18.387-.316.61-.406V8.836a1.834 1.834 0 01-.61-.406 1.844 1.844 0 01-.334-2.063L7.4 3.58.454 10.527a1.55 1.55 0 000 2.188l10.48 10.48a1.55 1.55 0 002.186 0l10.426-10.078a1.55 1.55 0 000-2.188z" fill="#F05032"/></svg>
    case 'docker':
      return <svg {...common}><path d="M13.983 11.078h2.119a.186.186 0 00.186-.185V9.006a.186.186 0 00-.186-.186h-2.119a.186.186 0 00-.187.186v1.887c0 .103.084.185.187.185zm-2.954-5.43h2.118a.186.186 0 00.187-.185V3.576a.186.186 0 00-.187-.186h-2.118a.186.186 0 00-.187.186v1.887c0 .102.084.185.187.185zm0 2.716h2.118a.187.187 0 00.187-.186V6.29a.186.186 0 00-.187-.186h-2.118a.187.187 0 00-.187.186v1.887c0 .103.084.186.187.186zm-2.93 0h2.12a.186.186 0 00.186-.186V6.29a.186.186 0 00-.186-.186H8.1a.186.186 0 00-.185.186v1.887c0 .103.083.186.185.186zm-2.964 0h2.119a.186.186 0 00.185-.186V6.29a.186.186 0 00-.185-.186H5.136a.186.186 0 00-.186.186v1.887c0 .103.084.186.186.186zm5.893 2.715h2.118a.186.186 0 00.187-.185V9.006a.186.186 0 00-.187-.186h-2.118a.187.187 0 00-.187.186v1.887c0 .103.084.185.187.185zm-2.93 0h2.12a.185.185 0 00.185-.185V9.006a.185.185 0 00-.185-.186H8.1a.185.185 0 00-.185.186v1.887c0 .103.083.185.185.185zm-2.964 0h2.119a.186.186 0 00.185-.185V9.006a.186.186 0 00-.185-.186H5.136a.186.186 0 00-.186.186v1.887c0 .103.084.185.186.185zm-2.92 0h2.12a.185.185 0 00.184-.185V9.006a.185.185 0 00-.184-.186h-2.12a.185.185 0 00-.184.186v1.887c0 .103.082.185.185.185zM23.763 9.89c-.065-.051-.672-.51-1.954-.51-.338.001-.676.03-1.01.087-.248-1.7-1.653-2.53-1.716-2.566l-.344-.199-.226.327c-.284.438-.49.922-.612 1.43-.23.97-.09 1.882.403 2.661-.595.332-1.55.413-1.744.42H.751a.751.751 0 00-.75.748 11.687 11.687 0 00.692 4.062c.545 1.428 1.355 2.48 2.41 3.124 1.18.723 3.1 1.137 5.275 1.137.983.003 1.963-.086 2.93-.266a12.248 12.248 0 003.823-1.389c.98-.567 1.86-1.288 2.61-2.136 1.252-1.418 1.998-2.997 2.553-4.4h.221c1.372 0 2.215-.549 2.68-1.009.309-.293.55-.65.707-1.046l.098-.288Z" fill="#2496ED"/></svg>
    case 'notion':
      return <svg {...common}><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.39 2.33c-.42-.326-.98-.7-2.055-.607L3.39 2.77c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.84-.046.933-.56.933-1.167V6.354c0-.606-.233-.933-.746-.886l-15.177.84c-.56.047-.747.327-.747.98zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.747 0-.933-.234-1.493-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.886.747-.933zM2.332 1.164l13.728-.98c1.68-.14 2.1.093 2.8.606l3.876 2.707c.467.327.607.42.607.793v15.858c0 .98-.373 1.587-1.68 1.68l-15.458.933c-.98.047-1.448-.093-1.962-.747l-3.13-4.06c-.56-.747-.793-1.307-.793-1.96V2.797c0-.84.373-1.54 1.354-1.633z"/></svg>
    case 'slack':
      return <svg {...common}><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z" fill="#E01E5A"/></svg>
    case 'postgres':
      return <svg {...common} viewBox="0 0 25.6 25.6"><path d="M18.983 18.636c.163-1.357.075-1.58 1.017-1.399l.233.024c.7.04 1.617-.1 2.15-.36.58-.286 1.6-.9.685-.747-2.084.346-2.234-.273-2.234-.273 2.213-3.283 3.14-7.444 2.34-8.459-.218-.278-.5-.494-.82-.632a3.609 3.609 0 00-2.468-.12c-.393.098-.683.248-.683.248s.466-.194 1.6-.09c.704.064 1.263.45 1.455.652-1.146-.026-2.045.29-2.716.634-.39.2-.616.382-.616.382s.175-.057.398-.108c.632-.144 1.313-.18 1.958.027-1.848.607-3.335 1.95-3.85 5.23-.144.917-.233 1.315-.375 1.773l-.04.138c-.16.53-.243.91-.282 1.344-.003.038-.01.074-.01.108-.005.08-.004.162.003.249.004.063.012.125.023.186.042.254.11.507.2.753.077.209.182.408.313.59l.02.027c.296.418.61.577.915.793.66.467 1.33.648 1.783.49.383-.134.607-.6.66-.94z" fill="#336791"/></svg>
    default:
      return <Package size={size} />
  }
}

// ─── Tab Types ──────────────────────────────────────────────────────────────

type TabId = 'all' | 'installed' | 'custom' | 'logs'

// ─── Component ──────────────────────────────────────────────────────────────

interface Props {
  visible?: boolean
}

interface MCPConnectionInfo {
  id: string
  name: string
  connected: boolean
  toolCount: number
  tools: string[]
}

export default function MCPMarketplace({ visible = true }: Props) {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<MCPConnectionInfo[]>([])
  const [activeTab, setActiveTab] = useState<TabId>('all')
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customCommand, setCustomCommand] = useState('')
  const [customArgs, setCustomArgs] = useState('')
  const [customDescription, setCustomDescription] = useState('')
  const [logsServerId, setLogsServerId] = useState<string | null>(null)
  const [logs, setLogs] = useState<MCPLogEntry[]>([])
  const logsEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadServers() }, [])

  useEffect(() => {
    if (logsServerId) {
      const interval = setInterval(async () => {
        try {
          const l = await window.artemis.mcp.getServerLogs(logsServerId)
          setLogs((l || []) as MCPLogEntry[])
        } catch { /* ignore */ }
      }, 2000)
      window.artemis.mcp.getServerLogs(logsServerId).then(l => setLogs((l || []) as MCPLogEntry[])).catch(() => {})
      return () => clearInterval(interval)
    }
  }, [logsServerId])

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const loadServers = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [result, status] = await Promise.all([
        window.artemis.mcp.getServers(),
        window.artemis.mcp.getConnectionStatus().catch(() => [] as MCPConnectionInfo[]),
      ])
      setServers(result)
      setConnectionStatus(status)
    } catch (err: any) {
      setError(err.message || 'Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const status = await window.artemis.mcp.getConnectionStatus()
      setConnectionStatus(status)
    } catch { /* ignore */ }
  }, [])

  const handleInstall = useCallback(async (serverId: string) => {
    setInstallingId(serverId)
    try {
      const result = await window.artemis.mcp.installServer(serverId)
      if (result.success) {
        setServers(prev => prev.map(s =>
          s.id === serverId ? { ...s, installed: true, configuredAt: Date.now() } : s
        ))
        setTimeout(refreshStatus, 1500)
      } else {
        setError(result.error || 'Install failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setInstallingId(null)
    }
  }, [refreshStatus])

  const handleUninstall = useCallback(async (serverId: string) => {
    try {
      const result = await window.artemis.mcp.uninstallServer(serverId)
      if (result.success) {
        setServers(prev => prev.map(s =>
          s.id === serverId ? { ...s, installed: false, configuredAt: undefined } : s
        ))
        setConnectionStatus(prev => prev.filter(c => c.id !== serverId))
      }
    } catch (err: any) {
      setError(err.message)
    }
  }, [])

  const handleAddCustomServer = useCallback(async () => {
    if (!customName.trim() || !customCommand.trim()) return
    const id = 'custom-' + customName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    const args = customArgs.split(/\s+/).filter(Boolean)
    try {
      const result = await window.artemis.mcp.addCustomServer({
        id, name: customName, description: customDescription || 'Custom MCP server',
        command: customCommand, args,
      })
      if (result.success) {
        setShowAddCustom(false)
        setCustomName(''); setCustomCommand(''); setCustomArgs(''); setCustomDescription('')
        loadServers()
      } else {
        setError(result.error || 'Failed to add custom server')
      }
    } catch (err: any) {
      setError(err.message)
    }
  }, [customName, customCommand, customArgs, customDescription, loadServers])

  const handleRemoveCustomServer = useCallback(async (serverId: string) => {
    try {
      await window.artemis.mcp.removeCustomServer(serverId)
      loadServers()
    } catch (err: any) {
      setError(err.message)
    }
  }, [loadServers])

  const openExternal = useCallback((url: string) => {
    window.artemis.shell.openExternal(url).catch(() => {})
  }, [])

  // Filter servers
  const filteredServers = servers.filter(s => {
    if (activeTab === 'installed') return s.installed
    if (activeTab === 'custom') return s.author === 'Custom'
    const matchesSearch = !searchQuery ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = !selectedCategory || s.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const categories = ['code', 'data', 'docs', 'productivity', 'devops']
  const installedCount = servers.filter(s => s.installed).length
  const connectedCount = connectionStatus.filter(c => c.connected).length

  if (!visible) return null

  // ─── Logs Panel ───────────────────────────────────────────────────────────
  if (activeTab === 'logs') {
    const installedServers = servers.filter(s => s.installed)
    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
        {renderHeader()}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Server selector */}
          <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <Terminal size={12} style={{ color: 'var(--text-muted)' }} />
            <select
              value={logsServerId || ''}
              onChange={e => setLogsServerId(e.target.value || null)}
              className="flex-1 bg-transparent text-[11px] outline-none"
              style={{ color: 'var(--text-primary)', backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 8px' }}
            >
              <option value="">Select a server...</option>
              {installedServers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {logsServerId && (
              <button
                onClick={() => { window.artemis.mcp.clearServerLogs(logsServerId); setLogs([]) }}
                className="text-[10px] px-2 py-1 rounded-md"
                style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-elevated)' }}
              >
                Clear
              </button>
            )}
          </div>
          {/* Log output */}
          <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-[10px]" style={{ scrollbarWidth: 'thin' }}>
            {!logsServerId ? (
              <div className="text-center py-8">
                <Terminal size={20} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', opacity: 0.4 }} />
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Select a server to view logs</p>
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No logs yet</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {logs.map((log, i) => (
                  <div key={i} className="flex gap-2 leading-tight py-0.5">
                    <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className="font-bold"
                      style={{ color: log.stream === 'stderr' ? '#ef4444' : '#22d3ee', minWidth: 40 }}
                    >
                      {log.stream}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', wordBreak: 'break-all' }}>{log.message}</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Render Helpers ────────────────────────────────────────────────────────

  function renderHeader() {
    return (
      <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <Package size={18} style={{ color: 'var(--accent)' }} />
            <h2 className="text-[15px] font-bold" style={{ color: 'var(--text-primary)' }}>MCP Marketplace</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1.5 font-medium" style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--accent)' }}>
              {connectedCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#4ade80' }} />
                  {connectedCount}
                </span>
              )}
              {installedCount > connectedCount && (
                <span>{connectedCount > 0 ? '/' : ''}{installedCount - connectedCount} off</span>
              )}
              {installedCount === 0 && '0'}
            </span>
            <button
              onClick={loadServers}
              className="p-1.5 rounded-md transition-all"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
              title="Refresh"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-1 mb-3">
          {([
            { id: 'all' as TabId, label: 'All' },
            { id: 'installed' as TabId, label: `Installed (${installedCount})` },
            { id: 'custom' as TabId, label: 'Custom' },
            { id: 'logs' as TabId, label: 'Logs' },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all"
              style={{
                backgroundColor: activeTab === tab.id ? 'var(--accent-glow)' : 'transparent',
                color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {/* Search - only on All tab */}
        {activeTab === 'all' && (
          <>
            <div
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg"
              style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
            >
              <Search size={15} style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search servers..."
                className="flex-1 bg-transparent text-[13px] outline-none"
                style={{ color: 'var(--text-primary)' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')}>
                  <X size={14} style={{ color: 'var(--text-muted)' }} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto">
              <button
                onClick={() => setSelectedCategory(null)}
                className="px-3 py-1 rounded-lg text-[11px] font-medium shrink-0 transition-all"
                style={{
                  backgroundColor: !selectedCategory ? 'var(--accent-glow)' : 'transparent',
                  color: !selectedCategory ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                All
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
                  className="px-3 py-1 rounded-lg text-[11px] font-medium shrink-0 capitalize transition-all"
                  style={{
                    backgroundColor: selectedCategory === cat ? `${CATEGORY_COLORS[cat]}15` : 'transparent',
                    color: selectedCategory === cat ? CATEGORY_COLORS[cat] : 'var(--text-muted)',
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  // ─── Main Render ───────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {renderHeader()}

      {/* Add Custom Server Form */}
      {activeTab === 'custom' && (
        <div className="px-3 py-2 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          {showAddCustom ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Add Custom Server</span>
                <button onClick={() => setShowAddCustom(false)}>
                  <X size={12} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
              <input
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Server name"
                className="w-full px-2.5 py-1.5 rounded-md text-[11px] outline-none"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <input
                value={customCommand}
                onChange={e => setCustomCommand(e.target.value)}
                placeholder="Command (e.g. npx, node, python)"
                className="w-full px-2.5 py-1.5 rounded-md text-[11px] outline-none font-mono"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <input
                value={customArgs}
                onChange={e => setCustomArgs(e.target.value)}
                placeholder="Arguments (space-separated)"
                className="w-full px-2.5 py-1.5 rounded-md text-[11px] outline-none font-mono"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <input
                value={customDescription}
                onChange={e => setCustomDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-2.5 py-1.5 rounded-md text-[11px] outline-none"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={handleAddCustomServer}
                disabled={!customName.trim() || !customCommand.trim()}
                className="w-full py-1.5 rounded-md text-[11px] font-semibold transition-all"
                style={{
                  backgroundColor: customName.trim() && customCommand.trim() ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: customName.trim() && customCommand.trim() ? '#000' : 'var(--text-muted)',
                }}
              >
                Add Server
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddCustom(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-medium transition-all"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px dashed var(--border-subtle)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
            >
              <Plus size={12} />
              Add Custom MCP Server
            </button>
          )}
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="px-3 py-1.5 flex items-center justify-between" style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
          <span className="text-[10px]" style={{ color: '#ef4444' }}>{error}</span>
          <button onClick={() => setError(null)}><X size={10} style={{ color: '#ef4444' }} /></button>
        </div>
      )}

      {/* Server Grid */}
      <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: 'thin' }}>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
        ) : filteredServers.length === 0 ? (
          <div className="text-center py-12">
            <Package size={28} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.4 }} />
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              {activeTab === 'installed' ? 'No installed servers' : activeTab === 'custom' ? 'No custom servers yet' : 'No servers found'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {filteredServers.map(server => {
              const catColor = CATEGORY_COLORS[server.category] || 'var(--accent)'
              const isInstalling = installingId === server.id
              const conn = connectionStatus.find(c => c.id === server.id)
              const isConnected = conn?.connected || false
              const isCustom = server.author === 'Custom'

              return (
                <div
                  key={server.id}
                  className="rounded-xl p-4 transition-all duration-150 flex flex-col"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: server.installed
                      ? `1px solid ${isConnected ? '#4ade8030' : '#fbbf2430'}`
                      : '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Icon + Name Row */}
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${catColor}12`, color: catColor }}
                    >
                      <BrandIcon icon={server.icon} size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                          {server.name}
                        </span>
                        {server.installed && (
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: isConnected ? '#4ade80' : '#fbbf24' }}
                            title={isConnected ? `Connected · ${conn?.toolCount || 0} tools` : 'Disconnected'}
                          />
                        )}
                      </div>
                      <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                        {server.author}{server.version !== '0.0.0' ? ` · v${server.version}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p
                    className="text-[11px] leading-relaxed mb-3 flex-1"
                    style={{ color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {server.description}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 mt-auto">
                    {server.installed ? (
                      <>
                        <button
                          onClick={() => handleUninstall(server.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                          style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                        >
                          <X size={12} /> Remove
                        </button>
                        <button
                          onClick={() => { setActiveTab('logs'); setLogsServerId(server.id) }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all"
                          style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
                          title="View logs"
                        >
                          <Eye size={12} /> Logs
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleInstall(server.id)}
                        disabled={isInstalling}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                        style={{
                          backgroundColor: isInstalling ? 'var(--bg-elevated)' : 'var(--accent)',
                          color: isInstalling ? 'var(--text-muted)' : '#000',
                        }}
                      >
                        {isInstalling ? <><Loader2 size={12} className="animate-spin" /> Installing...</> : <><Download size={12} /> Install</>}
                      </button>
                    )}
                    {isCustom && !server.installed && (
                      <button
                        onClick={() => handleRemoveCustomServer(server.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] transition-all"
                        style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#ef4444' }}
                        title="Delete custom server"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                    {server.repoUrl && (
                      <button
                        onClick={() => openExternal(server.repoUrl!)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] transition-all ml-auto"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                        title="Open in browser"
                      >
                        <ExternalLink size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
