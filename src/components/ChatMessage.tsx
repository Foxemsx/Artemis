import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { motion } from 'framer-motion'
import { 
  User, 
  Bot, 
  ChevronDown, 
  ChevronRight,
  AlertTriangle,
  Check,
  X,
  Terminal as TerminalIcon,
} from 'lucide-react'
import type { ChatMessage as ChatMessageType, MessagePart } from '../types'
import { 
  getToolConfig, 
  formatToolArgs, 
  truncatePath,
} from '../lib/toolIcons'
import ThinkingBlock from './ThinkingBlock'

interface Props {
  message: ChatMessageType
}

/** Highlight @mentions inside a string, returning an array of ReactNodes */
function highlightMentions(content: string): React.ReactNode[] {
  const mentionRegex = /@([\w./-]+)/g
  const result: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      result.push(content.slice(lastIndex, match.index))
    }
    result.push(
      <span
        key={`m-${key++}`}
        className="inline-flex items-center rounded px-1.5 py-0.5 text-[12px] font-mono font-medium mx-0.5 align-baseline"
        style={{
          backgroundColor: 'rgba(212, 168, 83, 0.15)',
          color: 'var(--accent)',
          border: '1px solid rgba(212, 168, 83, 0.25)',
        }}
      >
        {match[0]}
      </span>
    )
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < content.length) {
    result.push(content.slice(lastIndex))
  }
  return result
}

/** Process children of a markdown element, highlighting @mentions in text nodes */
function processChildren(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, child => {
    if (typeof child === 'string') {
      const highlighted = highlightMentions(child)
      return highlighted.length === 1 && typeof highlighted[0] === 'string'
        ? child
        : <>{highlighted}</>
    }
    return child
  })
}

/** Render text with @mentions highlighted */
function HighlightedMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children, ...props }) => <p {...props}>{processChildren(children)}</p>,
        li: ({ children, ...props }) => <li {...props}>{processChildren(children)}</li>,
        td: ({ children, ...props }) => <td {...props}>{processChildren(children)}</td>,
        th: ({ children, ...props }) => <th {...props}>{processChildren(children)}</th>,
      }}
    >
      {text}
    </ReactMarkdown>
  )
}

/** Inline mini-diff for str_replace tool calls */
function InlineDiff({ oldStr, newStr }: { oldStr: string; newStr: string }) {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')

  return (
    <div
      className="mt-1 ml-4 rounded-md overflow-hidden font-mono text-[10px] leading-[16px] max-h-[200px] overflow-y-auto"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      {oldLines.map((line, i) => (
        <div key={`r-${i}`} className="flex" style={{ backgroundColor: 'rgba(192, 57, 43, 0.08)' }}>
          <span className="w-5 shrink-0 text-center select-none" style={{ color: 'var(--error)', opacity: 0.6 }}>-</span>
          <span className="flex-1 px-1 whitespace-pre-wrap break-all" style={{ color: 'var(--error)', opacity: 0.85 }}>{line}</span>
        </div>
      ))}
      {newLines.map((line, i) => (
        <div key={`a-${i}`} className="flex" style={{ backgroundColor: 'rgba(74, 222, 128, 0.08)' }}>
          <span className="w-5 shrink-0 text-center select-none" style={{ color: 'var(--success)', opacity: 0.6 }}>+</span>
          <span className="flex-1 px-1 whitespace-pre-wrap break-all" style={{ color: 'var(--success)', opacity: 0.85 }}>{line}</span>
        </div>
      ))}
    </div>
  )
}

