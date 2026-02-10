import type * as monaco from 'monaco-editor'

export type QuickFixIcon = 'import' | 'remove' | 'convert' | 'ai' | 'extract'

export interface QuickFixRange {
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export type QuickFixCommand =
  | { id: 'quickfix.import'; symbol: string }
  | { id: 'quickfix.ai'; errorMessage: string; range: QuickFixRange }

export interface QuickFix {
  id: string
  title: string
  icon: QuickFixIcon
  kind: 'deterministic' | 'ai'
  edit?: monaco.editor.IIdentifiedSingleEditOperation[]
  command?: QuickFixCommand
  diagnostics: monaco.editor.IMarkerData[]
  disabled?: boolean
}
