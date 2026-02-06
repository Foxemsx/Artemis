import { useCallback } from 'react'
import MonacoEditor from '@monaco-editor/react'
import { X } from 'lucide-react'
import type { EditorTab, Theme } from '../types'

interface Props {
  tabs: EditorTab[]
  activeTabPath: string | null
  onSelectTab: (path: string) => void
  onCloseTab: (path: string) => void
  onSave: (path: string, content: string) => void
  onContentChange: (path: string, content: string) => void
  theme: Theme
}

export default function Editor({
  tabs, activeTabPath, onSelectTab, onCloseTab, onSave, onContentChange, theme,
}: Props) {
  const activeTab = tabs.find((t) => t.path === activeTabPath) || null

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
            >
              <span className="truncate max-w-[120px]">
                {tab.isDirty && <span style={{ color: 'var(--accent)' }}>&#9679; </span>}
                {tab.name}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.path)
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

      {/* Monaco Editor */}
      {activeTab && (
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            key={activeTab.path}
            defaultValue={activeTab.content}
            language={activeTab.language}
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
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
              guides: { bracketPairs: true },
              // Hide whitespace indicators
              renderWhitespace: 'none',
              renderControlCharacters: false,
            }}
          />
        </div>
      )}
    </div>
  )
}
