import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels'
import type { ActivityView, Theme, ChatSession, ChatMessage, EditorTab, Provider, Model, PtySession, AgentMode, EditApprovalMode, AIProvider } from '../types'
import FileExplorer from './FileExplorer'
import Editor from './Editor'
import ChatPanel from './ChatPanel'
import TerminalPanel from './TerminalPanel'
import Settings from './Settings'
import ProblemsPanel from './ProblemsPanel'
import SearchPanel from './SearchPanel'

interface Props {
  activeView: ActivityView
  theme: Theme
  projectPath: string | null

  // Editor
  editorTabs: EditorTab[]
  activeTabPath: string | null
  onOpenFile: (filePath: string) => void
  onCloseTab: (path: string) => void
  onCloseOtherTabs: (path: string) => void
  onCloseAllTabs: () => void
  onCloseTabsToRight: (path: string) => void
  onSelectTab: (path: string) => void
  onSaveFile: (path: string, content: string) => void
  onTabContentChange: (path: string, content: string) => void

  // File system (context menu)
  onDeletePath: (path: string) => void
  onRenamePath: (oldPath: string, newName: string) => void
  onCreateFile: (dirPath: string, name: string) => void
  onCreateFolder: (dirPath: string, name: string) => void

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
  onSendMessage: (text: string, fileContext?: string) => void
  onAbortMessage: () => void
  onSelectModel: (model: Model) => void
  onAgentModeChange: (mode: AgentMode) => void
  editApprovalMode: EditApprovalMode
  onEditApprovalModeChange: (mode: EditApprovalMode) => void
  onClearMessages?: () => void
  onOpenTerminal?: () => void
  checkpoints: import('../lib/checkpoints').Checkpoint[]
  onRestoreCheckpoint: (checkpointId: string) => Promise<{ restored: number; errors: string[] } | null>

  // Terminal
  ptyTerminals: PtySession[]
  onNewTerminal: () => void
  onCloseTerminal: (id: string) => void

  // Settings
  onToggleTheme: () => void
  onSetTheme: (theme: Theme) => void
  apiKeys: Record<AIProvider, { key: string; isConfigured: boolean }>
  onSetApiKey: (provider: AIProvider, key: string) => Promise<boolean>
  soundSettings: import('../lib/sounds').SoundSettings
  onSetSoundSettings: (settings: import('../lib/sounds').SoundSettings) => void
  fileRefreshTrigger?: number
  chatVisible?: boolean
}

