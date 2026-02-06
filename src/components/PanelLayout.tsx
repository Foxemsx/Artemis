import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import type { ActivityView, Theme, ChatSession, ChatMessage, EditorTab, Provider, Model, PtySession, AgentMode } from '../types'
import FileExplorer from './FileExplorer'
import Editor from './Editor'
import ChatPanel from './ChatPanel'
import TerminalPanel from './TerminalPanel'
import Settings from './Settings'

interface Props {
  activeView: ActivityView
  theme: Theme
  projectPath: string | null

  // Editor
  editorTabs: EditorTab[]
  activeTabPath: string | null
  onOpenFile: (filePath: string) => void
  onCloseTab: (path: string) => void
  onSelectTab: (path: string) => void
  onSaveFile: (path: string, content: string) => void
  onTabContentChange: (path: string, content: string) => void

  // Chat
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: ChatMessage[]
  isStreaming: boolean
  isReady: boolean
  hasApiKey: boolean
  error: string | null
  providers: Provider[]
  activeModel: Model | null
  agentMode: AgentMode
  onCreateSession: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onSendMessage: (text: string) => void
  onAbortMessage: () => void
  onSelectModel: (model: Model) => void
  onAgentModeChange: (mode: AgentMode) => void

  // Terminal
  ptyTerminals: PtySession[]
  onNewTerminal: () => void
  onCloseTerminal: (id: string) => void

  // Settings
  onToggleTheme: () => void
  onSetApiKey: (key: string) => Promise<boolean>
}

export default function PanelLayout({
  activeView, theme, projectPath,
  editorTabs, activeTabPath, onOpenFile, onCloseTab, onSelectTab, onSaveFile, onTabContentChange,
  sessions, activeSessionId, messages, isStreaming, isReady, hasApiKey, error,
  providers, activeModel, agentMode,
  onCreateSession, onSelectSession, onDeleteSession, onSendMessage, onAbortMessage,
  onSelectModel, onAgentModeChange,
  ptyTerminals, onNewTerminal, onCloseTerminal,
  onToggleTheme, onSetApiKey,
}: Props) {

  // Settings takes over the entire panel
  if (activeView === 'settings') {
    return (
      <div className="flex-1 overflow-hidden">
        <Settings 
          theme={theme} 
          onToggleTheme={onToggleTheme} 
          hasApiKey={hasApiKey}
          onSetApiKey={onSetApiKey}
        />
      </div>
    )
  }

  return (
    <PanelGroup orientation="vertical" className="flex-1">
      {/* Main horizontal area */}
      <Panel defaultSize="75%" minSize="30%" id="main-panel">
        <PanelGroup orientation="horizontal">
          {/* File Explorer (visible when Files view is active) */}
          {activeView === 'files' && (
            <>
              <Panel defaultSize="20%" minSize="12%" maxSize="40%" id="explorer-panel">
                <FileExplorer
                  projectPath={projectPath}
                  onOpenFile={onOpenFile}
                />
              </Panel>
              <PanelResizeHandle />
            </>
          )}

          {/* Code Editor (always visible unless Chat is solo) */}
          {activeView !== 'chat' && (
            <>
              <Panel defaultSize={activeView === 'files' ? '55%' : '65%'} minSize="20%" id="editor-panel">
                <Editor
                  tabs={editorTabs}
                  activeTabPath={activeTabPath}
                  onSelectTab={onSelectTab}
                  onCloseTab={onCloseTab}
                  onSave={onSaveFile}
                  onContentChange={onTabContentChange}
                  theme={theme}
                />
              </Panel>
              <PanelResizeHandle />
              <Panel defaultSize={activeView === 'files' ? '25%' : '35%'} minSize="20%" id="chat-side-panel">
                <ChatPanel
                  sessions={sessions}
                  activeSessionId={activeSessionId}
                  messages={messages}
                  isStreaming={isStreaming}
                  isReady={isReady}
                  hasApiKey={hasApiKey}
                  error={error}
                  providers={providers}
                  activeModel={activeModel}
                  agentMode={agentMode}
                  onCreateSession={onCreateSession}
                  onSelectSession={onSelectSession}
                  onDeleteSession={onDeleteSession}
                  onSendMessage={onSendMessage}
                  onAbortMessage={onAbortMessage}
                  onSelectModel={onSelectModel}
                  onAgentModeChange={onAgentModeChange}
                />
              </Panel>
            </>
          )}

          {/* Chat-only view */}
          {activeView === 'chat' && (
            <Panel defaultSize="100%" minSize="30%" id="chat-full-panel">
              <ChatPanel
                sessions={sessions}
                activeSessionId={activeSessionId}
                messages={messages}
                isStreaming={isStreaming}
                isReady={isReady}
                hasApiKey={hasApiKey}
                error={error}
                providers={providers}
                activeModel={activeModel}
                agentMode={agentMode}
                onCreateSession={onCreateSession}
                onSelectSession={onSelectSession}
                onDeleteSession={onDeleteSession}
                onSendMessage={onSendMessage}
                onAbortMessage={onAbortMessage}
                onSelectModel={onSelectModel}
                onAgentModeChange={onAgentModeChange}
              />
            </Panel>
          )}
        </PanelGroup>
      </Panel>

      {/* Terminal Panel (bottom, always visible) */}
      <PanelResizeHandle />
      <Panel
        defaultSize="25%"
        minSize="10%"
        maxSize="60%"
        id="terminal-panel"
        collapsible
        collapsedSize="0%"
      >
        <TerminalPanel
          terminals={ptyTerminals}
          onNewTerminal={onNewTerminal}
          onCloseTerminal={onCloseTerminal}
          theme={theme}
          projectPath={projectPath}
        />
      </Panel>
    </PanelGroup>
  )
}
