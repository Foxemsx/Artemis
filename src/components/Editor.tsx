import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import MonacoEditor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { X, Clipboard, Pin, Lightbulb } from 'lucide-react'

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
import QuickFixMenu from './QuickFixMenu'
import type { QuickFix, QuickFixRange } from '../lib/quickFixes'

// ─── Inline Completion Provider ─────────────────────────────────────────────

let inlineCompletionDisposable: monaco.IDisposable | null = null
let codeActionDisposable: monaco.IDisposable | null = null

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

function getMarkersForLine(
  monacoInstance: typeof monaco,
  model: monaco.editor.ITextModel,
  lineNumber: number
): monaco.editor.IMarkerData[] {
  return monacoInstance.editor.getModelMarkers({ resource: model.uri })
    .filter(marker => lineNumber >= marker.startLineNumber && lineNumber <= marker.endLineNumber)
}

function extractSymbolFromError(message: string): string | null {
  const singleQuote = message.match(/'([^']+)'/)
  if (singleQuote?.[1]) return singleQuote[1]
  const doubleQuote = message.match(/"([^"]+)"/)
  if (doubleQuote?.[1]) return doubleQuote[1]
  return null
}

function buildQuickFixes(
  markers: monaco.editor.IMarkerData[],
  model: monaco.editor.ITextModel,
  monacoInstance: typeof monaco,
  options?: { includeAi?: boolean }
): QuickFix[] {
  const fixes: QuickFix[] = []
  const used = new Set<string>()
  const includeAi = options?.includeAi ?? true

  for (const marker of markers) {
    const messageLower = marker.message.toLowerCase()

    if (messageLower.includes('cannot find name') || messageLower.includes('is not defined')) {
      const symbol = extractSymbolFromError(marker.message)
      if (symbol && /^[A-Za-z_$][\w$]*$/.test(symbol)) {
        const id = `import-${symbol}-${marker.startLineNumber}`
        if (!used.has(id)) {
          used.add(id)
          fixes.push({
            id,
            title: `Import '${symbol}' from project`,
            icon: 'import',
            kind: 'deterministic',
            command: { id: 'quickfix.import', symbol },
            diagnostics: [marker],
          })
        }
      }
    }

    if (messageLower.includes('cannot find module')) {
      const symbol = extractSymbolFromError(marker.message)
      if (symbol && /^[A-Za-z_$][\w$]*$/.test(symbol)) {
        const id = `import-module-${symbol}-${marker.startLineNumber}`
        if (!used.has(id)) {
          used.add(id)
          fixes.push({
            id,
            title: `Import '${symbol}' from project`,
            icon: 'import',
            kind: 'deterministic',
            command: { id: 'quickfix.import', symbol },
            diagnostics: [marker],
          })
        }
      }
    }

    if (
      messageLower.includes('is declared but') ||
      messageLower.includes('never read') ||
      messageLower.includes('never used')
    ) {
      const endLine = Math.min(marker.endLineNumber + 1, model.getLineCount() + 1)
      const range = new monacoInstance.Range(marker.startLineNumber, 1, endLine, 1)
      const id = `remove-${marker.startLineNumber}-${marker.endLineNumber}`
      if (!used.has(id)) {
        used.add(id)
        fixes.push({
          id,
          title: 'Remove unused declaration',
          icon: 'remove',
          kind: 'deterministic',
          edit: [{ range, text: '' }],
          diagnostics: [marker],
        })
      }
    }
  }

  if (includeAi && markers.length > 0) {
    const marker = markers[0]
    const range: QuickFixRange = {
      startLine: marker.startLineNumber,
      startColumn: marker.startColumn,
      endLine: marker.endLineNumber,
      endColumn: marker.endColumn,
    }
    fixes.push({
      id: `ai-${marker.startLineNumber}-${marker.startColumn}`,
      title: 'Ask AI to fix this',
      icon: 'ai',
      kind: 'ai',
      command: { id: 'quickfix.ai', errorMessage: marker.message, range },
      diagnostics: [marker],
    })
  }

  return fixes
}