export default function PanelLayout({
  activeView, theme, projectPath,
  editorTabs, activeTabPath, onOpenFile, onCloseTab, onCloseOtherTabs, onCloseAllTabs, onCloseTabsToRight,
  onSelectTab, onSaveFile, onTabContentChange,
  onDeletePath, onRenamePath, onCreateFile, onCreateFolder,
  sessions, activeSessionId, messages, isStreaming, isReady, hasApiKey, error,
  providers, activeModel, agentMode,
  onCreateSession, onSelectSession, onDeleteSession, onSendMessage, onAbortMessage,
  onSelectModel, onAgentModeChange, editApprovalMode, onEditApprovalModeChange, onClearMessages, onOpenTerminal, checkpoints, onRestoreCheckpoint,
  ptyTerminals, onNewTerminal, onCloseTerminal,
  onToggleTheme, onSetTheme, apiKeys, onSetApiKey, soundSettings, onSetSoundSettings, fileRefreshTrigger,
  chatVisible = true,
}: Props) {

  // Problems view — full panel
  if (activeView === 'problems') {
    return (
      <div className="flex-1 overflow-hidden">
        <PanelGroup orientation="vertical" className="flex-1">
          <Panel defaultSize="60%" minSize="30%" id="problems-main">
            <PanelGroup orientation="horizontal">
              <Panel defaultSize="50%" minSize="20%" id="problems-panel">
                <ProblemsPanel projectPath={projectPath} onOpenFile={onOpenFile} />
              </Panel>
              <PanelResizeHandle />
              <Panel defaultSize="50%" minSize="20%" id="problems-editor">
                <Editor
                  tabs={editorTabs}
                  activeTabPath={activeTabPath}
                  onSelectTab={onSelectTab}
                  onCloseTab={onCloseTab}
                  onCloseOtherTabs={onCloseOtherTabs}
                  onCloseAllTabs={onCloseAllTabs}
                  onCloseTabsToRight={onCloseTabsToRight}
                  onSave={onSaveFile}
                  onContentChange={onTabContentChange}
                  theme={theme}
                />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle />
          <Panel defaultSize="40%" minSize="10%" maxSize="60%" id="problems-terminal" collapsible collapsedSize="0%">
            <TerminalPanel terminals={ptyTerminals} onNewTerminal={onNewTerminal} onCloseTerminal={onCloseTerminal} theme={theme} projectPath={projectPath} />
          </Panel>
        </PanelGroup>
      </div>
    )
  }

  // Search view — full panel
  if (activeView === 'search') {
    return (
      <div className="flex-1 overflow-hidden">
        <PanelGroup orientation="vertical" className="flex-1">
          <Panel defaultSize="60%" minSize="30%" id="search-main">
            <PanelGroup orientation="horizontal">
              <Panel defaultSize="35%" minSize="15%" id="search-panel">
                <SearchPanel projectPath={projectPath} onOpenFile={onOpenFile} />
              </Panel>
              <PanelResizeHandle />
              <Panel defaultSize="65%" minSize="20%" id="search-editor">
                <Editor
                  tabs={editorTabs}
                  activeTabPath={activeTabPath}
                  onSelectTab={onSelectTab}
                  onCloseTab={onCloseTab}
                  onCloseOtherTabs={onCloseOtherTabs}
                  onCloseAllTabs={onCloseAllTabs}
                  onCloseTabsToRight={onCloseTabsToRight}
                  onSave={onSaveFile}
                  onContentChange={onTabContentChange}
                  theme={theme}
                />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle />
          <Panel defaultSize="40%" minSize="10%" maxSize="60%" id="search-terminal" collapsible collapsedSize="0%">
            <TerminalPanel terminals={ptyTerminals} onNewTerminal={onNewTerminal} onCloseTerminal={onCloseTerminal} theme={theme} projectPath={projectPath} />
          </Panel>
        </PanelGroup>
      </div>
    )
  }

  // Settings takes over the entire panel
  if (activeView === 'settings') {
    return (
      <div className="flex-1 overflow-hidden">
        <Settings 
          theme={theme} 
          onToggleTheme={onToggleTheme}
          onSetTheme={onSetTheme}
          apiKeys={apiKeys}
          onSetApiKey={onSetApiKey}
          soundSettings={soundSettings}
          onSetSoundSettings={onSetSoundSettings}
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
                  onDeletePath={onDeletePath}
                  onRenamePath={onRenamePath}
                  onCreateFile={onCreateFile}
                  onCreateFolder={onCreateFolder}
                  refreshTrigger={fileRefreshTrigger}
                />
              </Panel>
              <PanelResizeHandle />
            </>
          )}

          {/* Code Editor (always visible unless Chat is solo) */}
          {activeView !== 'chat' && (
            <>
              <Panel defaultSize={chatVisible ? (activeView === 'files' ? '55%' : '65%') : '100%'} minSize="20%" id="editor-panel">
                <Editor
                  tabs={editorTabs}
                  activeTabPath={activeTabPath}
                  onSelectTab={onSelectTab}
                  onCloseTab={onCloseTab}
                  onCloseOtherTabs={onCloseOtherTabs}
                  onCloseAllTabs={onCloseAllTabs}
                  onCloseTabsToRight={onCloseTabsToRight}
                  onSave={onSaveFile}
                  onContentChange={onTabContentChange}
                  theme={theme}
                />
              </Panel>
              {chatVisible && (
                <>
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
                      projectPath={projectPath}
                      onCreateSession={onCreateSession}
                      onSelectSession={onSelectSession}
                      onDeleteSession={onDeleteSession}
                      onSendMessage={onSendMessage}
                      onAbortMessage={onAbortMessage}
                      onSelectModel={onSelectModel}
                      onAgentModeChange={onAgentModeChange}
                      editApprovalMode={editApprovalMode}
                      onEditApprovalModeChange={onEditApprovalModeChange}
                      onClearMessages={onClearMessages}
                      onOpenTerminal={onOpenTerminal}
                      checkpoints={checkpoints}
                      onRestoreCheckpoint={onRestoreCheckpoint}
                    />
                  </Panel>
                </>
              )}
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
                projectPath={projectPath}
                onCreateSession={onCreateSession}
                onSelectSession={onSelectSession}
                onDeleteSession={onDeleteSession}
                onSendMessage={onSendMessage}
                onAbortMessage={onAbortMessage}
                onSelectModel={onSelectModel}
                onAgentModeChange={onAgentModeChange}
                editApprovalMode={editApprovalMode}
                onEditApprovalModeChange={onEditApprovalModeChange}
                onClearMessages={onClearMessages}
                onOpenTerminal={onOpenTerminal}
                checkpoints={checkpoints}
                onRestoreCheckpoint={onRestoreCheckpoint}
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
