import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Hammer, Lightbulb, MessageCircle, Check } from 'lucide-react'

export type AgentMode = 'builder' | 'planner' | 'chat'

interface AgentModeConfig {
  id: AgentMode
  name: string
  icon: typeof Hammer
  description: string
  shortDescription: string
  color: string
  bgColor: string
  systemPromptAddition: string
}

export const AGENT_MODES: Record<AgentMode, AgentModeConfig> = {
  builder: {
    id: 'builder',
    name: 'Builder',
    icon: Hammer,
    description: 'Full implementation mode. Can edit files, run commands, and make changes to your codebase.',
    shortDescription: 'Edit files & run commands',
    color: 'var(--accent)',
    bgColor: 'rgba(212, 168, 83, 0.10)',
    systemPromptAddition: `You are an AI coding assistant focused on IMPLEMENTATION. You can read, write, and edit files, run commands, and search code.

## When Receiving a Plan to Implement

If the user sends you a plan (often prefixed with "📋 Implement this plan:"):
1. Read and understand the full plan before starting
2. Implement the plan step-by-step, following the order given
3. Do NOT skip steps or jump ahead
4. Work through the entire plan without stopping until every step is complete
5. When finished, announce "✅ Plan complete" with a brief summary of what was done

## General Guidelines
- Be concise and helpful
- When the user asks you to do something, do it directly using your tools
- Do not describe what tools you have — just use them`,
  },
  planner: {
    id: 'planner',
    name: 'Planner',
    icon: Lightbulb,
    description: 'Discussion and planning mode. Cannot edit files or run commands. Best for architecture and code review.',
    shortDescription: 'Read-only discussion mode',
    color: '#a78bfa',
    bgColor: 'rgba(167, 139, 250, 0.10)',
    systemPromptAddition: `You are a specialized AI PLANNING assistant. Your role is to create detailed, actionable plans and architectural guidance.

## Planning Guidelines

When asked to plan or design something:
1. **First, gather context** - Use read_file, list_directory, and search_files to understand the codebase
2. **Create a structured plan** with clear sections
3. **Break down the work** into specific, actionable steps
4. **Consider dependencies** - what needs to happen first?
5. **Identify potential issues** - edge cases, error handling, etc.

## Plan Format

Use this structure for your plans:

\`\`\`
📋 Plan: [Clear Title]

## Overview
[Brief description of what we're building/accomplishing]

## Prerequisites
[What needs to be in place before starting]

## Implementation Steps
- [ ] Step 1: [Actionable description]
- [ ] Step 2: [Actionable description]
...

## Key Considerations
- [Consideration 1]
- [Consideration 2]

## Files to Modify/Create
- [ ] file/path1.ts - [Purpose]
- [ ] file/path2.ts - [Purpose]
\`\`\`

## Your Capabilities
You can: read files, list directories, search code, view git diff, list code definitions
You CANNOT: create/edit/delete files, run commands

If the user wants to implement the plan, tell them to switch to Builder mode.`,
  },
  chat: {
    id: 'chat',
    name: 'Chat',
    icon: MessageCircle,
    description: 'General-purpose mode with codebase access. Can read, write, and search files. Best for quick tasks and questions.',
    shortDescription: 'Chat with codebase access',
    color: '#60a5fa',
    bgColor: 'rgba(96, 165, 250, 0.10)',
    systemPromptAddition: `You are an AI coding assistant. You can read, write, edit files, run commands, and search the codebase. When the user asks you to create or modify files, use your tools to do it directly — do not just output code in chat. Be concise and helpful.`,
  },
}

/**
 * Fallback system prompts when the model does NOT support tool calling.
 * These describe the role without referencing specific tool names,
 * so the model doesn't hallucinate tool-use actions it can't perform.
 */
