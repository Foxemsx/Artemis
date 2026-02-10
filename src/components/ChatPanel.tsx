import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Square, Plus, MessageSquare, Trash2, ArrowUp, X, Shield, ShieldCheck, ShieldAlert, RotateCcw, History, Image as ImageIcon } from 'lucide-react'
import type { ChatSession, ChatMessage as ChatMessageType, Provider, Model, AgentMode, EditApprovalMode } from '../types'
import type { Checkpoint } from '../lib/checkpoints'
import { getLatestPlan } from '../lib/todoParser'
import ChatMessage from './ChatMessage'
import ModelSelector from './ModelSelector'
import AgentModeSelector from './AgentModeSelector'
import EnhancedChatInput, { type AttachedFile } from './EnhancedChatInput'
import TodoPanel from './TodoPanel'

interface Props {
  sessions: ChatSession[]
  activeSessionId: string | null
  messages: ChatMessageType[]
  isStreaming: boolean
  isReady: boolean
  hasApiKey: boolean
  error: string | null
  providers: Provider[]
  activeModel: Model | null
  agentMode: AgentMode
  editApprovalMode: EditApprovalMode
  onEditApprovalModeChange: (mode: EditApprovalMode) => void
  projectPath: string | null
  onCreateSession: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onSendMessage: (text: string, fileContext?: string, modeOverride?: AgentMode, planText?: string, images?: Array<{ id: string; url: string; name: string }>) => void
  onAbortMessage: () => void
  onSelectModel: (model: Model) => void
  onAgentModeChange: (mode: AgentMode) => void
  onClearMessages?: () => void
  onOpenTerminal?: () => void
  onOpenFile?: (filePath: string) => void
  checkpoints: Checkpoint[]
  onRestoreCheckpoint: (checkpointId: string) => Promise<{ restored: number; errors: string[] } | null>
}

