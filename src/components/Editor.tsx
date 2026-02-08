import { useState, useCallback, useMemo } from 'react'
import MonacoEditor, { loader } from '@monaco-editor/react'
import { X, Clipboard, Pin } from 'lucide-react'

// Configure Monaco loader to use CDN for language workers (must run at module level)
loader.config({
  paths: {
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs'
  }
})

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
  onPinTab?: (path: string) => void
  onUnpinTab?: (path: string) => void
  onReorderTabs?: (fromPath: string, toPath: string) => void
  theme: Theme
}

export default function Editor({
  tabs, activeTabPath, onSelectTab, onCloseTab, onCloseOtherTabs, onCloseAllTabs, onCloseTabsToRight,
  onSave, onContentChange, onPinTab, onUnpinTab, onReorderTabs, theme,
}: Props) {
  const activeTab = tabs.find((t) => t.path === activeTabPath) || null
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; path: string } | null>(null)

  // Sort tabs: pinned tabs first, then unpinned in original order
  const sortedTabs = useMemo(() => {
    const pinned = tabs.filter(t => t.isPinned)
    const unpinned = tabs.filter(t => !t.isPinned)
    return [...pinned, ...unpinned]
  }, [tabs])
  const [confirmClose, setConfirmClose] = useState<{ path: string; action: 'close' | 'closeOthers' | 'closeAll' | 'closeRight' } | null>(null)
  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [dragSource, setDragSource] = useState<string | null>(null)

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
    if (tab?.isPinned) return // Pinned tabs can't be closed
    if (tab?.isDirty) {
      setConfirmClose({ path, action: 'close' })
    } else {
      onCloseTab(path)
    }
  }, [tabs, onCloseTab])

  const getTabMenuItems = useCallback((path: string): MenuItem[] => {
    const tab = tabs.find(t => t.path === path)
    const tabIndex = tabs.findIndex(t => t.path === path)
    const isPinned = tab?.isPinned || false
    return [
      { label: isPinned ? 'Unpin Tab' : 'Pin Tab', icon: Pin, onClick: () => isPinned ? onUnpinTab?.(path) : onPinTab?.(path) },
      { separator: true },
      { label: 'Close', onClick: () => tryCloseTab(path), shortcut: 'Ctrl+W', disabled: isPinned },
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
        {sortedTabs.map((tab) => {
          const isActive = tab.path === activeTabPath
          const isPinned = tab.isPinned || false
          const isDragOver = dragOverPath === tab.path
          return (
            <div
              key={tab.path}
              draggable
              onDragStart={(e) => {
                setDragSource(tab.path)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', tab.path)
              }}
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverPath(tab.path)
              }}
              onDragLeave={() => setDragOverPath(null)}
              onDrop={(e) => {
                e.preventDefault()
                setDragOverPath(null)
                const fromPath = e.dataTransfer.getData('text/plain')
                if (fromPath && fromPath !== tab.path) {
                  onReorderTabs?.(fromPath, tab.path)
                }
                setDragSource(null)
              }}
              onDragEnd={() => { setDragOverPath(null); setDragSource(null) }}
              className="flex items-center gap-1.5 h-full px-3 cursor-pointer shrink-0 text-[11px] transition-colors duration-75"
              style={{
                backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                borderRight: isPinned ? '1px solid rgba(var(--accent-rgb), 0.15)' : '1px solid var(--border-subtle)',
                borderBottom: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                borderLeft: isDragOver ? '2px solid var(--accent)' : '2px solid transparent',
                opacity: dragSource === tab.path ? 0.5 : 1,
              }}
              onClick={() => onSelectTab(tab.path)}
              onContextMenu={(e) => handleTabContextMenu(e, tab.path)}
            >
              {isPinned && (
                <Pin size={10} style={{ color: 'var(--accent)', opacity: 0.7, flexShrink: 0 }} />
              )}
              <span className="truncate max-w-[120px]">
                {tab.isDirty && <span style={{ color: 'var(--accent)' }}>&#9679; </span>}
                {tab.name}
              </span>
              {!isPinned && (
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
              )}
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
            onMount={(editor, monaco) => {
              // Configure TypeScript compiler options for TS/TSX files
              if (activeTab.language === 'typescript' || activeTab.language === 'typescriptreact') {
                monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
                  target: monaco.languages.typescript.ScriptTarget.Latest,
                  allowNonTsExtensions: true,
                  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
                  module: monaco.languages.typescript.ModuleKind.CommonJS,
                  noEmit: true,
                  esModuleInterop: true,
                  jsx: monaco.languages.typescript.JsxEmit.React,
                  reactNamespace: 'React',
                  allowJs: true,
                  typeRoots: ['node_modules/@types']
                })
              }
            }}
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