export const AGENT_MODE_FALLBACK_PROMPTS: Record<AgentMode, string> = {
  builder: `You are in BUILDER mode — an AI coding assistant helping with a software project.
The model you are running on does not support tool calling, so you cannot directly read, write, or edit files, nor run commands.
Instead, provide complete, ready-to-use code in your responses:
- When the user asks you to create or modify files, output the full file contents in code blocks with the file path as a comment at the top.
- When the user asks you to run a command, tell them the exact command to run.
- Provide clear, step-by-step instructions for any changes.
- Be thorough and give the complete code, not just snippets.

Tip: The user can switch to a tool-capable model for direct file editing.`,

  planner: `You are a specialized AI PLANNING assistant in read-only mode. Your role is to create detailed, actionable plans and architectural guidance.

## Planning Guidelines
When asked to plan or design something:
1. **Understand the requirements** - Ask clarifying questions if needed
2. **Create a structured plan** with clear sections
3. **Break down the work** into specific, actionable steps
4. **Consider dependencies** - what needs to happen first?
5. **Identify potential issues** - edge cases, error handling, etc.

## Plan Format
Always use this structure for your plans:

\`\`\`
📋 Plan: [Clear Title]

## Overview
[Brief description of what we're building/accomplishing]

## Prerequisites
[What needs to be in place before starting]

## Implementation Steps
- [ ] Step 1: [Actionable description]
- [ ] Step 2: [Actionable description]
...

## Key Considerations
- [Consideration 1]
- [Consideration 2]

## Files to Modify/Create
- [ ] file/path1.ts - [Purpose]
- [ ] file/path2.ts - [Purpose]
\`\`\`

## Your Role
- Focus on architecture, code review, and planning
- Provide detailed, actionable implementation steps
- Identify potential issues and edge cases
- Suggest best practices and patterns

If the user shares code, analyze it thoroughly for improvements. If they want to implement the plan, suggest they switch to a model with tool capabilities.`,

  chat: `You are in CHAT mode — a pure conversation assistant.
You have no access to the user's files or project.
Focus on providing helpful, knowledgeable responses to questions, brainstorming, and discussions.
If the user needs help with their project files, suggest they switch to Builder mode.`,
}

interface Props {
  mode: AgentMode
  onModeChange: (mode: AgentMode) => void
}

export default function AgentModeSelector({ mode, onModeChange }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [dropdownPosition, setDropdownPosition] = useState<{ left: number; top: number } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const currentMode = AGENT_MODES[mode]
  const Icon = currentMode.icon

  useEffect(() => {
    if (!isOpen) return
    
    // Calculate dropdown position to keep it on screen
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const dropdownWidth = 288
      const viewportWidth = window.innerWidth
      
      // Default position: left-aligned with button
      let left = rect.left
      
      // If dropdown would overflow right edge, align to right of button
      if (left + dropdownWidth > viewportWidth - 16) {
        left = Math.max(16, rect.right - dropdownWidth)
      }
      
      setDropdownPosition({
        left,
        top: rect.bottom + 8
      })
    }
    
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
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
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 h-[26px] px-2.5 rounded-lg text-[11px] font-medium transition-all duration-150"
        style={{
          backgroundColor: isOpen ? 'var(--bg-hover)' : 'var(--bg-elevated)',
          color: 'var(--text-secondary)',
          border: `1px solid ${isOpen ? 'var(--border-default)' : 'var(--border-subtle)'}`,
        }}
        onMouseEnter={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'var(--border-default)'
            e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isOpen) {
            e.currentTarget.style.borderColor = 'var(--border-subtle)'
            e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'
          }
        }}
      >
        <Icon size={11} style={{ color: currentMode.color }} />
        <span>{currentMode.name}</span>
        <ChevronDown
          size={11}
          className="transition-transform duration-200"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            color: 'var(--text-muted)',
          }}
        />
      </button>

      {isOpen && dropdownPosition && (
        <div
          className="fixed rounded-xl overflow-hidden z-50"
          style={{
            left: `${dropdownPosition.left}px`,
            top: `${dropdownPosition.top}px`,
            width: 'min(288px, calc(100vw - 32px))',
            maxWidth: '288px',
            minWidth: '240px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-default)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {/* Mode Options */}
          <div className="p-2">
            {Object.values(AGENT_MODES).map((modeConfig) => {
              const ModeIcon = modeConfig.icon
              const isActive = mode === modeConfig.id

              return (
                <button
                  key={modeConfig.id}
                  onClick={() => handleSelectMode(modeConfig.id)}
                  className="w-full text-left p-3 rounded-lg transition-all duration-100 mb-1 last:mb-0"
                  style={{
                    backgroundColor: isActive ? modeConfig.bgColor : 'transparent',
                    border: `1px solid ${isActive ? `${modeConfig.color}22` : 'transparent'}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: isActive ? modeConfig.color : 'var(--bg-elevated)',
                          border: isActive ? 'none' : '1px solid var(--border-subtle)',
                        }}
                      >
                        <ModeIcon
                          size={14}
                          style={{ color: isActive ? '#000' : modeConfig.color }}
                        />
                      </div>
                      <div className="flex flex-col gap-1 pt-0.5">
                        <span
                          className="text-[12px] font-semibold"
                          style={{ color: isActive ? modeConfig.color : 'var(--text-primary)' }}
                        >
                          {modeConfig.name}
                        </span>
                        <span
                          className="text-[11px] leading-snug"
                          style={{ color: 'var(--text-secondary)' }}
                        >
                          {modeConfig.shortDescription}
                        </span>
                      </div>
                    </div>
                    {isActive && (
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                        style={{ backgroundColor: modeConfig.color, color: '#000' }}
                      >
                        <Check size={11} strokeWidth={3} />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div
            className="px-4 py-3"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <p className="text-[10px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {currentMode.description}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
