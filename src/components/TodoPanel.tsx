import { useState } from 'react'
import { CheckCircle2, Circle, Loader2, ListTodo, ChevronDown, ChevronRight, Play } from 'lucide-react'
import type { TodoPlan } from '../lib/todoParser'
import type { AgentMode } from '../types'

interface Props {
  plan: TodoPlan | null
  agentMode: AgentMode
  isStreaming: boolean
  onImplementPlan?: (planText: string) => void
}

export default function TodoPanel({ plan, agentMode, isStreaming, onImplementPlan }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [implemented, setImplemented] = useState(false)

  if (!plan || plan.items.length === 0) return null

  const doneCount = plan.items.filter(i => i.status === 'done').length
  const totalCount = plan.items.length
  const progress = Math.round((doneCount / totalCount) * 100)

  const canImplement = agentMode === 'planner' && !implemented && !isStreaming && onImplementPlan
  const showImplement = canImplement || (implemented && agentMode === 'planner')

  const handleImplement = () => {
    if (!onImplementPlan || implemented) return
    setImplemented(true)
    const planText = plan.items.map((item, i) => `${i + 1}. ${item.text}`).join('\n')
    onImplementPlan(planText)
  }

  return (
    <div
      className="shrink-0"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          {expanded ? <ChevronDown size={11} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />}
          <ListTodo size={12} style={{ color: 'var(--accent)' }} />
          <span className="text-[11px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
            {plan.title}
          </span>
        </button>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {doneCount}/{totalCount}
          </span>
          <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                backgroundColor: progress === 100 ? 'var(--success)' : 'var(--accent)',
              }}
            />
          </div>
          {/* Implement button — only in planner mode */}
          {showImplement && (
            <button
              onClick={handleImplement}
              disabled={implemented || isStreaming}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all duration-150 ml-1"
              style={{
                backgroundColor: implemented ? 'var(--bg-elevated)' : 'rgba(74, 222, 128, 0.12)',
                color: implemented ? 'var(--text-muted)' : '#4ade80',
                border: `1px solid ${implemented ? 'var(--border-subtle)' : 'rgba(74, 222, 128, 0.25)'}`,
                cursor: implemented ? 'default' : 'pointer',
                opacity: implemented ? 0.5 : 1,
              }}
              title={implemented ? 'Plan sent to builder' : 'Switch to builder and execute this plan'}
            >
              <Play size={9} />
              {implemented ? 'Sent' : 'Implement'}
            </button>
          )}
        </div>
      </div>

      {/* Items */}
      {expanded && (
        <div className="px-3 py-1.5 space-y-0.5" style={{ backgroundColor: 'var(--bg-primary)' }}>
          {plan.items.map(item => (
            <div
              key={item.id}
              className="flex items-start gap-2 py-1 px-1 rounded"
              style={{ opacity: item.status === 'done' ? 0.5 : 1 }}
            >
              {item.status === 'done' ? (
                <CheckCircle2 size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
              ) : item.status === 'in_progress' ? (
                <Loader2 size={13} className="shrink-0 mt-0.5 animate-spin" style={{ color: 'var(--accent)' }} />
              ) : (
                <Circle size={13} className="shrink-0 mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
              )}
              <span
                className="text-[11px] leading-snug"
                style={{
                  color: item.status === 'done' ? 'var(--text-muted)' : 'var(--text-secondary)',
                  textDecoration: item.status === 'done' ? 'line-through' : 'none',
                }}
              >
                {item.text}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