function registerCodeActionProvider(monacoInstance: typeof monaco) {
  if (codeActionDisposable) codeActionDisposable.dispose()

  codeActionDisposable = monacoInstance.languages.registerCodeActionProvider(
    ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    {
      provideCodeActions: (model, range) => {
        const markers = getMarkersForLine(monacoInstance, model, range.startLineNumber)
        if (markers.length === 0) return { actions: [], dispose: () => {} }

        const fixes = buildQuickFixes(markers, model, monacoInstance, { includeAi: false })
        const actions = fixes
          .filter(fix => fix.edit && fix.edit.length > 0)
          .map((fix) => ({
            title: fix.title,
            diagnostics: fix.diagnostics,
            kind: monacoInstance.languages.CodeActionKind.QuickFix,
            edit: {
              edits: (fix.edit || []).map(edit => ({
                resource: model.uri,
                versionId: undefined,
                textEdit: { range: edit.range, text: edit.text ?? '' },
              })),
            },
          }))

        return { actions, dispose: () => {} }
      },
    }
  )

  return codeActionDisposable
}

interface ImportCandidate {
  path: string
  exportName: string
  isDefault: boolean
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/')
}

function getDirname(filePath: string): string {
  const normalized = normalizePath(filePath)
  return normalized.replace(/\/[^/]+$/, '')
}

function stripExtension(filePath: string): string {
  return filePath.replace(/\.(tsx|ts|jsx|js|mjs|cjs)$/i, '')
}

function buildRelativeImport(fromFile: string, toFile: string): string {
  const fromDir = getDirname(fromFile)
  const fromParts = normalizePath(fromDir).split('/').filter(Boolean)
  const toParts = normalizePath(toFile).split('/').filter(Boolean)
  let idx = 0
  while (idx < fromParts.length && idx < toParts.length && fromParts[idx].toLowerCase() === toParts[idx].toLowerCase()) {
    idx++
  }
  const up = fromParts.slice(idx).map(() => '..')
  const down = toParts.slice(idx)
  const rel = [...up, ...down].join('/')
  return rel || '.'
}

function pickBestImportCandidate(candidates: ImportCandidate[], fromFile: string): ImportCandidate | null {
  if (candidates.length === 0) return null
  const sorted = [...candidates].sort((a, b) => {
    const aRel = buildRelativeImport(fromFile, a.path)
    const bRel = buildRelativeImport(fromFile, b.path)
    if (aRel.length !== bRel.length) return aRel.length - bRel.length
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
    return a.path.localeCompare(b.path)
  })
  return sorted[0]
}

