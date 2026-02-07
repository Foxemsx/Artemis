import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChevronDown, 
  ChevronRight, 
  Brain, 
  Wrench, 
  CheckCircle2, 
  XCircle, 
  FileText, 
  Clock,
  Loader2,
  Terminal,
  Eye,
  PenLine,
  FolderOpen,
  Search,
  Sparkles,
} from 'lucide-react'
import type { AgentStep } from '../types'
import { getToolConfig, formatToolArgs, truncatePath } from '../lib/toolIcons'

interface ThinkingBlockProps {
  steps: AgentStep[]
  duration: number
  isComplete: boolean
  isExpanded?: boolean
  reasoningContent?: string
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(0)
  return `${minutes}m ${seconds}s`
}

// Map tool names to compact labels and icons
function getToolDisplay(name: string) {
  const map: Record<string, { icon: typeof FileText; label: string; color: string }> = {
    read_file: { icon: Eye, label: 'Read', color: '#60a5fa' },
    write_file: { icon: PenLine, label: 'Write', color: '#34d399' },
    edit_file: { icon: PenLine, label: 'Edit', color: '#fbbf24' },
    list_directory: { icon: FolderOpen, label: 'List', color: '#a78bfa' },
    create_directory: { icon: FolderOpen, label: 'Create Dir', color: '#a78bfa' },
    search_files: { icon: Search, label: 'Search', color: '#f472b6' },
    grep_search: { icon: Search, label: 'Grep', color: '#f472b6' },
    find_files: { icon: Search, label: 'Find', color: '#f472b6' },
    run_command: { icon: Terminal, label: 'Run', color: '#fb923c' },
    delete_file: { icon: XCircle, label: 'Delete', color: '#f87171' },
    rename_file: { icon: PenLine, label: 'Rename', color: '#fb923c' },
    file_info: { icon: FileText, label: 'Info', color: '#60a5fa' },
    todo_list: { icon: CheckCircle2, label: 'Todo', color: '#34d399' },
  }
  return map[name] || { icon: Wrench, label: name, color: '#fbbf24' }
}

/** Single timeline step — compact row with dot connector */
function TimelineStep({ step, index, isLast }: { step: AgentStep; index: number; isLast: boolean }) {
  const [showDetails, setShowDetails] = useState(false)
  
  const isToolCall = step.type === 'tool-call'
  const isToolResult = step.type === 'tool-result'
  const isThinking = step.type === 'thinking'
  const isSummary = step.type === 'summary'
  
  // Determine dot color
  const dotColor = isToolCall ? '#fbbf24'
    : isToolResult ? (step.toolResult?.success ? '#4ade80' : '#f87171')
    : isThinking ? '#60a5fa'
    : isSummary ? '#a78bfa'
    : 'var(--text-muted)'
  
  // Determine if this step has expandable content
  const hasDetails = step.toolCall?.args || step.toolResult?.output
  
  // Get tool display info
  const toolInfo = isToolCall && step.toolCall ? getToolDisplay(step.toolCall.name) : null
  const pathArg = step.toolCall?.args?.path as string | undefined
  
  return (
    <div className="relative flex gap-0 min-h-0">
      {/* Timeline connector line + dot */}
      <div className="flex flex-col items-center shrink-0" style={{ width: '20px' }}>
        {/* Dot */}
        <div
          className="w-2 h-2 rounded-full shrink-0 mt-[6px] z-10"
          style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}40` }}
        />
        {/* Connector line */}
        {!isLast && (
          <div className="flex-1 w-px" style={{ backgroundColor: 'var(--border-subtle)' }} />
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0 pb-2.5 pl-1">
        {/* Main row */}
        <div
          className={`flex items-center gap-1.5 ${hasDetails ? 'cursor-pointer' : ''}`}
          onClick={() => hasDetails && setShowDetails(!showDetails)}
        >
          {/* Tool call: show icon + tool name + path */}
          {isToolCall && toolInfo && (
            <>
              <toolInfo.icon size={11} style={{ color: toolInfo.color, flexShrink: 0 }} />
              <span className="text-[11px] font-medium" style={{ color: toolInfo.color }}>
                {toolInfo.label}
              </span>
              {pathArg && (
                <span className="text-[10px] font-mono truncate" style={{ color: 'var(--text-muted)' }}>
                  {truncatePath(pathArg, 35)}
                </span>
              )}
            </>
          )}
          
          {/* Tool result: show status inline */}
          {isToolResult && (
            <>
              {step.toolResult?.success ? (
                <CheckCircle2 size={11} style={{ color: '#4ade80', flexShrink: 0 }} />
              ) : (
                <XCircle size={11} style={{ color: '#f87171', flexShrink: 0 }} />
              )}
              <span className="text-[10px]" style={{ color: step.toolResult?.success ? '#4ade80' : '#f87171' }}>
                {step.toolResult?.success ? 'Done' : 'Failed'}
              </span>
              {step.toolResult?.output && (
                <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                  — {step.toolResult.output.split('\n')[0]?.slice(0, 60)}
                </span>
              )}
            </>
          )}
          
          {/* Thinking step */}
          {isThinking && (
            <>
              <Brain size={11} style={{ color: '#60a5fa', flexShrink: 0 }} />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {step.content?.slice(0, 60) || 'Analyzing...'}
              </span>
            </>
          )}
          
          {/* Summary */}
          {isSummary && (
            <>
              <Sparkles size={11} style={{ color: '#a78bfa', flexShrink: 0 }} />
              <span className="text-[10px] truncate" style={{ color: 'var(--text-muted)' }}>
                {step.content?.slice(0, 80) || 'Complete'}
              </span>
            </>
          )}
          
          {/* Duration badge */}
          {step.duration !== undefined && step.duration > 100 && (
            <span className="text-[9px] ml-auto shrink-0 tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {formatDuration(step.duration)}
            </span>
          )}
          
          {/* Expand arrow */}
          {hasDetails && (
            <div style={{ color: 'var(--text-muted)' }} className="shrink-0">
              {showDetails ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </div>
          )}
        </div>
        
        {/* Expandable details */}
        <AnimatePresence>
          {showDetails && hasDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="mt-1.5">
                {step.toolCall?.args && (
                  <pre
                    className="text-[10px] p-2 rounded font-mono overflow-x-auto"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.15)',
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {formatToolArgs(step.toolCall.args)}
                  </pre>
                )}
                {step.toolResult?.output && (
                  <pre
                    className="text-[10px] p-2 rounded font-mono overflow-x-auto max-h-[120px] overflow-y-auto"
                    style={{
                      backgroundColor: 'rgba(0,0,0,0.15)',
                      color: 'var(--text-secondary)',
                      border: `1px solid ${step.toolResult.success ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)'}`,
                    }}
                  >
                    {step.toolResult.output}
                  </pre>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

