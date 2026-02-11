import { useState, useRef, useEffect } from 'react'
import {
  Plus, X, Copy, FolderOpen, MessageSquare, ChevronDown, ChevronRight,
  Circle, Info, Cpu, DollarSign, Zap, Pencil, Trash2, Sparkles, Server,
  Folder, Minus, AlertTriangle
} from 'lucide-react'
import type { ChatSession, Model, Project, SessionTokenUsage } from '../types'
import ContextMenu, { type MenuItem } from './ContextMenu'
import { formatTokenCount, formatCost } from '../lib/formatters'

interface Props {
  // Sessions (for active project)
  sessions: ChatSession[]
  allSessions: ChatSession[]
  activeSessionId: string | null
  streamingSessionIds: Set<string>
  onCreateSession: () => void
  onSelectSession: (id: string) => void
  onDeleteSession: (id: string) => void
  onRenameSession: (id: string, title: string) => void

  // Project
  project: Project | null
  recentProjects: Project[]
  onAddProject: () => void
  onSelectProject: (project: Project) => void
  onRemoveProject: (projectId: string) => void
  onOpenProjectDirectory: (projectPath: string) => void

  // Model / Status
  activeModel: Model | null
  isReady: boolean
  hasApiKey: boolean

  // Token usage
  sessionTokenUsage: SessionTokenUsage
  totalTokenUsage: SessionTokenUsage
}

function getContextPercentage(usage: SessionTokenUsage, model: Model | null): number {
  const contextWindow = model?.contextWindow || 128000
  return Math.min(100, (usage.totalTokens / contextWindow) * 100)
}