/** Tool Call — compact inline Windsurf-style */
function ToolCallCard({ toolCall }: { toolCall: NonNullable<MessagePart['toolCall']> }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [approvalState, setApprovalState] = useState<'pending' | 'approved' | 'rejected' | null>(
    toolCall.args?.__pendingApproval ? 'pending' : null
  )
  const config = getToolConfig(toolCall.name)
  // Filter out internal approval keys from args
  const cleanArgs = toolCall.args ? Object.fromEntries(
    Object.entries(toolCall.args).filter(([k]) => !k.startsWith('__'))
  ) : {}
  const hasArgs = Object.keys(cleanArgs).length > 0
  const pathArg = (cleanArgs.path || cleanArgs.file_path || cleanArgs.directory || cleanArgs.source) as string | undefined
  const cmdArg = cleanArgs.command as string | undefined
  const preview = pathArg ? truncatePath(pathArg, 40) : cmdArg ? (cmdArg.slice(0, 45) + (cmdArg.length > 45 ? '...' : '')) : ''

  const handleApproval = async (approved: boolean) => {
    const approvalId = toolCall.args?.__approvalId as string
    if (!approvalId) return
    setApprovalState(approved ? 'approved' : 'rejected')
    try {
      await window.artemis.agent.respondToolApproval(approvalId, approved)
    } catch (err) {
      console.error('[ToolCallCard] Failed to respond to approval:', err)
    }
  }

  // Detect str_replace for inline diff
  const isStrReplace = toolCall.name === 'str_replace' && typeof toolCall.args?.old_str === 'string' && typeof toolCall.args?.new_str === 'string'
  const isWriteFile = toolCall.name === 'write_file' && typeof toolCall.args?.content === 'string'

  return (
    <div className="my-0.5">
      <div
        className={`inline-flex items-center gap-1.5 py-0.5 px-1 rounded transition-colors ${hasArgs ? 'cursor-pointer hover:opacity-80' : ''}`}
        onClick={() => hasArgs && setIsExpanded(!isExpanded)}
      >
        <config.icon size={12} style={{ color: config.color, flexShrink: 0 }} />
        <span className="text-[11px] font-semibold" style={{ color: config.color }}>
          {config.label}
        </span>
        {preview && (
          <span className="text-[10px] font-mono truncate max-w-[280px]" style={{ color: 'var(--text-muted)' }}>
            {preview}
          </span>
        )}
        {hasArgs && (
          <span style={{ color: 'var(--text-muted)' }}>
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        )}
      </div>
      {/* Approval buttons */}
      {approvalState === 'pending' && (
        <div className="flex items-center gap-2 ml-4 mt-1 mb-1">
          <button
            onClick={() => handleApproval(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all duration-100"
            style={{ backgroundColor: 'rgba(74, 222, 128, 0.12)', color: '#4ade80', border: '1px solid rgba(74, 222, 128, 0.25)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(74, 222, 128, 0.12)' }}
          >
            <Check size={10} /> Approve
          </button>
          <button
            onClick={() => handleApproval(false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all duration-100"
            style={{ backgroundColor: 'rgba(248, 113, 113, 0.12)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.25)' }}
            onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(248, 113, 113, 0.25)' }}
            onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(248, 113, 113, 0.12)' }}
          >
            <X size={10} /> Reject
          </button>
          <span className="text-[10px] animate-pulse" style={{ color: 'var(--warning, #f59e0b)' }}>Waiting for approval...</span>
        </div>
      )}
      {approvalState === 'approved' && (
        <span className="ml-4 text-[10px] font-medium" style={{ color: '#4ade80' }}>✓ Approved</span>
      )}
      {approvalState === 'rejected' && (
        <span className="ml-4 text-[10px] font-medium" style={{ color: '#f87171' }}>✗ Rejected</span>
      )}
      {isExpanded && isStrReplace && (
        <InlineDiff oldStr={String(cleanArgs.old_str)} newStr={String(cleanArgs.new_str)} />
      )}
      {isExpanded && !isStrReplace && hasArgs && (
        <pre
          className="text-[10px] overflow-x-auto p-1.5 mt-0.5 ml-4 rounded font-mono max-h-[150px] overflow-y-auto"
          style={{
            backgroundColor: 'rgba(0,0,0,0.08)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {isWriteFile
            ? `// ${pathArg || 'file'}\n${String(cleanArgs.content).slice(0, 3000)}`
            : formatToolArgs(cleanArgs)}
        </pre>
      )}
    </div>
  )
}

/** Inline Terminal — renders execute_command as a mini terminal */
function InlineTerminalCard({ command, result }: { command: string; result?: NonNullable<MessagePart['toolResult']> }) {
  const [isExpanded, setIsExpanded] = useState(true)
  const exitCodeMatch = result?.output?.match(/^Exit code: (\d+)/)
  const exitCode = exitCodeMatch ? parseInt(exitCodeMatch[1]) : (result?.success ? 0 : null)
  const output = result?.output?.replace(/^Exit code: \d+\n?/, '') || ''

  return (
    <div
      className="my-1.5 rounded-lg overflow-hidden"
      style={{ border: '1px solid var(--border-subtle)', maxWidth: '100%' }}
    >
      {/* Terminal header bar */}
      <div
        className="flex items-center justify-between px-2.5 py-1.5 cursor-pointer"
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <TerminalIcon size={11} style={{ color: '#a78bfa', flexShrink: 0 }} />
          <span className="text-[10px] font-mono truncate" style={{ color: '#e2e8f0' }}>
            {command.length > 60 ? command.slice(0, 60) + '...' : command}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {result && exitCode !== null && (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: exitCode === 0 ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
                color: exitCode === 0 ? '#4ade80' : '#f87171',
              }}
            >
              Exit code: {exitCode}
            </span>
          )}
          {!result && (
            <span className="text-[9px] animate-pulse" style={{ color: '#a78bfa' }}>Running...</span>
          )}
          <span style={{ color: 'var(--text-muted)' }}>
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        </div>
      </div>
      {/* Terminal output */}
      {isExpanded && (
        <div
          className="px-2.5 py-2 font-mono text-[10px] leading-[16px] overflow-x-auto max-h-[200px] overflow-y-auto"
          style={{ backgroundColor: 'rgba(0,0,0,0.25)', color: '#cbd5e1' }}
        >
          <div style={{ color: '#a78bfa' }}>
            <span style={{ color: '#4ade80' }}>$</span> {command}
          </div>
          {output && (
            <pre className="mt-1 whitespace-pre-wrap break-all" style={{ color: '#94a3b8' }}>
              {output.slice(0, 5000)}
            </pre>
          )}
          {!result && (
            <div className="mt-1 flex items-center gap-1">
              <span className="inline-block w-1.5 h-3 animate-pulse" style={{ backgroundColor: '#a78bfa' }} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Tool Result — compact inline status */
function ToolResultCard({ toolResult }: { toolResult: NonNullable<MessagePart['toolResult']> }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const hasOutput = toolResult.output && toolResult.output.length > 0
  const firstLine = hasOutput ? toolResult.output.split('\n')[0]?.slice(0, 60) : ''

  // Don't render for execute_command — handled by InlineTerminalCard
  if (toolResult.name === 'execute_command') return null

  return (
    <div className="my-0.5 ml-3">
      <div
        className={`inline-flex items-center gap-1.5 py-0.5 px-1 rounded text-[10px] ${hasOutput ? 'cursor-pointer hover:opacity-80' : ''}`}
        onClick={() => hasOutput && setIsExpanded(!isExpanded)}
      >
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: toolResult.success ? '#4ade80' : '#f87171' }}
        />
        <span className="font-medium" style={{ color: toolResult.success ? '#4ade80' : '#f87171' }}>
          {toolResult.success ? 'Done' : 'Failed'}
        </span>
        {firstLine && !isExpanded && (
          <span className="truncate max-w-[280px]" style={{ color: 'var(--text-muted)' }}>
            — {firstLine}
          </span>
        )}
        {hasOutput && (
          <span style={{ color: 'var(--text-muted)' }}>
            {isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </span>
        )}
      </div>
      {isExpanded && hasOutput && (
        <pre
          className="text-[10px] overflow-x-auto p-1.5 mt-0.5 ml-3 rounded font-mono max-h-[150px] overflow-y-auto"
          style={{
            backgroundColor: 'rgba(0,0,0,0.08)',
            color: 'var(--text-secondary)',
            border: `1px solid ${toolResult.success ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)'}`,
          }}
        >
          {toolResult.output}
        </pre>
      )}
    </div>
  )
}

/** Error Display Component */
function ErrorDisplay({ text }: { text: string }) {
  let errorMessage = text
  let errorDetails = ''
  let errorType = 'Error'

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      errorMessage = parsed.error?.message || parsed.message || text
      errorType = parsed.error?.type || parsed.error?.code || 'Error'
      if (parsed.error?.code) errorDetails = parsed.error.code
    }
  } catch {
    // Show raw text if parsing fails
  }

  // Truncate very long error messages
  const isLongError = errorMessage.length > 300
  const displayMessage = isLongError ? errorMessage.slice(0, 300) + '...' : errorMessage

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className="rounded-xl p-4 my-2"
      style={{
        backgroundColor: 'rgba(192, 57, 43, 0.06)',
        border: '1px solid rgba(192, 57, 43, 0.12)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: 'rgba(192, 57, 43, 0.1)' }}
        >
          <AlertTriangle size={14} style={{ color: 'var(--error)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-semibold mb-1" style={{ color: 'var(--error)' }}>
            {errorType}
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {displayMessage}
          </p>
          {errorDetails && (
            <span
              className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-md font-mono"
              style={{ backgroundColor: 'rgba(192, 57, 43, 0.08)', color: 'var(--text-muted)' }}
            >
              {errorDetails}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function ChatMessage({ message }: Props) {
  const isUser = message.role === 'user'

  // Detect error messages
  const hasError = !isUser && message.parts.some(p =>
    p.type === 'text' && p.text && (
      p.text.startsWith('**Error:') ||
      p.text.includes('"error"') ||
      p.text.includes('Unsupported parameter') ||
      p.text.includes('invalid_request_error')
    )
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex gap-3 px-5 py-4"
      style={{
        backgroundColor: isUser ? 'transparent' : 'rgba(var(--accent-rgb), 0.02)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Avatar */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{
          backgroundColor: isUser
            ? 'var(--bg-elevated)'
            : hasError
              ? 'rgba(192, 57, 43, 0.1)'
              : 'var(--accent-glow)',
          border: `1px solid ${isUser
            ? 'var(--border-default)'
            : hasError
              ? 'rgba(192, 57, 43, 0.2)'
              : 'rgba(var(--accent-rgb), 0.15)'}`,
        }}
      >
        {isUser ? (
          <User size={13} style={{ color: 'var(--text-secondary)' }} />
        ) : hasError ? (
          <AlertTriangle size={13} style={{ color: 'var(--error)' }} />
        ) : (
          <Bot size={13} style={{ color: 'var(--accent)' }} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Role label */}
        <div className="flex items-center gap-2.5 mb-1.5">
          <span
            className="text-[11px] font-semibold uppercase tracking-wide"
            style={{ color: isUser ? 'var(--text-secondary)' : hasError ? 'var(--error)' : 'var(--accent)' }}
          >
            {isUser ? 'You' : 'Assistant'}
          </span>
          {message.model && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-md font-medium"
              style={{ 
                backgroundColor: 'var(--bg-elevated)', 
                color: 'var(--text-muted)', 
                border: '1px solid var(--border-subtle)' 
              }}
            >
              {message.model}
            </span>
          )}
        </div>

        {/* Parts */}
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            // Handle empty responses
            if (!part.text || part.text.trim() === '') {
              return (
                <div 
                  key={i} 
                  className="text-[13px] italic" 
                  style={{ color: 'var(--text-muted)' }}
                >
                  No response content received from the model.
                </div>
              )
            }
            
            // Detect raw JSON error responses
            const isRawError = part.text.includes('"error"') && part.text.includes('"message"')

            if (isRawError || (part.text.startsWith('**Error:') && !isUser)) {
              return <ErrorDisplay key={i} text={part.text} />
            }

            return (
              <div 
                key={i} 
                className="markdown-content text-[13px] leading-relaxed" 
                style={{ color: 'var(--text-primary)' }}
              >
                <HighlightedMarkdown text={part.text} />
              </div>
            )
          }

          if (part.type === 'tool-call' && part.toolCall) {
            // Render execute_command as inline terminal
            if (part.toolCall.name === 'execute_command') {
              const cmdArg = (part.toolCall.args?.command || part.toolCall.args?.__command) as string || ''
              // Find matching tool-result by looking ahead
              const matchingResult = message.parts.find(
                (p, j) => j > i && p.type === 'tool-result' && p.toolResult?.name === 'execute_command'
              )
              return <InlineTerminalCard key={i} command={cmdArg} result={matchingResult?.toolResult || undefined} />
            }
            return <ToolCallCard key={i} toolCall={part.toolCall} />
          }

          if (part.type === 'tool-result' && part.toolResult) {
            return <ToolResultCard key={i} toolResult={part.toolResult} />
          }

          if (part.type === 'thinking' && part.thinking) {
            // Find associated reasoning part
            const reasoningPart = message.parts.find(p => p.type === 'reasoning' && p.reasoning)
            return (
              <ThinkingBlock
                key={i}
                steps={part.thinking.steps}
                duration={part.thinking.duration}
                isComplete={part.thinking.isComplete}
                reasoningContent={reasoningPart?.reasoning?.content}
              />
            )
          }

          return null
        })}
      </div>
    </motion.div>
  )
}
