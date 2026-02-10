import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import MonacoEditor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { X, Clipboard, Pin } from 'lucide-react'

// Security: Use local Monaco bundle instead of CDN to prevent remote code execution
self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

loader.config({ monaco })

import type { EditorTab, Theme } from '../types'
import ContextMenu, { type MenuItem } from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'

// ─── Inline Completion Provider ─────────────────────────────────────────────

let inlineCompletionDisposable: monaco.IDisposable | null = null

// Cache the backend config locally to avoid an IPC round-trip on every keystroke.
// Refreshed every 2 seconds so toggling in Settings still takes effect quickly.
let _cachedInlineConfig: { enabled: boolean; provider: string; model: string; maxTokens: number } | null = null
let _configLastFetched = 0
const CONFIG_CACHE_TTL = 2_000

async function isInlineCompletionEnabled(): Promise<boolean> {
  const now = Date.now()
  if (_cachedInlineConfig && now - _configLastFetched < CONFIG_CACHE_TTL) {
    return _cachedInlineConfig.enabled
  }
  try {
    _cachedInlineConfig = await window.artemis.inlineCompletion.getConfig()
    _configLastFetched = now
    return _cachedInlineConfig?.enabled ?? false
  } catch {
    return false
  }
}

// Invalidate cached config when settings change (called from Settings component)
export function invalidateInlineCompletionConfigCache() {
  _cachedInlineConfig = null
  _configLastFetched = 0
}

function registerInlineCompletionProvider(monacoInstance: typeof monaco) {
  if (inlineCompletionDisposable) inlineCompletionDisposable.dispose()

  inlineCompletionDisposable = monacoInstance.languages.registerInlineCompletionsProvider(
    { pattern: '**' },
    {
      provideInlineCompletions: async (model, position, _context, token) => {
        // Fast local check — no IPC unless cache is stale
        if (!(await isInlineCompletionEnabled())) return { items: [] }

        // Debounce: wait 400ms after last keystroke
        try {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 400)
            token.onCancellationRequested(() => { clearTimeout(timer); reject(new Error('cancelled')) })
          })
        } catch {
          return { items: [] }
        }

        if (token.isCancellationRequested) return { items: [] }

        // Quick check: skip trivial current lines before extracting full text
        const currentLineText = model.getLineContent(position.lineNumber)
        const trimmedLine = currentLineText.trim()
        if (trimmedLine.length === 0 || /^[}\])\;]+$/.test(trimmedLine)) {
          return { items: [] }
        }

        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })
        const textAfterPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: model.getLineCount(),
          endColumn: model.getLineMaxColumn(model.getLineCount()),
        })

        // Skip if prefix is too short or only whitespace
        const trimmedPrefix = textUntilPosition.trim()
        if (trimmedPrefix.length < 10) return { items: [] }

        try {
          // Trim context before sending over IPC to reduce serialization cost.
          // Backend trims further (1500/500) but we avoid sending megabytes over the bridge.
          const result = await window.artemis.inlineCompletion.complete({
            prefix: textUntilPosition.slice(-1500),
            suffix: textAfterPosition.slice(0, 500),
            language: model.getLanguageId(),
            filepath: model.uri.path,
          })

          if (token.isCancellationRequested || !result?.completion) return { items: [] }

          return {
            items: [{
              insertText: result.completion,
              range: new monacoInstance.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column,
              ),
            }],
          }
        } catch {
          return { items: [] }
        }
      },
      freeInlineCompletions: () => {},
    }
  )
}

// Sync open tabs into Monaco's TypeScript service for cross-file go-to-definition
function syncTabsToTypeScript(tabs: EditorTab[], monacoInstance: typeof monaco) {
  for (const tab of tabs) {
    const lang = tab.language
    if (lang === 'typescript' || lang === 'typescriptreact' || lang === 'javascript' || lang === 'javascriptreact') {
      const uri = monacoInstance.Uri.file(tab.path)
      const existing = monacoInstance.editor.getModel(uri)
      if (!existing) {
        monacoInstance.editor.createModel(tab.content, lang, uri)
      } else if (existing.getValue() !== tab.content) {
        existing.setValue(tab.content)
      }
    }
  }
}

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
  inlineCompletionEnabled?: boolean
}

