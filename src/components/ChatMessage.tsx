import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { User, Bot, Wrench, CheckCircle, XCircle } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '../types'

interface Props {
  message: ChatMessageType
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'

  return (
    <div
      className="flex gap-2.5 px-4 py-3"
      style={{
        backgroundColor: isUser ? 'transparent' : 'var(--bg-card)',
      }}
    >
      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
        style={{
          backgroundColor: isUser ? 'var(--bg-elevated)' : 'var(--accent-glow)',
          border: `1px solid ${isUser ? 'var(--border-default)' : 'rgba(var(--accent-rgb), 0.2)'}`,
        }}
      >
        {isUser ? (
          <User size={12} style={{ color: 'var(--text-secondary)' }} />
        ) : (
          <Bot size={12} style={{ color: 'var(--accent)' }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Role label */}
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: isUser ? 'var(--text-secondary)' : 'var(--accent)' }}
          >
            {isUser ? 'You' : 'Assistant'}
          </span>
          {message.model && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              {message.model}
            </span>
          )}
        </div>

        {/* Parts */}
        {message.parts.map((part, i) => {
          if (part.type === 'text' && part.text) {
            return (
              <div key={i} className="markdown-content text-[13px] leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {part.text}
                </ReactMarkdown>
              </div>
            )
          }

          if (part.type === 'tool-call' && part.toolCall) {
            return (
              <div
                key={i}
                className="rounded-lg p-3 my-2 text-xs"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <Wrench size={12} style={{ color: 'var(--accent)' }} />
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {part.toolCall.name}
                  </span>
                </div>
                {part.toolCall.args && Object.keys(part.toolCall.args).length > 0 && (
                  <pre
                    className="text-[11px] overflow-x-auto mt-1 p-2 rounded"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-secondary)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {JSON.stringify(part.toolCall.args, null, 2)}
                  </pre>
                )}
              </div>
            )
          }

          if (part.type === 'tool-result' && part.toolResult) {
            const success = part.toolResult.success
            return (
              <div
                key={i}
                className="rounded-lg p-3 my-2 text-xs"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: `1px solid ${success ? 'rgba(var(--accent-rgb), 0.15)' : 'rgba(var(--accent-secondary-rgb), 0.15)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {success ? (
                    <CheckCircle size={12} style={{ color: 'var(--success)' }} />
                  ) : (
                    <XCircle size={12} style={{ color: 'var(--error)' }} />
                  )}
                  <span className="font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {part.toolResult.name}
                  </span>
                </div>
                {part.toolResult.output && (
                  <pre
                    className="text-[11px] overflow-x-auto mt-1 p-2 rounded max-h-[200px] overflow-y-auto"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-secondary)',
                      fontFamily: "'JetBrains Mono', monospace",
                    }}
                  >
                    {part.toolResult.output}
                  </pre>
                )}
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
