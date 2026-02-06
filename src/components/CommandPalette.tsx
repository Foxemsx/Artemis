import { useState, useRef, useEffect, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Search, Plus, Sun, Moon, FolderOpen, RotateCcw,
  Files, MessageSquare, Settings,
} from 'lucide-react'
import type { Theme, ActivityView } from '../types'

interface Props {
  onClose: () => void
  activeView: ActivityView
  projectName: string | null
  onAddProject: () => void
  onToggleTheme: () => void
  onSwitchView: (view: ActivityView) => void
  onResetSetup: () => void
  theme: Theme
}

interface Action {
  id: string
  label: string
  description?: string
  icon: React.ReactNode
  onSelect: () => void
  category: string
}

export default function CommandPalette({
  onClose, activeView, projectName, onAddProject,
  onToggleTheme, onSwitchView, onResetSetup, theme,
}: Props) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ─── Build Action List ────────────────────────────────────────────────
  const actions = useMemo<Action[]>(() => {
    const items: Action[] = [
      {
        id: 'add-project',
        label: 'Open Project',
        description: 'Open a folder as a project',
        icon: <Plus size={16} />,
        onSelect: () => { onAddProject(); onClose() },
        category: 'Actions',
      },
      {
        id: 'view-files',
        label: 'Show File Explorer',
        description: 'Switch to the Files view',
        icon: <Files size={16} />,
        onSelect: () => { onSwitchView('files'); onClose() },
        category: 'Navigation',
      },
      {
        id: 'view-chat',
        label: 'Show Chat',
        description: 'Switch to the Chat view',
        icon: <MessageSquare size={16} />,
        onSelect: () => { onSwitchView('chat'); onClose() },
        category: 'Navigation',
      },
      {
        id: 'view-settings',
        label: 'Open Settings',
        description: 'Open application settings',
        icon: <Settings size={16} />,
        onSelect: () => { onSwitchView('settings'); onClose() },
        category: 'Navigation',
      },
      {
        id: 'toggle-theme',
        label: `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`,
        description: 'Toggle the application theme',
        icon: theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />,
        onSelect: () => { onToggleTheme(); onClose() },
        category: 'Preferences',
      },
      {
        id: 'reset-setup',
        label: 'Reset Introduction',
        description: 'Show the welcome screen again',
        icon: <RotateCcw size={16} />,
        onSelect: () => { onResetSetup(); onClose() },
        category: 'Preferences',
      },
    ]

    // Show current project info
    if (projectName) {
      items.push({
        id: 'current-project',
        label: projectName,
        description: 'Current project',
        icon: <FolderOpen size={16} />,
        onSelect: () => { onSwitchView('files'); onClose() },
        category: 'Project',
      })
    }

    return items
  }, [theme, projectName, onAddProject, onToggleTheme, onSwitchView, onResetSetup, onClose])

  // ─── Filter ───────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!query.trim()) return actions
    const lower = query.toLowerCase()
    return actions.filter(
      (a) =>
        a.label.toLowerCase().includes(lower) ||
        a.description?.toLowerCase().includes(lower) ||
        a.category.toLowerCase().includes(lower)
    )
  }, [query, actions])

  // Reset selection on query change
  useEffect(() => { setSelectedIndex(0) }, [query])

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus() }, [])

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const item = list.children[selectedIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault()
      filtered[selectedIndex].onSelect()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.12 }}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)' }}
      />

      {/* Palette Panel */}
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -8, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-lg rounded-2xl overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-elevated)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input */}
        <div
          className="flex items-center gap-3 px-4 h-12"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search actions..."
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd
            className="px-1.5 py-0.5 rounded text-[10px] font-mono"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto p-1.5">
          {filtered.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No matching actions
              </p>
            </div>
          )}
          {filtered.map((action, index) => (
            <button
              key={action.id}
              onClick={action.onSelect}
              onMouseEnter={() => setSelectedIndex(index)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-100"
              style={{
                backgroundColor: index === selectedIndex ? 'var(--bg-hover)' : 'transparent',
                color: index === selectedIndex ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
            >
              <div
                className="shrink-0"
                style={{
                  color: index === selectedIndex ? 'var(--accent)' : 'var(--text-muted)',
                }}
              >
                {action.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{action.label}</div>
                {action.description && (
                  <div
                    className="text-[10px] truncate mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {action.description}
                  </div>
                )}
              </div>
              <span
                className="text-[9px] px-1.5 py-0.5 rounded shrink-0 font-medium"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  color: 'var(--text-muted)',
                }}
              >
                {action.category}
              </span>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
