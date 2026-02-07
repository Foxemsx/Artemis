import { useState, useCallback } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { X, Clipboard } from 'lucide-react'
import type { EditorTab, Theme } from '../types'
import ContextMenu, { type MenuItem } from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  tabs: EditorTab[]
  activeTabPath: string | null
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
  onCloseOtherTabs?: (path: string) => void
  onCloseAllTabs?: () => void
  onCloseTabsToRight?: (path: string) => void
  onSave: (path: string, content: string) => void
  onContentChange: (path: string, content: string) => void
  theme: Theme
}

export default function Editor({
  tabs, activeTabPath, onSelectTab, onCloseTab, onCloseOtherTabs, onCloseAllTabs, onCloseTabsToRight,
  onSave, onContentChange, theme,
}: Props) {
  const activeTab = tabs.find((t) => t.path === activeTabPath) || null
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const [confirmClose, setConfirmClose] = useState<{ path: string; action: 'close' | 'closeOthers' | 'closeAll' | 'closeRight' } | null>(null)

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (activeTab && value !== undefined) {
      onContentChange(activeTab.path, value)
    }
  }, [activeTab, onContentChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      if (activeTab) {
        onSave(activeTab.path, activeTab.content)
      }
    }
  }, [activeTab, onSave])

  const handleTabContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault()
    e.stopPropagation()
    setTabContextMenu({ x: e.clientX, y: e.clientY, path })
  }, [])

  const tryCloseTab = useCallback((path: string) => {
    const tab = tabs.find(t => t.path === path)
    if (tab?.isDirty) {
      setConfirmClose({ path, action: 'close' })
    } else {
      onCloseTab(path)
    }
  }, [tabs, onCloseTab])

  const getTabMenuItems = useCallback((path: string): MenuItem[] => {
    const tabIndex = tabs.findIndex(t => t.path === path)
    return [
      { label: 'Close', onClick: () => tryCloseTab(path), shortcut: 'Ctrl+W' },
      { label: 'Close Others', onClick: () => {
        const dirtyOthers = tabs.filter(t => t.path !== path && t.isDirty)
        if (dirtyOthers.length > 0) {
          setConfirmClose({ path, action: 'closeOthers' })
        } else {
          onCloseOtherTabs?.(path)
        }
      }, disabled: tabs.length <= 1 },
      { label: 'Close All', onClick: () => {
        const dirtyTabs = tabs.filter(t => t.isDirty)
        if (dirtyTabs.length > 0) {
          setConfirmClose({ path, action: 'closeAll' })
        } else {
          onCloseAllTabs?.()
        }
      }},
      { label: 'Close to the Right', onClick: () => {
        const rightDirty = tabs.filter((t, i) => i > tabIndex && t.isDirty)
        if (rightDirty.length > 0) {
          setConfirmClose({ path, action: 'closeRight' })
        } else {
          onCloseTabsToRight?.(path)
        }
      }, disabled: tabIndex >= tabs.length - 1 },
      { separator: true },
      { label: 'Copy Path', icon: Clipboard, onClick: () => navigator.clipboard.writeText(path) },
    ]
  }, [tabs, tryCloseTab, onCloseOtherTabs, onCloseAllTabs, onCloseTabsToRight])

  // Empty state
  if (tabs.length === 0) {
    return (
      <div
        className="h-full flex flex-col items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
          style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
        >
          <span className="text-lg" style={{ color: 'var(--text-muted)' }}>A</span>
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Open a file from the Explorer
        </p>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
          Ctrl+K for command palette
        </p>
      </div>
    )
  }

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-primary)' }}
      onKeyDown={handleKeyDown}
    >
      {/* Tab Bar */}
      <div
        className="flex items-center h-8 shrink-0 overflow-x-auto"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.path === activeTabPath
          return (
            <div
              key={tab.path}
              className="flex items-center gap-1.5 h-full px-3 cursor-pointer shrink-0 text-[11px] transition-colors duration-75"
              style={{
                backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                borderRight: '1px solid var(--border-subtle)',
                borderBottom: isActive ? '1px solid var(--accent)' : '1px solid transparent',
              }}
              onClick={() => onSelectTab(tab.path)}
              onContextMenu={(e) => handleTabContextMenu(e, tab.path)}
            >
              <span className="truncate max-w-[120px]">
                {tab.isDirty && <span style={{ color: 'var(--accent)' }}>&#9679; </span>}
                {tab.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  tryCloseTab(tab.path)
                }}
                className="p-0.5 rounded transition-colors duration-75"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-primary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
      </div>

      {/* Tab Context Menu */}
      {tabContextMenu && (
        <ContextMenu
          x={tabContextMenu.x}
          y={tabContextMenu.y}
          items={getTabMenuItems(tabContextMenu.path)}
          onClose={() => setTabContextMenu(null)}
        />
      )}

      {/* Unsaved Changes Dialog */}
      {confirmClose && (
        <ConfirmDialog
          title="Unsaved Changes"
          message="Do you want to save the changes before closing? Your changes will be lost if you don't save them."
          confirmLabel="Save"
          dangerLabel="Discard"
          cancelLabel="Cancel"
          fileName={confirmClose.action === 'close' ? confirmClose.path.split(/[\\/]/).pop() || '' : undefined}
          onConfirm={() => {
            // Save all dirty tabs involved, then close
            const { path, action } = confirmClose
            if (action === 'close') {
              const tab = tabs.find(t => t.path === path)
              if (tab) onSave(tab.path, tab.content)
              onCloseTab(path)
            } else if (action === 'closeOthers') {
              tabs.filter(t => t.path !== path && t.isDirty).forEach(t => onSave(t.path, t.content))
              onCloseOtherTabs?.(path)
            } else if (action === 'closeAll') {
              tabs.filter(t => t.isDirty).forEach(t => onSave(t.path, t.content))
              onCloseAllTabs?.()
            } else if (action === 'closeRight') {
              const idx = tabs.findIndex(t => t.path === path)
              tabs.filter((t, i) => i > idx && t.isDirty).forEach(t => onSave(t.path, t.content))
              onCloseTabsToRight?.(path)
            }
            setConfirmClose(null)
          }}
          onDanger={() => {
            // Discard and close without saving
            const { path, action } = confirmClose
            if (action === 'close') onCloseTab(path)
            else if (action === 'closeOthers') onCloseOtherTabs?.(path)
            else if (action === 'closeAll') onCloseAllTabs?.()
            else if (action === 'closeRight') onCloseTabsToRight?.(path)
            setConfirmClose(null)
          }}
          onCancel={() => setConfirmClose(null)}
        />
      )}

      {/* Monaco Editor */}
      {activeTab && (
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            key={activeTab.path}
            defaultValue={activeTab.content}
            language={activeTab.language}
            theme={theme === 'light' ? 'vs' : 'vs-dark'}
            onChange={handleEditorChange}
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', 'Consolas', monospace",
              fontLigatures: true,
              lineHeight: 20,
              minimap: { enabled: false },
              padding: { top: 12 },
              scrollBeyondLastLine: false,
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              renderLineHighlight: 'gutter',
              tabSize: 2,
              wordWrap: 'off',
              automaticLayout: true,
              bracketPairColorization: { enabled: true },
              guides: {
                bracketPairs: false,
                indentation: false,
                highlightActiveIndentation: false,
              },
              // Hide whitespace indicators and indent guides
              renderWhitespace: 'none',
              renderControlCharacters: false,
            }}
          />
        </div>
      )}
    </div>
  )
}