export default function Editor({
  tabs, activeTabPath, onSelectTab, onCloseTab, onCloseOtherTabs, onCloseAllTabs, onCloseTabsToRight,
  onSave, onContentChange, onPinTab, onUnpinTab, onReorderTabs, theme, inlineCompletionEnabled: icEnabled = false,
}: Props) {
  const activeTab = tabs.find((t) => t.path === activeTabPath) || null
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)

  // Note: inline completion enabled state is checked live from backend config
  // in the provider itself, so no module-level sync is needed.

  // Sync open tabs to TypeScript language service for cross-file navigation
  useEffect(() => {
    if (monacoRef.current && tabs.length > 0) {
      syncTabsToTypeScript(tabs, monacoRef.current)
    }
  }, [tabs])

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
            onMount={(editor, monacoInstance) => {
              monacoRef.current = monacoInstance

              // ─── TypeScript / JavaScript language service configuration ───
              const tsDefaults = monacoInstance.languages.typescript.typescriptDefaults
              const jsDefaults = monacoInstance.languages.typescript.javascriptDefaults
              const compilerOpts = {
                target: monacoInstance.languages.typescript.ScriptTarget.Latest,
                allowNonTsExtensions: true,
                moduleResolution: monacoInstance.languages.typescript.ModuleResolutionKind.NodeJs,
                module: monacoInstance.languages.typescript.ModuleKind.ESNext,
                noEmit: true,
                esModuleInterop: true,
                jsx: monacoInstance.languages.typescript.JsxEmit.React,
                reactNamespace: 'React',
                allowJs: true,
                checkJs: false,
                strict: false,
                typeRoots: ['node_modules/@types'],
              }
              tsDefaults.setCompilerOptions(compilerOpts)
              jsDefaults.setCompilerOptions(compilerOpts)
              tsDefaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false })
              jsDefaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })

              // Sync all open tabs into the TS service for cross-file go-to-definition
              syncTabsToTypeScript(tabs, monacoInstance)

              // ─── Register inline completion provider (once globally) ───
              registerInlineCompletionProvider(monacoInstance)

              // ─── "Add Selection to Chat" context menu action ───
              editor.addAction({
                id: 'artemis.addSelectionToChat',
                label: 'Add Selection to Chat',
                contextMenuGroupId: '9_cutcopypaste',
                contextMenuOrder: 99,
                precondition: 'editorHasSelection',
                run: (ed) => {
                  const selection = ed.getSelection()
                  if (!selection) return
                  const selectedText = ed.getModel()?.getValueInRange(selection) || ''
                  if (!selectedText.trim()) return
                  const filePath = activeTab?.path || ''
                  const language = activeTab?.language || ''
                  window.dispatchEvent(new CustomEvent('artemis:add-selection-to-chat', {
                    detail: { text: selectedText, filePath, language },
                  }))
                },
              })

              // ─── Focus the editor ───
              editor.focus()
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
              renderWhitespace: 'none',
              renderControlCharacters: false,
              // ─── Find & Replace widget (Ctrl+F / Ctrl+H) ───
              find: {
                addExtraSpaceOnTop: true,
                autoFindInSelection: 'multiline',
                seedSearchStringFromSelection: 'selection',
              },
              // ─── Sticky Scroll (pin parent scopes at top) ───
              stickyScroll: { enabled: true },
              // ─── Go-to-Definition (Ctrl+Click) ───
              gotoLocation: {
                multipleDefinitions: 'goto',
                multipleTypeDefinitions: 'goto',
                multipleReferences: 'peek',
              },
              // ─── Inline Suggestions (ghost text via AI) ───
              // Always enabled at Monaco level; the provider checks backend config
              inlineSuggest: {
                enabled: true,
                mode: 'subwordSmart',
              },
              quickSuggestions: { other: true, comments: false, strings: true },
              suggestOnTriggerCharacters: true,
            }}
          />
        </div>
      )}
    </div>
  )
}
