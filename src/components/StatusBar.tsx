import { Circle, Sparkles, Cpu, Zap } from 'lucide-react'
import type { Model, SessionTokenUsage } from '../types'

interface Props {
  projectName: string | null
  isReady: boolean
  hasApiKey: boolean
  activeModel: Model | null
  sessionTokenUsage: SessionTokenUsage
  totalTokenUsage: SessionTokenUsage
  streamingSpeed?: number
  projectTokenCount?: number
}

function formatTokenCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`
  return count.toString()
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '$0.00'
  return `$${cost.toFixed(4)}`
}

export default function StatusBar({
  projectName, isReady, hasApiKey, activeModel,
  sessionTokenUsage, totalTokenUsage, streamingSpeed = 0, projectTokenCount = 0,
}: Props) {
  const getStatus = () => {
    if (!hasApiKey) return { text: 'No API Key', color: 'var(--text-muted)', dotColor: 'var(--text-muted)' }
    if (!isReady) return { text: 'Connecting...', color: 'var(--warning)', dotColor: 'var(--warning)' }
    return { text: 'Connected to Zen', color: 'var(--text-muted)', dotColor: 'var(--success)' }
  }
  const status = getStatus()

  const contextWindow = activeModel?.contextWindow || 128000
  const contextPercent = Math.min(100, (sessionTokenUsage.totalTokens / contextWindow) * 100)

  return (
    <div
      className="flex items-center justify-between h-[24px] px-4 shrink-0 no-select text-[10px]"
      style={{
        backgroundColor: 'var(--statusbar-bg)',
        borderTop: '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
      }}
    >
      {/* Left: project name + connection */}
      <div className="flex items-center gap-3">
        {projectName && (
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {projectName}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <Circle size={6} fill={status.dotColor} stroke="none" />
          <span style={{ color: status.color }}>{status.text}</span>
        </div>
      </div>

      {/* Center: token usage + cost */}
      <div className="flex items-center gap-4">
        {/* Streaming speed */}
        {streamingSpeed > 0 && (
          <div className="flex items-center gap-1.5" title="Streaming speed (tokens per second)">
            <Zap size={9} style={{ color: 'var(--accent)' }} />
            <span className="text-[10px] font-mono">{streamingSpeed} t/s</span>
          </div>
        )}

        {/* Project token count */}
        {projectTokenCount > 0 && (
          <div className="flex items-center gap-1.5" title="Total tokens in project (excludes node_modules, dist, build, .git, .cache)">
            <Cpu size={9} style={{ color: 'var(--text-muted)' }} />
            <span className="text-[10px]">{formatTokenCount(projectTokenCount)} tokens</span>
          </div>
        )}

        {/* Session tokens */}
        <div className="flex items-center gap-1.5">
          <Cpu size={9} style={{ color: 'var(--text-muted)' }} />
          <span>{formatTokenCount(sessionTokenUsage.totalTokens)} tokens</span>
        </div>

        {/* Cost */}
        {activeModel?.pricing && sessionTokenUsage.estimatedCost > 0 && (
          <span style={{ color: 'var(--accent)' }}>
            {formatCost(sessionTokenUsage.estimatedCost)}
          </span>
        )}

        {/* Free model badge */}
        {activeModel?.free && (
          <div className="flex items-center gap-1">
            <Zap size={8} style={{ color: 'var(--success)' }} />
            <span style={{ color: 'var(--success)' }}>Free</span>
          </div>
        )}

        {/* Context window usage bar */}
        {sessionTokenUsage.totalTokens > 0 && (
          <div className="flex items-center gap-1.5">
            <span>ctx</span>
            <div
              className="w-16 h-[4px] rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--bg-elevated)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${contextPercent}%`,
                  backgroundColor: contextPercent > 80 ? 'var(--error)' : contextPercent > 50 ? 'var(--warning)' : 'var(--accent)',
                }}
              />
            </div>
            <span>{contextPercent.toFixed(0)}%</span>
          </div>
        )}
      </div>

      {/* Right: model */}
      <div className="flex items-center gap-1.5">
        {activeModel && (
          <>
            <Sparkles size={9} style={{ color: 'var(--accent)', opacity: 0.6 }} />
            <span>{activeModel.name}</span>
          </>
        )}
      </div>
    </div>
  )
}