export default function ChatPanel({
  sessions, activeSessionId, messages, isStreaming, isReady, hasApiKey, error,
  providers, activeModel, agentMode, editApprovalMode, onEditApprovalModeChange, projectPath,
  onCreateSession, onSelectSession, onDeleteSession,
  onSendMessage, onAbortMessage, onSelectModel, onAgentModeChange,
  onClearMessages, onOpenTerminal, onOpenFile,
  checkpoints, onRestoreCheckpoint,
}: Props) {
  const [input, setInput] = useState('')
  const [showSessions, setShowSessions] = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const mentionResolverRef = useRef<(() => Promise<{ text: string; mentions: { name: string; path: string; content: string }[] }>) | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [showApprovalMenu, setShowApprovalMenu] = useState(false)
  const [attachedImages, setAttachedImages] = useState<Array<{ id: string; url: string; name: string }>>([])
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const attachImageRef = useRef<(() => void) | null>(null)

  // Listen for "Add Selection to Chat" from the editor context menu
  useEffect(() => {
    const handler = (e: Event) => {
      const { text, filePath, language } = (e as CustomEvent).detail
      if (!text) return
      const fileName = filePath ? filePath.split(/[\\/]/).pop() || 'selection' : 'selection'
      const newFile: AttachedFile = {
        id: `sel-${Date.now()}-${Math.random()}`,
        name: fileName,
        path: filePath || 'selection',
        content: text,
      }
      setAttachedFiles(prev => [...prev, newFile])
      // Focus the chat input
      setTimeout(() => {
        const chatInput = document.querySelector('[data-chat-input]') as HTMLTextAreaElement | null
        chatInput?.focus()
      }, 50)
    }
    window.addEventListener('artemis:add-selection-to-chat', handler)
    return () => window.removeEventListener('artemis:add-selection-to-chat', handler)
  }, [])

  const scrollRafRef = useRef<number>(0)
  useEffect(() => {
    cancelAnimationFrame(scrollRafRef.current)
    scrollRafRef.current = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    })
    return () => cancelAnimationFrame(scrollRafRef.current)
  }, [messages])

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  const canSend = hasApiKey && input.trim()

  const handleSend = useCallback(async () => {
    if (!input.trim() || !hasApiKey) return
    
    // Handle slash commands
    const trimmedInput = input.trim()
    if (trimmedInput.startsWith('/')) {
      const command = trimmedInput.split(' ')[0].toLowerCase()
      
      switch (command) {
        case '/new':
          onCreateSession()
          setInput('')
          setAttachedImages([])
          setAttachedFiles([])
          return
        case '/clear':
          onClearMessages?.()
          setInput('')
          setAttachedImages([])
          setAttachedFiles([])
          return
        case '/terminal':
          onOpenTerminal?.()
          setInput('')
          setAttachedImages([])
          setAttachedFiles([])
          return
        case '/help':
          setShowHelp(true)
          setInput('')
          setAttachedImages([])
          setAttachedFiles([])
          return
        case '/init':
          onSendMessage(
            '/init — Analyze this project and create an artemis.md file in the project root.',
            `[System instruction]\nAnalyze the entire project structure, tech stack, entry points, key files, and architecture. Then create an artemis.md file in the project root directory with:\n\n1. **Project Overview** — What this project is, its purpose\n2. **Tech Stack** — Languages, frameworks, libraries, tools\n3. **Project Structure** — Directory layout with descriptions\n4. **Entry Points** — Main files that start the app\n5. **Key Components/Modules** — Important files and what they do\n6. **Development Setup** — How to install, run, build, test\n7. **Conventions** — Code style, naming, patterns used\n8. **AI Instructions** — Rules the AI should follow when editing this project (e.g., preserve comments, follow existing patterns, don't break imports)\n\nWrite the file using window.artemis tools (write_file). Make it comprehensive but concise. This file will be automatically read by the AI on every future message to maintain project context. The file is called artemis.md (like CLAUDE.md for Claude) — it defines project-wide rules for the Artemis AI agent.`
          )
          setInput('')
          setAttachedImages([])
          setAttachedFiles([])
          return
        default:
          // Unknown command, send as regular message
          break
      }
    }
    
    // Resolve @mentions - read file contents and build enriched message
    let messageToSend = trimmedInput
    let fileContext: string | undefined
    if (mentionResolverRef.current && trimmedInput.includes('@')) {
      try {
        const resolved = await mentionResolverRef.current()
        if (resolved.mentions.length > 0) {
          // Build file context for the AI (not displayed to user)
          let contextBlock = '[Referenced files]\n'
          for (const mention of resolved.mentions) {
            contextBlock += `\n--- ${mention.path} ---\n${mention.content.slice(0, 20000)}\n`
          }
          messageToSend = trimmedInput
          fileContext = contextBlock
        }
      } catch (err) {
        console.error('[ChatPanel] Failed to resolve mentions:', err)
      }
    }

    // Include drag-and-dropped files as context
    if (attachedFiles.length > 0) {
      let filesBlock = fileContext ? fileContext + '\n' : ''
      filesBlock += '[Attached files]\n'
      for (const f of attachedFiles) {
        filesBlock += `\n--- ${f.path} ---\n${f.content.slice(0, 20000)}\n`
      }
      fileContext = filesBlock
    }
    
    onSendMessage(messageToSend, fileContext || undefined, undefined, undefined, attachedImages.length > 0 ? attachedImages : undefined)
    setInput('')
    setAttachedImages([])
    setAttachedFiles([])
  }, [input, hasApiKey, onSendMessage, onCreateSession, onClearMessages, onOpenTerminal, attachedImages, attachedFiles])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }, [handleSend])

  const sessionMessages = useMemo(() =>
    activeSessionId
      ? messages.filter((m) => m.sessionId === activeSessionId || !m.sessionId)
      : [],
    [messages, activeSessionId]
  )

  // Extract latest TODO plan from assistant messages
  const latestPlan = useMemo(() => {
    if (!activeSessionId || sessionMessages.length === 0) return null
    return getLatestPlan(sessionMessages, activeSessionId)
  }, [activeSessionId, sessionMessages])

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between h-10 px-4 shrink-0 min-w-0"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0 overflow-hidden">
          <span
            className="text-[11px] font-semibold tracking-widest uppercase shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            Chat
          </span>
          {hasApiKey && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              <div className="shrink-0" style={{ height: 14, width: 1, backgroundColor: 'var(--border-subtle)' }} />
              <div className="shrink-0">
                <ModelSelector
                  providers={providers}
                  activeModel={activeModel}
                  onSelectModel={onSelectModel}
                />
              </div>
              <div className="shrink-0">
                <AgentModeSelector
                  mode={agentMode}
                  onModeChange={onAgentModeChange}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="p-1.5 rounded-md transition-all duration-150"
            style={{ color: showSessions ? 'var(--accent)' : 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = showSessions ? 'var(--accent)' : 'var(--text-muted)'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            title="Sessions"
          >
            <MessageSquare size={14} />
          </button>
          <button
            onClick={() => {
              onCreateSession()
              setInput('')
              setAttachedImages([])
              setAttachedFiles([])
            }}
            className="p-1.5 rounded-md transition-all duration-150"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            title="New session"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Session Dropdown */}
      {showSessions && (
        <div
          className="shrink-0 max-h-[220px] overflow-y-auto py-1"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-subtle)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}
        >
          {sessions.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <MessageSquare size={20} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', opacity: 0.5 }} />
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No sessions yet</p>
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>Start a conversation below</p>
            </div>
          ) : (
            sessions.map((session) => {
              const isActive = session.id === activeSessionId
              return (
                <div
                  key={session.id}
                  className="group flex items-center justify-between px-4 py-2 cursor-pointer transition-all duration-100"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-glow)' : 'transparent',
                  }}
                  onClick={() => {
                    onSelectSession(session.id)
                    setShowSessions(false)
                    setInput('')
                    setAttachedImages([])
                    setAttachedFiles([])
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: isActive ? 'var(--accent)' : 'var(--text-muted)', opacity: isActive ? 1 : 0.3 }}
                    />
                    <span
                      className="text-[12px] truncate"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--text-secondary)' }}
                    >
                      {session.title}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteSession(session.id)
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all duration-100"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* TODO Plan Panel */}
      <TodoPanel
        plan={latestPlan}
        agentMode={agentMode}
        isStreaming={isStreaming}
        onImplementPlan={(planText) => {
          // Switch to builder mode and send the plan with explicit mode override
          onAgentModeChange('builder')
          onSendMessage(
            `Implementing following plan step by step:\n\n${planText}\n\nExecute each step using your tools. Mark progress as you go.`,
            undefined,
            'builder',
            planText
          )
          setInput('')
          setAttachedImages([])
          setAttachedFiles([])
        }}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {!hasApiKey ? (
          <div className="h-full flex flex-col items-center justify-center px-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
            >
              <MessageSquare size={22} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
            </div>
            <p className="text-sm font-medium text-center mb-1" style={{ color: 'var(--text-secondary)' }}>
              No API key configured
            </p>
            <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
              Add your OpenCode Zen API key in Settings to start chatting
            </p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center px-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ backgroundColor: 'rgba(192, 57, 43, 0.08)', border: '1px solid rgba(192, 57, 43, 0.15)' }}
            >
              <MessageSquare size={22} style={{ color: 'var(--error)' }} />
            </div>
            <p className="text-sm font-medium text-center mb-1" style={{ color: 'var(--error)' }}>
              Connection Error
            </p>
            <p className="text-[11px] text-center max-w-xs" style={{ color: 'var(--text-muted)' }}>
              {error}
            </p>
            <p className="text-[10px] text-center mt-2" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
              Check your API key in Settings
            </p>
          </div>
        ) : sessionMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{ backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(var(--accent-rgb), 0.12)' }}
            >
              <MessageSquare size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-sm font-medium text-center mb-1" style={{ color: 'var(--text-primary)' }}>
              Start a conversation
            </p>
            <p className="text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
              Ask the AI agent to help with your code
            </p>
          </div>
        ) : (
          <div className="py-2">
            {sessionMessages.map((msg, idx) => {
              // Find checkpoint associated with this message
              const cp = checkpoints.find(c => c.messageId === msg.id)
              return (
                <div key={msg.id}>
                  {cp && (
                    <CheckpointMarker
                      checkpoint={cp}
                      onRestore={() => onRestoreCheckpoint(cp.id)}
                    />
                  )}
                  <ChatMessage message={msg} onOpenFile={onOpenFile} />
                </div>
              )
            })}
            {isStreaming && (
              <div className="flex items-center gap-3 px-5 py-3">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '0ms', animationDuration: '0.6s' }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '150ms', animationDuration: '0.6s' }} />
                  <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent)', animationDelay: '300ms', animationDuration: '0.6s' }} />
                </div>
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Thinking...
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Help Modal */}
      {showHelp && (
        <div className="shrink-0 px-3 pb-2">
          <div
            className="rounded-lg p-3 text-[11px]"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Available Commands</span>
              <button
                onClick={() => setShowHelp(false)}
                className="p-1 rounded hover:bg-[var(--bg-hover)]"
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={12} />
              </button>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <code className="px-1.5 py-0.5 rounded bg-[var(--bg-card)]" style={{ color: 'var(--accent)' }}>/new</code>
                <span style={{ color: 'var(--text-muted)' }}>Create new chat session</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-1.5 py-0.5 rounded bg-[var(--bg-card)]" style={{ color: 'var(--accent)' }}>/clear</code>
                <span style={{ color: 'var(--text-muted)' }}>Clear current conversation</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-1.5 py-0.5 rounded bg-[var(--bg-card)]" style={{ color: 'var(--accent)' }}>/terminal</code>
                <span style={{ color: 'var(--text-muted)' }}>Open a new terminal</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-1.5 py-0.5 rounded bg-[var(--bg-card)]" style={{ color: 'var(--accent)' }}>/help</code>
                <span style={{ color: 'var(--text-muted)' }}>Show this help message</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="px-1.5 py-0.5 rounded bg-[var(--bg-card)]" style={{ color: 'var(--accent)' }}>/init</code>
                <span style={{ color: 'var(--text-muted)' }}>Analyze project &amp; create artemis.md</span>
              </div>
              <div className="pt-1 mt-1 border-t border-[var(--border-subtle)]">
                <span style={{ color: 'var(--text-muted)' }}>Type <code style={{ color: 'var(--accent)' }}>@</code> to mention files, <code style={{ color: 'var(--accent)' }}>@codebase</code> for full project</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="shrink-0 p-3">
        <div
          className="chat-input-box rounded-xl transition-all duration-200"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: `1px solid ${inputFocused ? 'var(--border-default)' : 'var(--border-subtle)'}`,
            boxShadow: inputFocused
              ? '0 2px 12px rgba(0,0,0,0.15)'
              : '0 2px 8px rgba(0,0,0,0.08)',
            outline: 'none',
          }}
        >
          <EnhancedChatInput
            value={input}
            onChange={setInput}
            onSend={handleSend}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? 'Ask anything...' : 'Add API key to start chatting'}
            disabled={!hasApiKey}
            projectPath={projectPath}
            mentionResolverRef={mentionResolverRef}
            attachedImages={attachedImages}
            onImagesChange={setAttachedImages}
            attachImageRef={attachImageRef}
            attachedFiles={attachedFiles}
            onFilesChange={setAttachedFiles}
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            {/* Edit Approval Mode + Image Attach - bottom left */}
            <div className="flex items-center gap-1.5">
            <div className="relative">
              <button
                onClick={() => setShowApprovalMenu(!showApprovalMenu)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium transition-all duration-150"
                style={{
                  color: editApprovalMode === 'ask' ? 'var(--warning, #f59e0b)' : editApprovalMode === 'allow-all' ? 'var(--success)' : 'var(--text-muted)',
                  backgroundColor: showApprovalMenu ? 'var(--bg-hover)' : 'transparent',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (!showApprovalMenu) e.currentTarget.style.backgroundColor = 'transparent' }}
                title="Edit approval mode"
              >
                {editApprovalMode === 'allow-all' ? <ShieldCheck size={11} /> : editApprovalMode === 'ask' ? <ShieldAlert size={11} /> : <Shield size={11} />}
                <span>{editApprovalMode === 'allow-all' ? 'Auto-edit' : editApprovalMode === 'session-only' ? 'Session' : 'Ask first'}</span>
              </button>
              {showApprovalMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowApprovalMenu(false)} />
                  <div
                    className="absolute bottom-full left-0 mb-1.5 z-50 w-56 rounded-lg py-1 shadow-xl"
                    style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
                  >
                    <div className="px-3 py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <span className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Edit Approval</span>
                    </div>
                    {([
                      { mode: 'allow-all' as EditApprovalMode, icon: ShieldCheck, label: 'Allow All Edits', desc: 'Agent edits files automatically', color: 'var(--success)' },
                      { mode: 'session-only' as EditApprovalMode, icon: Shield, label: 'Session Only', desc: 'Auto-approve this session, ask next', color: 'var(--text-secondary)' },
                      { mode: 'ask' as EditApprovalMode, icon: ShieldAlert, label: 'Ask Before Edit', desc: 'Require approval for each write', color: 'var(--warning, #f59e0b)' },
                    ]).map(opt => {
                      const Icon = opt.icon
                      const isActive = editApprovalMode === opt.mode
                      return (
                        <button
                          key={opt.mode}
                          onClick={() => { onEditApprovalModeChange(opt.mode); setShowApprovalMenu(false) }}
                          className="w-full flex items-start gap-2.5 px-3 py-2 text-left transition-all duration-100"
                          style={{ backgroundColor: isActive ? 'var(--accent-glow)' : 'transparent' }}
                          onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
                          onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = isActive ? 'var(--accent-glow)' : 'transparent' }}
                        >
                          <Icon size={14} style={{ color: isActive ? 'var(--accent)' : opt.color, marginTop: 1, flexShrink: 0 }} />
                          <div>
                            <p className="text-[11px] font-semibold" style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>{opt.label}</p>
                            <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{opt.desc}</p>
                          </div>
                          {isActive && <span className="ml-auto text-[10px]" style={{ color: 'var(--accent)' }}>✓</span>}
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
            {/* Image attach + paste hint */}
            <div className="h-3.5 w-px shrink-0" style={{ backgroundColor: 'var(--border-subtle)' }} />
            <button
              onClick={() => attachImageRef.current?.()}
              disabled={!hasApiKey}
              className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={e => { if (hasApiKey) { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.backgroundColor = 'var(--bg-hover)' } }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.backgroundColor = 'transparent' }}
              title="Attach images (Ctrl+V to paste)"
            >
              <ImageIcon size={11} />
              <span>Image</span>
            </button>
            <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)', opacity: 0.4 }}>
              Ctrl+V
            </span>
            </div>
            {isStreaming ? (
              <button
                onClick={onAbortMessage}
                className="p-1.5 rounded-lg shrink-0 transition-all duration-150 flex items-center gap-1.5"
                style={{ backgroundColor: 'var(--error)', color: '#ffffff' }}
                title="Stop generating"
              >
                <Square size={12} fill="currentColor" />
                <span className="text-[10px] font-medium pr-0.5">Stop</span>
              </button>
            ) : (
              <button
                onClick={() => void handleSend()}
                disabled={!canSend}
                className="p-2 rounded-lg shrink-0 transition-all duration-150"
                style={{
                  backgroundColor: canSend ? 'var(--accent)' : 'var(--bg-elevated)',
                  color: canSend ? '#000000' : 'var(--text-muted)',
                  opacity: canSend ? 1 : 0.4,
                }}
                title="Send message"
              >
                <ArrowUp size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Checkpoint Marker ───────────────────────────────────────────────────────

function CheckpointMarker({ checkpoint, onRestore }: { checkpoint: Checkpoint; onRestore: () => Promise<any> }) {
  const [restoring, setRestoring] = useState(false)

  const handleRestore = async () => {
    setRestoring(true)
    try {
      await onRestore()
    } catch {
      // error handled elsewhere
    }
    setRestoring(false)
  }

  const time = new Date(checkpoint.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="flex items-center gap-2 px-5 py-1.5 select-none">
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px]"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
      >
        <History size={10} />
        <span>Checkpoint {time}</span>
        <span style={{ color: 'var(--text-muted)', opacity: 0.5 }}>·</span>
        <span>{checkpoint.files.length} files</span>
        <button
          onClick={handleRestore}
          disabled={restoring}
          className="flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold transition-all duration-100"
          style={{ color: 'var(--accent)', backgroundColor: 'transparent' }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--accent-glow)' }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
          title="Restore files to this checkpoint"
        >
          <RotateCcw size={9} />
          {restoring ? 'Restoring...' : 'Revert'}
        </button>
      </div>
      <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
    </div>
  )
}
