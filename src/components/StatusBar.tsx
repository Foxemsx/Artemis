import { useState } from 'react'
import { Circle, Sparkles, Cpu, Zap, Activity } from 'lucide-react'
import type { Model, SessionTokenUsage } from '../types'
import { formatTokenCount, formatCost } from '../lib/formatters'

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

// ─── Token Budget Visualization ──────────────────────────────────────────────
function TokenBudgetBar({ usedTokens, contextWindow, percent }: { usedTokens: number; contextWindow: number; percent: number }) {
  const [hovered, setHovered] = useState(false)

  if (usedTokens <= 0) return null

  // Color gradient based on usage: green → yellow → orange → red
  const getBarColor = (p: number) => {
    if (p > 90) return '#ef4444' // red
    if (p > 75) return '#f97316' // orange
    if (p > 50) return '#eab308' // yellow
    if (p > 25) return '#22c55e' // green
    return 'var(--accent)' // accent (low usage)
  }

  const getGlowColor = (p: number) => {
    if (p > 90) return 'rgba(239, 68, 68, 0.4)'
    if (p > 75) return 'rgba(249, 115, 22, 0.3)'
    if (p > 50) return 'rgba(234, 179, 8, 0.25)'
    return 'rgba(34, 197, 94, 0.2)'
  }

  const barColor = getBarColor(percent)
  const glowColor = getGlowColor(percent)
  const remaining = contextWindow - usedTokens
  const label = percent > 90 ? 'NEAR LIMIT' : percent > 75 ? 'HIGH' : ''

  return (
    <div
      className="relative flex items-center gap-1.5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Activity size={9} style={{ color: barColor, opacity: 0.8 }} />
      <div
        className="w-24 h-[6px] rounded-full overflow-hidden relative"
        style={{ backgroundColor: 'var(--bg-elevated)', boxShadow: `inset 0 1px 2px rgba(0,0,0,0.2)` }}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${percent}%`,
            backgroundColor: barColor,
            boxShadow: `0 0 6px ${glowColor}`,
          }}
        />
        {/* Animated pulse when near limit */}
        {percent > 85 && (
          <div
            className="absolute inset-0 rounded-full animate-pulse"
            style={{ backgroundColor: barColor, opacity: 0.15 }}
          />
        )}
      </div>
      <span className="text-[10px] font-mono font-semibold" style={{ color: barColor }}>
        {percent.toFixed(0)}%
      </span>
      {label && (
        <span
          className="text-[8px] font-bold uppercase tracking-wide px-1 py-px rounded"
          style={{ backgroundColor: `${barColor}20`, color: barColor }}
        >
          {label}
        </span>
      )}

      {/* Hover tooltip */}
      {hovered && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg z-50 whitespace-nowrap"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}
        >
          <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Context Window Usage
          </div>
          <div className="space-y-0.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <div className="flex justify-between gap-4">
              <span>Used:</span>
              <span className="font-mono" style={{ color: barColor }}>{formatTokenCount(usedTokens)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Remaining:</span>
              <span className="font-mono">{formatTokenCount(Math.max(0, remaining))}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Limit:</span>
              <span className="font-mono">{formatTokenCount(contextWindow)}</span>
            </div>
          </div>
          {/* Mini visual bar in tooltip */}
          <div className="mt-1.5 w-full h-[4px] rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: barColor }} />
          </div>
        </div>
      )}
    </div>
  )
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

        {/* Context window usage bar — enhanced token budget visualization */}
        <TokenBudgetBar
          usedTokens={sessionTokenUsage.totalTokens}
          contextWindow={contextWindow}
          percent={contextPercent}
        />
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
