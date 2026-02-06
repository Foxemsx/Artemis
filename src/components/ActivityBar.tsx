import { Files, MessageSquare, Settings } from 'lucide-react'
import type { ActivityView } from '../types'

interface Props {
  activeView: ActivityView
  onViewChange: (view: ActivityView) => void
  isReady: boolean
  hasApiKey: boolean
}

const ITEMS: { view: ActivityView; icon: typeof Files; label: string }[] = [
  { view: 'files', icon: Files, label: 'Explorer' },
  { view: 'chat', icon: MessageSquare, label: 'Chat' },
  { view: 'settings', icon: Settings, label: 'Settings' },
]

export default function ActivityBar({ activeView, onViewChange, isReady, hasApiKey }: Props) {
  return (
    <div
      className="flex flex-col items-center w-12 shrink-0 py-2 no-select"
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
            className="relative w-10 h-10 flex items-center justify-center rounded-lg mb-0.5 transition-colors duration-100"
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
                className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full"
                style={{
                  backgroundColor: hasApiKey && isReady ? 'var(--success)' : hasApiKey ? 'var(--warning)' : 'var(--text-muted)',
                }}
                title={hasApiKey && isReady ? 'Connected' : hasApiKey ? 'Connecting...' : 'No API key'}
              />
            )}
          </button>
        )
      })}

      {/* Spacer pushes nothing — keeps icons at top */}
      <div className="flex-1" />
    </div>
  )
}