function findImportInsertLine(lines: string[]): number {
  let lastImportLine = -1
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (i === 0 && trimmed.startsWith('#!')) {
      lastImportLine = i
      continue
    }
    if (trimmed.startsWith('import ') || /^export\s+.+\s+from\s+['"]/.test(trimmed)) {
      lastImportLine = i
      continue
    }
    if (lastImportLine >= 0) {
      if (trimmed === '') {
        lastImportLine = i
        continue
      }
      break
    }
    if (
      trimmed === '' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('/*') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('*/') ||
      trimmed === '"use strict";' ||
      trimmed === "'use strict';"
    ) {
      continue
    }
    break
  }
  return lastImportLine >= 0 ? lastImportLine + 1 : 0
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

// ─── HTML Live Preview (isolated via blob URL to avoid Vite HMR preamble) ────

function HtmlPreviewPanel({ activeTab, onContentChange }: { activeTab: EditorTab; onContentChange: (path: string, content: string) => void }) {
  const realPath = activeTab.path.replace('__preview__:', '')
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Create a blob URL whenever content changes — fully isolated origin, no Vite interference
  useEffect(() => {
    const blob = new Blob([activeTab.content], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [activeTab.content])

  return (
    <div className="flex-1 overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between h-9 px-4 shrink-0"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--success)' }} />
          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>Live Preview</span>
          <span
            className="text-[10px] font-mono truncate max-w-[300px]"
            style={{ color: 'var(--text-muted)' }}
            title={realPath}
          >
            {realPath}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              try {
                const freshContent = await window.artemis.fs.readFile(realPath)
                onContentChange(activeTab.path, freshContent)
              } catch (err) {
                console.error('[Artemis] Failed to refresh preview:', err)
              }
            }}
            className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => {
              if (realPath) window.artemis.shell.openPath(realPath)
            }}
            className="px-2.5 py-1 rounded text-[11px] font-medium transition-colors"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
              e.currentTarget.style.color = 'var(--text-primary)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
              e.currentTarget.style.color = 'var(--text-secondary)'
            }}
          >
            Open in Browser
          </button>
        </div>
      </div>
      {/* Isolated iframe */}
      {previewUrl && (
        <iframe
          ref={iframeRef}
          data-preview={activeTab.path}
          src={previewUrl}
          sandbox="allow-scripts allow-popups allow-forms"
          className="w-full flex-1 border-0"
          style={{ backgroundColor: '#fff' }}
          title="HTML Live Preview"
        />
      )}
    </div>
  )
}

interface QuickFixState {
  visible: boolean
  fixes: QuickFix[]
  activeIndex: number
  position: { x: number; y: number }
}

interface LightbulbState {
  line: number
  x: number
  y: number
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
  projectPath?: string | null
  onRequestAIQuickFix?: (filePath: string, errorMessage: string, range: QuickFixRange, language?: string) => void
}

