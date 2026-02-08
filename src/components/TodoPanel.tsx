import { useState } from 'react'
import { ListTodo, ChevronDown, ChevronRight, Play, Edit3 } from 'lucide-react'
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
  const [isEditing, setIsEditing] = useState(false)
  const [editedPlan, setEditedPlan] = useState('')
  const [trackedMessageId, setTrackedMessageId] = useState('')

  if (!plan || plan.items.length === 0) return null

  // Only show in planner mode — builder doesn't use the todo panel
  if (agentMode !== 'planner') return null

  const canImplement = !implemented && !isStreaming && onImplementPlan
  const showImplement = canImplement || implemented

  const currentPlanText = plan.items.map((item, i) => `${i + 1}. ${item.text}`).join('\n')

  // Keep editedPlan in sync with plan changes (unless user is manually editing)
  if (!isEditing && (trackedMessageId !== plan.messageId || editedPlan === '')) {
    setTrackedMessageId(plan.messageId)
    setEditedPlan(currentPlanText)
  }

  const handleEdit = () => {
    setIsEditing(true)
    setEditedPlan(currentPlanText)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditedPlan(currentPlanText)
  }

  const handleImplement = () => {
    if (!onImplementPlan || implemented) return
    setImplemented(true)
    setIsEditing(false)
    // If user was editing, send edited text; otherwise use fresh plan items
    onImplementPlan(isEditing ? editedPlan : currentPlanText)
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
          <span
            className="text-[10px] font-medium px-2 py-0.5 rounded-md"
            style={{
              backgroundColor: 'rgba(167, 139, 250, 0.12)',
              color: '#a78bfa',
              border: '1px solid rgba(167, 139, 250, 0.25)',
            }}
          >
            ✅ Plan Created
          </span>
          
          {/* Implement button */}
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

      {/* Editable Plan */}
      {expanded && (
        <div className="px-3 py-2" style={{ backgroundColor: 'var(--bg-primary)' }}>
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editedPlan}
                onChange={(e) => setEditedPlan(e.target.value)}
                className="w-full min-h-[200px] p-2 rounded-lg text-[11px] leading-relaxed resize-y"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
                placeholder="Edit the plan before implementing..."
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleImplement}
                  disabled={!editedPlan.trim()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-150"
                  style={{
                    backgroundColor: editedPlan.trim() ? 'rgba(74, 222, 128, 0.12)' : 'var(--bg-elevated)',
                    color: editedPlan.trim() ? '#4ade80' : 'var(--text-muted)',
                    border: `1px solid ${editedPlan.trim() ? 'rgba(74, 222, 128, 0.25)' : 'var(--border-subtle)'}`,
                    cursor: editedPlan.trim() ? 'pointer' : 'default',
                    opacity: editedPlan.trim() ? 1 : 0.5,
                  }}
                >
                  <Play size={9} />
                  Implement
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-150"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <span className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>
                  Edit the plan above before implementing
                </span>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>
                  Plan steps ({plan.items.length} items)
                </span>
                <button
                  onClick={handleEdit}
                  disabled={implemented}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium transition-all duration-150"
                  style={{
                    backgroundColor: implemented ? 'var(--bg-elevated)' : 'rgba(96, 165, 250, 0.12)',
                    color: implemented ? 'var(--text-muted)' : '#60a5fa',
                    border: `1px solid ${implemented ? 'var(--border-subtle)' : 'rgba(96, 165, 250, 0.25)'}`,
                    cursor: implemented ? 'default' : 'pointer',
                    opacity: implemented ? 0.5 : 1,
                  }}
                >
                  <Edit3 size={9} />
                  Edit
                </button>
              </div>
              <div className="max-h-[300px] overflow-y-auto rounded-lg p-2 text-[11px] leading-relaxed" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                {plan.items.map((item, i) => (
                  <div key={item.id} className="py-1 px-1" style={{ color: 'var(--text-secondary)' }}>
                    <span className="font-mono" style={{ color: 'var(--text-muted)' }}>{i + 1}.</span> {item.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
