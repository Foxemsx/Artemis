import { Circle } from 'lucide-react'
import type { Model } from '../types'

interface Props {
  projectName: string | null
  isReady: boolean
  hasApiKey: boolean
  activeModel: Model | null
}

export default function StatusBar({ projectName, isReady, hasApiKey, activeModel }: Props) {
  // Determine status text and color
  const getStatus = () => {
    if (!hasApiKey) return { text: 'No API Key', color: 'var(--text-muted)' }
    if (!isReady) return { text: 'Connecting...', color: 'var(--warning)' }
    return { text: 'Connected to Zen', color: 'var(--success)' }
  }
  const status = getStatus()

  return (
    <div
      className="flex items-center justify-between h-[22px] px-3 shrink-0 no-select text-[10px]"
      style={{
        backgroundColor: 'var(--statusbar-bg)',
        borderTop: '1px solid var(--border-subtle)',
        color: 'var(--text-muted)',
      }}
    >
      {/* Left: project name */}
      <div className="flex items-center gap-2">
        {projectName && (
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            {projectName}
          </span>
        )}
      </div>

      {/* Center: connection status */}
      <div className="flex items-center gap-1.5">
        <Circle
          size={6}
          fill={status.color}
          stroke="none"
        />
        <span>
          {status.text}
        </span>
      </div>

      {/* Right: model */}
      <div className="flex items-center gap-2">
        {activeModel && (
          <span>{activeModel.name}</span>
        )}
      </div>
    </div>
  )
}
