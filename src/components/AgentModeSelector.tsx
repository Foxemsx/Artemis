import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Hammer, Lightbulb, Check, Info } from 'lucide-react'

export type AgentMode = 'builder' | 'planner'

interface AgentModeConfig {
  id: AgentMode
  name: string
  icon: typeof Hammer
  description: string
  shortDescription: string
  color: string
  systemPromptAddition: string
}

export const AGENT_MODES: Record<AgentMode, AgentModeConfig> = {
  builder: {
    id: 'builder',
    name: 'Builder',
    icon: Hammer,
    description: 'Full implementation mode. Can edit files, run commands, and make changes to your codebase. Best for implementing features and fixing bugs.',
    shortDescription: 'Can edit files & run commands',
    color: 'var(--accent)',
    systemPromptAddition: `You are in BUILDER mode. You have full permissions to:
- Edit and create files
- Run terminal commands
- Make changes to the codebase
- Implement features and fix bugs
- Write tests and documentation

Focus on implementation and delivering working code. Be proactive about making changes when asked.`,
  },
  planner: {
    id: 'planner',
    name: 'Planner',
    icon: Lightbulb,
    description: 'Discussion and planning mode. Cannot edit files or run commands. Best for discussing architecture, planning features, and code review.',
    shortDescription: 'Read-only discussion mode',
    color: '#8b5cf6', // Purple
    systemPromptAddition: `You are in PLANNER mode. You are restricted to READ-ONLY operations:
- You CANNOT edit or create files
- You CANNOT run terminal commands that modify the system
- You CAN read files and explore the codebase
- You CAN discuss architecture and planning
- You CAN review code and suggest improvements
- You CAN explain code and answer questions

Focus on discussion, planning, and providing guidance. When the user wants to implement changes, suggest they switch to Builder mode.`,
  },
}

interface Props {
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
}

export default function AgentModeSelector({ mode, onModeChange }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [showTooltip, setShowTooltip] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const currentMode = AGENT_MODES[mode]
  const Icon = currentMode.icon

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  const handleSelectMode = (newMode: AgentMode) => {
    onModeChange(newMode)
    setIsOpen(false)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] transition-all duration-100"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-default)'
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          setShowTooltip(true)
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)'
          e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
          setShowTooltip(false)
        }}
      >
        <Icon size={11} style={{ color: currentMode.color }} />
        <span>{currentMode.name}</span>
        <ChevronDown 
          size={12} 
          className="transition-transform duration-150"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>

      {/* Tooltip */}
      {showTooltip && !isOpen && (
        <div
          className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded text-[10px] whitespace-nowrap z-50"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            color: 'var(--text-muted)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          {currentMode.shortDescription}
        </div>
      )}

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1 w-64 rounded-lg overflow-hidden z-50"
          style={{
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: 'var(--shadow-elevated)',
          }}
        >
          {/* Header */}
          <div
            className="px-3 py-2 flex items-center gap-2"
            style={{ 
              backgroundColor: 'var(--bg-elevated)',
              borderBottom: '1px solid var(--border-subtle)'
            }}
          >
            <Info size={12} style={{ color: 'var(--text-muted)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              Select agent behavior mode
            </span>
          </div>

          {/* Mode Options */}
          <div className="py-1">
            {Object.values(AGENT_MODES).map((modeConfig) => {
              const ModeIcon = modeConfig.icon
              const isActive = mode === modeConfig.id
              
              return (
                <button
                  key={modeConfig.id}
                  onClick={() => handleSelectMode(modeConfig.id)}
                  className="w-full text-left px-3 py-2.5 transition-colors duration-75"
                  style={{
                    backgroundColor: isActive ? 'var(--accent-glow)' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <div
                        className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                        style={{ 
                          backgroundColor: isActive ? modeConfig.color : 'var(--bg-elevated)',
                          border: `1px solid ${isActive ? 'transparent' : 'var(--border-subtle)'}`,
                        }}
                      >
                        <ModeIcon 
                          size={12} 
                          style={{ color: isActive ? '#000' : modeConfig.color }}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span 
                          className="text-[11px] font-medium"
                          style={{ color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}
                        >
                          {modeConfig.name}
                        </span>
                        <span 
                          className="text-[10px] leading-snug"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {modeConfig.shortDescription}
                        </span>
                      </div>
                    </div>
                    {isActive && (
                      <Check size={12} style={{ color: 'var(--accent)' }} className="shrink-0 mt-1" />
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer with current mode description */}
          <div
            className="px-3 py-2"
            style={{ 
              backgroundColor: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border-subtle)'
            }}
          >
            <p className="text-[9px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {currentMode.description}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