export default function Editor({
  tabs, activeTabPath, onSelectTab, onCloseTab, onCloseOtherTabs, onCloseAllTabs, onCloseTabsToRight,
  onSave, onContentChange, onPinTab, onUnpinTab, onReorderTabs, theme, inlineCompletionEnabled: icEnabled = false,
  projectPath = null, onRequestAIQuickFix,
}: Props) {
  const activeTab = tabs.find((t) => t.path === activeTabPath) || null
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; path: string } | null>(null)
  const monacoRef = useRef<typeof monaco | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const quickFixAnchorRef = useRef<monaco.Position | null>(null)
  const editorDisposablesRef = useRef<monaco.IDisposable[]>([])
  const quickFixVisibleRef = useRef(false)
  const [quickFixState, setQuickFixState] = useState<QuickFixState>({
    visible: false,
    fixes: [],
    activeIndex: 0,
    position: { x: 0, y: 0 },
  })
  const [lightbulbState, setLightbulbState] = useState<LightbulbState | null>(null)

  useEffect(() => {
    quickFixVisibleRef.current = quickFixState.visible
  }, [quickFixState.visible])

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

  const hideQuickFixMenu = useCallback(() => {
    quickFixAnchorRef.current = null
    setQuickFixState(prev => ({ ...prev, visible: false }))
  }, [])

  const updateLightbulb = useCallback((editorOverride?: monaco.editor.IStandaloneCodeEditor) => {
    const editor = editorOverride || editorRef.current
    const monacoInstance = monacoRef.current
    if (!editor || !monacoInstance) return
    const model = editor.getModel()
    const position = editor.getPosition()
    if (!model || !position) {
      setLightbulbState(null)
      return
    }
    const markers = getMarkersForLine(monacoInstance, model, position.lineNumber)
    if (markers.length === 0) {
      setLightbulbState(null)
      return
    }
    const visible = editor.getScrolledVisiblePosition(position)
    const domNode = editor.getDomNode()
    if (!visible || !domNode) return
    const rect = domNode.getBoundingClientRect()
    const lineHeight = editor.getOption(monacoInstance.editor.EditorOption.lineHeight)
    const top = rect.top + (visible.top ?? 0) + Math.max(0, (lineHeight - 14) / 2)
    const left = rect.left + 6
    setLightbulbState({ line: position.lineNumber, x: left, y: top })
  }, [])

  const showQuickFixMenu = useCallback((editor: monaco.editor.IStandaloneCodeEditor, markers?: monaco.editor.IMarkerData[]) => {
    const monacoInstance = monacoRef.current
    const model = editor.getModel()
    if (!monacoInstance || !model) return
    const position = editor.getPosition()
    if (!position) return

    const lineMarkers = markers || getMarkersForLine(monacoInstance, model, position.lineNumber)
    const baseFixes = buildQuickFixes(lineMarkers, model, monacoInstance, { includeAi: !!onRequestAIQuickFix })
    const fixes = baseFixes.map((fix) => {
      if (fix.command?.id === 'quickfix.import' && !projectPath) {
        return { ...fix, disabled: true }
      }
      return fix
    })
    if (fixes.length === 0) {
      hideQuickFixMenu()
      return
    }

    const visible = editor.getScrolledVisiblePosition(position)
    const domNode = editor.getDomNode()
    if (!visible || !domNode) return
    const rect = domNode.getBoundingClientRect()
    const lineHeight = editor.getOption(monacoInstance.editor.EditorOption.lineHeight)
    const x = rect.left + (visible.left ?? 0) + 16
    const y = rect.top + (visible.top ?? 0) + lineHeight

    quickFixAnchorRef.current = position
    setQuickFixState({
      visible: true,
      fixes,
      activeIndex: 0,
      position: { x, y },
    })
  }, [hideQuickFixMenu, onRequestAIQuickFix, projectPath])

  const applyImportFix = useCallback(async (symbol: string) => {
    const editor = editorRef.current
    const monacoInstance = monacoRef.current
    if (!editor || !monacoInstance || !activeTab || !projectPath) return

    try {
      const candidates = await window.artemis.quickfix.findImport(symbol, projectPath) as ImportCandidate[]
      const best = pickBestImportCandidate(candidates || [], activeTab.path)
      if (!best) return

      const model = editor.getModel()
      if (!model) return

      const normalizedTarget = stripExtension(normalizePath(best.path))
      let importPath = buildRelativeImport(activeTab.path, normalizedTarget)
      if (importPath.endsWith('/index')) {
        importPath = importPath.slice(0, -'/index'.length)
      }
      if (!importPath.startsWith('.')) {
        importPath = `./${importPath}`
      }
      if (importPath === './') importPath = '.'

      const escapedPath = importPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const escapedSymbol = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const content = model.getValue()
      const alreadyDefault = new RegExp(`\\bimport\\s+${escapedSymbol}\\s+from\\s+['"]${escapedPath}['"]`).test(content)
      const alreadyNamed = new RegExp(`\\bimport\\s+\\{[^}]*\\b${escapedSymbol}\\b[^}]*\\}\\s+from\\s+['"]${escapedPath}['"]`).test(content)
      if (alreadyDefault || alreadyNamed) return

      const lines = content.split('\n')
      const insertLine = findImportInsertLine(lines)
      const importStatement = best.isDefault
        ? `import ${symbol} from '${importPath}'`
        : `import { ${symbol} } from '${importPath}'`

      editor.pushUndoStop()
      editor.executeEdits('quickfix', [{
        range: new monacoInstance.Range(insertLine + 1, 1, insertLine + 1, 1),
        text: `${importStatement}\n`,
      }])
      editor.pushUndoStop()
      editor.focus()
    } catch (err) {
      console.error('[Editor] Import quick fix failed:', err)
    }
  }, [activeTab, projectPath])

  const handleQuickFixSelect = useCallback(async (fix: QuickFix) => {
    hideQuickFixMenu()
    const editor = editorRef.current
    if (!editor) return

    if (fix.edit && fix.edit.length > 0) {
      editor.pushUndoStop()
      editor.executeEdits('quickfix', fix.edit)
      editor.pushUndoStop()
      editor.focus()
      return
    }

    if (fix.command?.id === 'quickfix.import') {
      await applyImportFix(fix.command.symbol)
      return
    }

    if (fix.command?.id === 'quickfix.ai') {
      if (!activeTab || !onRequestAIQuickFix) return
      onRequestAIQuickFix(activeTab.path, fix.command.errorMessage, fix.command.range, activeTab.language)
    }
  }, [applyImportFix, activeTab, hideQuickFixMenu, onRequestAIQuickFix])

  const handleQuickFixMove = useCallback((nextIndex: number) => {
    setQuickFixState(prev => {
      const clamped = Math.max(0, Math.min(nextIndex, prev.fixes.length - 1))
      return { ...prev, activeIndex: clamped }
    })
  }, [])

  useEffect(() => {
    return () => {
      editorDisposablesRef.current.forEach(d => d.dispose())
      editorDisposablesRef.current = []
    }
  }, [])

  useEffect(() => {
    hideQuickFixMenu()
    setLightbulbState(null)
  }, [activeTab?.path, hideQuickFixMenu])

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

      {/* HTML Live Preview */}
      {activeTab && activeTab.isPreview && <HtmlPreviewPanel activeTab={activeTab} onContentChange={onContentChange} />}

      {/* Monaco Editor */}
      {activeTab && !activeTab.isPreview && (
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            key={activeTab.path}
            defaultValue={activeTab.content}
            language={activeTab.language}
            theme={theme === 'light' ? 'vs' : 'vs-dark'}
            onChange={handleEditorChange}
            onMount={(editor, monacoInstance) => {
              monacoRef.current = monacoInstance
              editorRef.current = editor

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

              // ─── Register code action provider for quick fixes ───
              registerCodeActionProvider(monacoInstance)

              // ─── Quick Fix command (Ctrl/Cmd + .) ───
              editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Period, () => {
                const model = editor.getModel()
                const position = editor.getPosition()
                if (!model || !position) return
                const markers = getMarkersForLine(monacoInstance, model, position.lineNumber)
                if (markers.length > 0) {
                  showQuickFixMenu(editor, markers)
                }
              })

              // ─── Track cursor and markers for lightbulb indicator ───
              editorDisposablesRef.current.push(
                editor.onDidChangeCursorPosition(() => {
                  updateLightbulb(editor)
                  if (quickFixVisibleRef.current) hideQuickFixMenu()
                })
              )

              editorDisposablesRef.current.push(
                editor.onDidScrollChange(() => {
                  updateLightbulb(editor)
                  if (quickFixVisibleRef.current && quickFixAnchorRef.current) {
                    showQuickFixMenu(editor)
                  }
                })
              )

              editorDisposablesRef.current.push(
                monacoInstance.editor.onDidChangeMarkers((uris) => {
                  const modelUri = editor.getModel()?.uri
                  if (modelUri && uris.some(uri => uri.toString() === modelUri.toString())) {
                    updateLightbulb(editor)
                  }
                })
              )

              updateLightbulb(editor)

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
              glyphMargin: true,
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

          {lightbulbState && (
            <button
              type="button"
              className="fixed z-[900] p-1 rounded transition-transform"
              style={{ left: lightbulbState.x, top: lightbulbState.y }}
              onClick={() => {
                const editor = editorRef.current
                if (editor) showQuickFixMenu(editor)
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              title="Quick Fix"
            >
              <Lightbulb size={14} style={{ color: 'var(--accent)' }} />
            </button>
          )}

          {quickFixState.visible && (
            <QuickFixMenu
              fixes={quickFixState.fixes}
              activeIndex={quickFixState.activeIndex}
              position={quickFixState.position}
              onSelect={handleQuickFixSelect}
              onClose={hideQuickFixMenu}
              onMove={handleQuickFixMove}
            />
          )}
        </div>
      )}
    </div>
  )
}
