import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Square, Plus, MessageSquare, Trash2, Loader2 } from 'lucide-react'
import type { ChatSession, ChatMessage as ChatMessageType, Provider, Model, AgentMode } from '../types'
import ChatMessage from './ChatMessage'
import ModelSelector from './ModelSelector'
import AgentModeSelector from './AgentModeSelector'

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
  onCreateSession: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onSendMessage: (text: string) => void
  onAbortMessage: () => void
  onSelectModel: (model: Model) => void
  onAgentModeChange: (mode: AgentMode) => void
}

export default function ChatPanel({
  sessions, activeSessionId, messages, isStreaming, isReady, hasApiKey, error,
  providers, activeModel, agentMode,
  onCreateSession, onSelectSession, onDeleteSession,
  onSendMessage, onAbortMessage, onSelectModel, onAgentModeChange,
}: Props) {
  const [input, setInput] = useState('')
  const [showSessions, setShowSessions] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px'
    }
  }, [input])

  // Can send if we have an API key (even if models are loading)
  const canSend = hasApiKey && input.trim()

  const handleSend = useCallback(() => {
    if (!input.trim() || !hasApiKey) return
    onSendMessage(input.trim())
    setInput('')
  }, [input, hasApiKey, onSendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  // Filter messages for active session
  const sessionMessages = activeSessionId
    ? messages.filter((m) => m.sessionId === activeSessionId || !m.sessionId)
    : []

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between h-8 px-3 shrink-0"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-semibold tracking-widest uppercase"
            style={{ color: 'var(--text-muted)' }}
          >
            Chat
          </span>
          {hasApiKey && (
            <>
              <ModelSelector 
                providers={providers} 
                activeModel={activeModel} 
                onSelectModel={onSelectModel}
              />
              <AgentModeSelector 
                mode={agentMode} 
                onModeChange={onAgentModeChange} 
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Session switcher */}
          <button
            onClick={() => setShowSessions(!showSessions)}
            className="p-1 rounded transition-colors duration-100"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            title="Sessions"
          >
            <MessageSquare size={13} />
          </button>

          {/* New session */}
          <button
            onClick={onCreateSession}
            className="p-1 rounded transition-colors duration-100"
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
            <Plus size={13} />
          </button>
        </div>
      </div>

      {/* Session Dropdown */}
      {showSessions && (
        <div
          className="shrink-0 max-h-[200px] overflow-y-auto py-1"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {sessions.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No sessions yet</p>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between px-3 py-1.5 cursor-pointer transition-colors duration-75"
                style={{
                  backgroundColor: session.id === activeSessionId ? 'var(--accent-glow)' : 'transparent',
                  color: session.id === activeSessionId ? 'var(--accent)' : 'var(--text-secondary)',
                }}
                onClick={() => {
                  onSelectSession(session.id)
                  setShowSessions(false)
                }}
                onMouseEnter={(e) => {
                  if (session.id !== activeSessionId) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (session.id !== activeSessionId) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <span className="text-[11px] truncate">{session.title}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSession(session.id)
                  }}
                  className="p-0.5 rounded opacity-0 hover:opacity-100 transition-opacity duration-100"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={11} />
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {!hasApiKey ? (
          <div className="h-full flex flex-col items-center justify-center px-6">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
            >
              <MessageSquare size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--text-muted)' }}>
              No API key configured
            </p>
            <p className="text-[10px] text-center mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
              Add your API key in Settings to start chatting
            </p>
          </div>
        ) : error ? (
          <div className="h-full flex flex-col items-center justify-center px-6">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ backgroundColor: 'rgba(var(--error-rgb, 220, 53, 69), 0.1)', border: '1px solid var(--error)' }}
            >
              <MessageSquare size={18} style={{ color: 'var(--error)' }} />
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--error)' }}>
              {error}
            </p>
            <p className="text-[10px] text-center mt-1" style={{ color: 'var(--text-muted)' }}>
              Check your API key in Settings
            </p>
          </div>
        ) : sessionMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
              style={{ backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(var(--accent-rgb), 0.15)' }}
            >
              <MessageSquare size={18} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-xs text-center" style={{ color: 'var(--text-secondary)' }}>
              Start a conversation
            </p>
            <p className="text-[10px] text-center mt-1" style={{ color: 'var(--text-muted)' }}>
              Ask the AI agent to help with your code
            </p>
          </div>
        ) : (
          <div>
            {sessionMessages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            {isStreaming && (
              <div className="flex items-center gap-2 px-4 py-2">
                <Loader2 size={14} className="animate-spin" style={{ color: 'var(--accent)' }} />
                <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                  Thinking...
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div
        className="shrink-0 px-3 py-2"
        style={{ borderTop: '1px solid var(--border-subtle)' }}
      >
        <div
          className="flex items-end gap-2 rounded-lg px-3 py-2"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={hasApiKey ? 'Ask anything...' : 'Add API key to start chatting'}
            disabled={!hasApiKey}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none resize-none text-[13px] leading-relaxed"
            style={{
              color: 'var(--text-primary)',
              maxHeight: '120px',
            }}
          />

          {isStreaming ? (
            <button
              onClick={onAbortMessage}
              className="p-1.5 rounded-md shrink-0 transition-colors duration-100"
              style={{
                backgroundColor: 'var(--error)',
                color: '#ffffff',
              }}
              title="Stop generating"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!canSend}
              className="p-1.5 rounded-md shrink-0 transition-all duration-100"
              style={{
                backgroundColor: canSend ? 'var(--accent)' : 'var(--bg-elevated)',
                color: canSend ? '#000000' : 'var(--text-muted)',
                opacity: canSend ? 1 : 0.5,
              }}
              title="Send message"
            >
              <Send size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