export default function Sidebar({
  sessions, allSessions, activeSessionId, streamingSessionIds,
  onCreateSession, onSelectSession, onDeleteSession, onRenameSession,
  project, recentProjects, onAddProject, onSelectProject, onRemoveProject, onOpenProjectDirectory,
  activeModel, isReady, hasApiKey,
  sessionTokenUsage, totalTokenUsage,
}: Props) {
  const [sessionsExpanded, setSessionsExpanded] = useState(true)
  const [projectsExpanded, setProjectsExpanded] = useState(false)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; sessionId: string } | null>(null)
  const [projectContextMenu, setProjectContextMenu] = useState<{ x: number; y: number; projectId: string; projectPath: string } | null>(null)
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const handleProjectContextMenu = (e: React.MouseEvent, projectId: string, projectPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    setProjectContextMenu({ x: e.clientX, y: e.clientY, projectId, projectPath })
  }

  const contextPercent = getContextPercentage(sessionTokenUsage, activeModel)
  const contextWindow = activeModel?.contextWindow || 128000

  return (
    <div
      className="h-full flex flex-col overflow-hidden no-select"
      style={{
        width: 260,
        backgroundColor: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header: Sessions */}
      <div
        className="flex items-center justify-between px-4 h-10 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: 'var(--text-muted)' }}
        >
          Sessions
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onCreateSession}
            className="p-1 rounded-md transition-all duration-100"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.backgroundColor = 'transparent'
            }}
            title="New session"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Instance Info */}
      <div
        className="px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <Info size={11} style={{ color: 'var(--text-muted)' }} />
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Instance Info
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Circle
            size={7}
            fill={isReady ? 'var(--success)' : hasApiKey ? 'var(--warning)' : 'var(--text-muted)'}
            stroke="none"
            style={{
              boxShadow: isReady ? '0 0 6px rgba(74, 222, 128, 0.4)' : 'none',
            }}
          />
          <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
            {isReady ? 'Connected' : hasApiKey ? 'Connecting...' : 'No API Key'}
          </span>
          {activeModel && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-md ml-auto truncate max-w-[100px]"
              style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-muted)' }}
            >
              {activeModel.name}
            </span>
          )}
        </div>
      </div>

      {/* User Sessions List */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="py-1">
          <button
            onClick={() => setSessionsExpanded(!sessionsExpanded)}
            className="flex items-center gap-1.5 w-full px-4 py-1.5 text-left"
            style={{ color: 'var(--text-muted)' }}
          >
            {sessionsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              User Sessions
            </span>
          </button>

          {sessionsExpanded && (
            <div className="mt-0.5">
              {sessions.length === 0 ? (
                <div className="px-4 py-4 text-center">
                  <MessageSquare size={16} style={{ color: 'var(--text-muted)', margin: '0 auto 6px', opacity: 0.4 }} />
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>No sessions yet</p>
                </div>
              ) : (
                sessions.map((session) => {
                  const isActive = session.id === activeSessionId
                  const sessionStatus = streamingSessionIds.has(session.id) ? 'WORKING' : 'IDLE'

                  return (
                    <div
                      key={session.id}
                      className="group flex items-start gap-2 px-3 py-2 mx-1.5 rounded-lg cursor-pointer transition-all duration-100"
                      style={{
                        backgroundColor: isActive ? 'var(--accent-glow)' : 'transparent',
                        border: isActive ? '1px solid rgba(var(--accent-rgb), 0.12)' : '1px solid transparent',
                      }}
                      onClick={() => onSelectSession(session.id)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setContextMenu({ x: e.clientX, y: e.clientY, sessionId: session.id })
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <MessageSquare
                        size={13}
                        className="shrink-0 mt-0.5"
                        style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
                      />
                      <div className="flex-1 min-w-0">
                        {renamingSessionId === session.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && renameValue.trim()) {
                                onRenameSession(session.id, renameValue.trim())
                                setRenamingSessionId(null)
                              }
                              if (e.key === 'Escape') setRenamingSessionId(null)
                              e.stopPropagation()
                            }}
                            onBlur={() => {
                              if (renameValue.trim()) onRenameSession(session.id, renameValue.trim())
                              setRenamingSessionId(null)
                            }}
                            onClick={e => e.stopPropagation()}
                            className="text-[11px] font-medium bg-transparent outline-none w-full min-w-0 px-1 rounded"
                            style={{ color: 'var(--text-primary)', border: '1px solid var(--accent)' }}
                          />
                        ) : (
                          <p
                            className="text-[11px] font-medium truncate"
                            style={{ color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                          >
                            {session.title}
                          </p>
                        )}
                        {/* Status badge */}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide"
                            style={{
                              backgroundColor: sessionStatus === 'WORKING'
                                ? 'rgba(251, 191, 36, 0.12)'
                                : 'rgba(74, 222, 128, 0.10)',
                              color: sessionStatus === 'WORKING'
                                ? 'var(--warning)'
                                : 'var(--success)',
                            }}
                          >
                            <Circle
                              size={5}
                              fill={sessionStatus === 'WORKING' ? 'var(--warning)' : 'var(--success)'}
                              stroke="none"
                            />
                            {sessionStatus}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteSession(session.id)
                          }}
                          className="p-1 rounded-md transition-all"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--error)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)' }}
                          title="Delete session"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>

        {/* Projects Section */}
        <div className="mt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => setProjectsExpanded(!projectsExpanded)}
            className="flex items-center gap-1.5 w-full px-4 py-2 text-left"
            style={{ color: 'var(--text-muted)' }}
          >
            {projectsExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            <span className="text-[10px] font-semibold uppercase tracking-wider">
              Projects
            </span>
          </button>

          {projectsExpanded && (
            <div className="px-2 pb-2">
              {project && (() => {
                const runningCount = allSessions
                  .filter(s => s.projectId === project.id && streamingSessionIds.has(s.id)).length
                const sessionCount = allSessions.filter(s => s.projectId === project.id).length
                return (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--accent-glow)',
                      border: '1px solid rgba(var(--accent-rgb), 0.12)',
                    }}
                    onContextMenu={(e) => handleProjectContextMenu(e, project.id, project.path)}
                  >
                    <FolderOpen size={12} style={{ color: 'var(--accent)' }} />
                    <span className="text-[11px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {project.name}
                    </span>
                    <div className="ml-auto flex items-center gap-1.5 shrink-0">
                      {runningCount > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                          style={{ backgroundColor: 'rgba(251, 191, 36, 0.12)', color: 'var(--warning)' }}
                        >
                          <Circle size={4} fill="var(--warning)" stroke="none" />
                          {runningCount}
                        </span>
                      )}
                      <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                        {sessionCount}
                      </span>
                    </div>
                  </div>
                )
              })()}

              {recentProjects
                .filter(p => p.id !== project?.id)
                .slice(0, 5)
                .map((p) => {
                  const runningCount = allSessions
                    .filter(s => s.projectId === p.id && streamingSessionIds.has(s.id)).length
                  const sessionCount = allSessions.filter(s => s.projectId === p.id).length
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all"
                      style={{ color: 'var(--text-secondary)' }}
                      onClick={() => onSelectProject(p)}
                      onContextMenu={(e) => handleProjectContextMenu(e, p.id, p.path)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <FolderOpen size={12} style={{ color: 'var(--text-muted)' }} />
                      <span className="text-[11px] truncate">{p.name}</span>
                      <div className="ml-auto flex items-center gap-1.5 shrink-0">
                        {runningCount > 0 && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold"
                            style={{ backgroundColor: 'rgba(251, 191, 36, 0.12)', color: 'var(--warning)' }}
                          >
                            <Circle size={4} fill="var(--warning)" stroke="none" />
                            {runningCount}
                          </span>
                        )}
                        {sessionCount > 0 && (
                          <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                            {sessionCount}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}

              <button
                onClick={onAddProject}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg transition-all text-left"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-hover)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }}
              >
                <Plus size={12} />
                <span className="text-[11px]">Open folder</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Model & Token Usage Panel */}
      <div
        className="shrink-0"
        style={{
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        {/* Active Model Card */}
        {activeModel && (
          <div
            className="mx-3 mt-3 mb-2 rounded-lg p-2.5 relative overflow-hidden"
            style={{
              backgroundColor: 'var(--accent-glow)',
              border: '1px solid rgba(var(--accent-rgb), 0.15)',
            }}
          >
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                background: 'linear-gradient(135deg, var(--accent) 0%, transparent 60%)',
              }}
            />
            <div className="relative">
              <div className="flex items-center gap-2 mb-1.5">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'rgba(var(--accent-rgb), 0.15)',
                  }}
                >
                  <Sparkles size={10} style={{ color: 'var(--accent)' }} />
                </div>
                <span
                  className="text-[12px] font-bold truncate"
                  style={{ color: 'var(--accent)' }}
                >
                  {activeModel.name}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-7">
                <div className="flex items-center gap-1">
                  <Server size={8} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    {activeModel.providerName || (activeModel.aiProvider === 'zai' ? 'Z.AI' : 'Zen')}
                  </span>
                </div>
                {activeModel.free && (
                  <span
                    className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full tracking-wide"
                    style={{
                      backgroundColor: 'rgba(74, 222, 128, 0.1)',
                      color: 'var(--success)',
                      border: '1px solid rgba(74, 222, 128, 0.15)',
                    }}
                  >
                    Free
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {activeModel && activeModel.supportsTools === false && (
          <div
            className="mx-3 mb-2 rounded-lg p-2 flex items-start gap-2"
            style={{
              backgroundColor: 'rgba(251, 146, 60, 0.08)',
              border: '1px solid rgba(251, 146, 60, 0.15)',
            }}
          >
            <AlertTriangle size={12} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <span className="text-[10px] font-semibold block" style={{ color: 'var(--warning)' }}>
                No Tool Support
              </span>
              <span className="text-[9px] leading-tight block mt-0.5" style={{ color: 'var(--text-muted)' }}>
                This model does not support tool calling. Agent features (Builder/Planner) may not work correctly.
              </span>
            </div>
          </div>
        )}

        {!activeModel && (
          <div className="mx-3 mt-3 mb-2 rounded-lg p-2.5" style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <Circle size={8} fill="var(--text-muted)" stroke="none" style={{ opacity: 0.4 }} />
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>No model selected</span>
            </div>
          </div>
        )}

        {/* Token Stats */}
        <div className="px-3 pb-4 pt-1">
          {/* Label */}
          <div className="flex items-center gap-1.5 mb-2">
            <Cpu size={10} style={{ color: 'var(--text-muted)' }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Tokens (session)
            </span>
          </div>

          {/* Big token count */}
          <div className="text-[20px] font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            {formatTokenCount(sessionTokenUsage.totalTokens)}
          </div>

          {/* Cost + pricing row */}
          <div className="flex items-center gap-3 mb-3">
            {activeModel?.pricing && sessionTokenUsage.estimatedCost > 0 && (
              <div className="flex items-center gap-1">
                <DollarSign size={9} style={{ color: 'var(--accent)' }} />
                <span className="text-[11px] font-semibold" style={{ color: 'var(--accent)' }}>
                  {formatCost(sessionTokenUsage.estimatedCost)}
                </span>
              </div>
            )}
            {activeModel?.pricing && (
              <>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  In: ${activeModel.pricing.input.toFixed(2)}/1M
                </span>
                <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
                  Out: ${activeModel.pricing.output.toFixed(2)}/1M
                </span>
              </>
            )}
          </div>

          {/* Context Window Bar */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Context Window
            </span>
            <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
              {formatTokenCount(sessionTokenUsage.totalTokens)} / {formatTokenCount(contextWindow)} · {contextPercent.toFixed(0)}%
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
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
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              label: 'Rename',
              icon: Pencil,
              onClick: () => {
                const session = sessions.find(s => s.id === contextMenu.sessionId)
                if (session) {
                  setRenameValue(session.title)
                  setRenamingSessionId(contextMenu.sessionId)
                }
              },
            },
            { separator: true } as MenuItem,
            {
              label: 'Delete',
              icon: Trash2,
              danger: true,
              onClick: () => {
                onDeleteSession(contextMenu.sessionId)
              },
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {projectContextMenu && (
        <ContextMenu
          x={projectContextMenu.x}
          y={projectContextMenu.y}
          items={[
            {
              label: 'Open Directory',
              icon: Folder,
              onClick: () => {
                onOpenProjectDirectory(projectContextMenu.projectPath)
              },
            },
            { separator: true } as MenuItem,
            {
              label: 'Remove Project',
              icon: Minus,
              onClick: () => {
                onRemoveProject(projectContextMenu.projectId)
              },
            },
          ]}
          onClose={() => setProjectContextMenu(null)}
        />
      )}
    </div>
  )
}