export default function ThinkingBlock({ 
  steps, 
  duration, 
  isComplete,
  isExpanded: initialExpanded = false,
  reasoningContent
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const [liveDuration, setLiveDuration] = useState(duration)
  
  useEffect(() => {
    if (isComplete) {
      setLiveDuration(duration)
      return
    }
    const interval = setInterval(() => {
      setLiveDuration(prev => prev + 1000)
    }, 1000)
    return () => clearInterval(interval)
  }, [isComplete, duration])
  
  const toolCallsCount = steps.filter(s => s.type === 'tool-call').length
  
  // Compact header label
  const headerLabel = isComplete
    ? (toolCallsCount > 0 ? `Ran ${toolCallsCount} tool${toolCallsCount !== 1 ? 's' : ''}` : 'Thinking complete')
    : (toolCallsCount > 0 ? `Running tools...` : 'Thinking...')
  
  return (
    <div className="my-2.5">
      {/* Header — clean single-line toggle */}
      <div
        className="flex items-center gap-2 py-1.5 px-1 cursor-pointer select-none rounded-md transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'var(--bg-hover)' }}
        onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent' }}
      >
        {/* Status indicator */}
        {isComplete ? (
          <CheckCircle2 size={13} style={{ color: '#4ade80', flexShrink: 0 }} />
        ) : (
          <Loader2 size={13} className="animate-spin" style={{ color: '#60a5fa', flexShrink: 0 }} />
        )}
        
        <span className="text-[11px] font-medium" style={{ color: isComplete ? 'var(--text-secondary)' : '#60a5fa' }}>
          {headerLabel}
        </span>
        
        {/* Duration */}
        <div className="flex items-center gap-1 ml-auto">
          <Clock size={9} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[10px] tabular-nums" style={{ color: 'var(--text-muted)' }}>
            {formatDuration(liveDuration)}
          </span>
        </div>
        
        <div style={{ color: 'var(--text-muted)' }}>
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </div>
      </div>
      
      {/* Expanded: timeline of steps */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="ml-1.5 mt-1 mb-1 pl-1">
              {/* Reasoning content */}
              {reasoningContent && reasoningContent.trim() && (
                <div className="mb-2 ml-5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Brain size={10} style={{ color: '#60a5fa' }} />
                    <span className="text-[10px] font-medium" style={{ color: '#60a5fa' }}>Reasoning</span>
                  </div>
                  <pre className="text-[10px] whitespace-pre-wrap font-mono leading-relaxed p-2 rounded max-h-[150px] overflow-y-auto" style={{ 
                    color: 'var(--text-muted)',
                    backgroundColor: 'rgba(96, 165, 250, 0.05)',
                    border: '1px solid rgba(96, 165, 250, 0.1)',
                  }}>
                    {reasoningContent}
                  </pre>
                </div>
              )}
              
              {/* Steps timeline */}
              {steps.map((step, index) => (
                <TimelineStep
                  key={step.id}
                  step={step}
                  index={index}
                  isLast={index === steps.length - 1}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
