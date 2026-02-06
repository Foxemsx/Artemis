import { useState, useCallback } from 'react'
import { Plus, X } from 'lucide-react'
import Terminal from './Terminal'
import type { Theme, PtySession } from '../types'

interface Props {
  terminals: PtySession[]
  onNewTerminal: () => void
  onCloseTerminal: (id: string) => void
  theme: Theme
  projectPath: string | null
}

export default function TerminalPanel({
  terminals, onNewTerminal, onCloseTerminal, theme, projectPath,
}: Props) {
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(
    terminals.length > 0 ? terminals[0].id : null
  )

  // If no terminals, auto-create one when the panel mounts
  const handleNewTerminal = useCallback(() => {
    onNewTerminal()
  }, [onNewTerminal])

  // Sync active terminal
  if (activeTerminalId && !terminals.find((t) => t.id === activeTerminalId)) {
    if (terminals.length > 0) {
      setActiveTerminalId(terminals[terminals.length - 1].id)
    } else {
      setActiveTerminalId(null)
    }
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-secondary)' }}
    >
      {/* Tab Bar */}
      <div
        className="flex items-center h-7 shrink-0 px-1"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span
          className="text-[10px] font-semibold tracking-widest uppercase px-2"
          style={{ color: 'var(--text-muted)' }}
        >
          Terminal
        </span>

        <div className="flex items-center gap-0.5 flex-1 overflow-x-auto ml-1">
          {terminals.map((term) => (
            <div
              key={term.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer text-[10px] shrink-0 transition-colors duration-75"
              style={{
                backgroundColor: term.id === activeTerminalId ? 'var(--bg-hover)' : 'transparent',
                color: term.id === activeTerminalId ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
              onClick={() => setActiveTerminalId(term.id)}
            >
              <span>{term.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTerminal(term.id)
                }}
                className="p-0.5 rounded hover:bg-[var(--bg-elevated)]"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleNewTerminal}
          className="p-1 rounded transition-colors duration-100 shrink-0"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--text-secondary)'
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)'
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="New terminal"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Terminal content */}
      <div className="flex-1 overflow-hidden">
        {terminals.length === 0 ? (
          <div
            className="h-full flex items-center justify-center"
            style={{ color: 'var(--text-muted)' }}
          >
            <button
              onClick={handleNewTerminal}
              className="text-xs px-4 py-2 rounded-lg transition-colors duration-100"
              style={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
              }}
            >
              Open Terminal
            </button>
          </div>
        ) : (
          terminals.map((term) => (
            <div
              key={term.id}
              className="h-full"
              style={{ display: term.id === activeTerminalId ? 'block' : 'none' }}
            >
              <Terminal
                sessionId={term.id}
                theme={theme}
                isActive={term.id === activeTerminalId}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
