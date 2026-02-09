import { Files, MessageSquare, Settings, AlertCircle, Search, Package, Heart, Github, GitBranch } from 'lucide-react'
import type { ActivityView } from '../types'

interface Props {
  activeView: ActivityView
  onViewChange: (view: ActivityView) => void
  isReady: boolean
  hasApiKey: boolean
}

const ITEMS: { view: ActivityView; icon: typeof Files; label: string }[] = [
  { view: 'files', icon: Files, label: 'Explorer' },
  { view: 'search', icon: Search, label: 'Search' },
  { view: 'git', icon: GitBranch, label: 'Source Control' },
  { view: 'chat', icon: MessageSquare, label: 'Chat' },
  { view: 'problems', icon: AlertCircle, label: 'Problems' },
  { view: 'mcp', icon: Package, label: 'MCP Marketplace' },
  { view: 'settings', icon: Settings, label: 'Settings' },
]

export default function ActivityBar({ activeView, onViewChange, isReady, hasApiKey }: Props) {
  return (
    <div
      className="flex flex-col items-center w-[52px] shrink-0 py-2.5 gap-1 no-select"
      style={{
        backgroundColor: 'var(--activity-bg)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {ITEMS.map(({ view, icon: Icon, label }) => {
        const isActive = activeView === view
        return (
          <button
            key={view}
            onClick={() => onViewChange(view)}
            title={label}
            className="relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150"
            style={{
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              backgroundColor: isActive ? 'var(--accent-glow)' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--text-secondary)'
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.color = 'var(--text-muted)'
                e.currentTarget.style.backgroundColor = 'transparent'
              }
            }}
          >
            {/* Active indicator bar */}
            {isActive && (
              <div
                className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r"
                style={{ backgroundColor: 'var(--accent)' }}
              />
            )}
            <Icon size={18} strokeWidth={1.5} />

            {/* Connection indicator on chat icon */}
            {view === 'chat' && (
              <div
                className="absolute top-1 right-1 w-2 h-2 rounded-full"
                style={{
                  backgroundColor: hasApiKey && isReady ? 'var(--success)' : hasApiKey ? 'var(--warning)' : 'transparent',
                  border: hasApiKey ? 'none' : 'none',
                  boxShadow: hasApiKey && isReady ? '0 0 6px rgba(74, 222, 128, 0.4)' : 'none',
                }}
                title={hasApiKey && isReady ? 'Connected' : hasApiKey ? 'Connecting...' : 'No API key'}
              />
            )}
          </button>
        )
      })}

      <div className="flex-1" />

      {/* Support & GitHub */}
      <div className="flex flex-col items-center gap-1 pb-1">
        <button
          onClick={() => window.artemis.shell.openExternal('https://buymeacoffee.com/foxemsx')}
          title="Support Artemis"
          className="w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = '#ed64a6'
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Heart size={18} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => window.artemis.shell.openExternal('https://github.com/Foxemsx/Artemis')}
          title="GitHub Repository"
          className="w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
        >
          <Github size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
