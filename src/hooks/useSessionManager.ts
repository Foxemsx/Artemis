import { useState, useCallback, useMemo, useRef } from 'react'
import type { ChatSession, ChatMessage } from '../types'

function generateId(prefix: string = ''): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export interface SessionManagerReturn {
  sessions: ChatSession[]
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>
  projectSessions: ChatSession[]
  activeSessionId: string | null
  setActiveSessionId: React.Dispatch<React.SetStateAction<string | null>>
  allSessionMessages: Map<string, ChatMessage[]>
  setAllSessionMessages: React.Dispatch<React.SetStateAction<Map<string, ChatMessage[]>>>
  messages: ChatMessage[]
  createSession: (title?: string) => string
  selectSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void
  clearMessages: () => void
  saveSessions: (newSessions: ChatSession[]) => Promise<void>
  saveMessages: (sessionId: string, msgs: ChatMessage[]) => Promise<void>
}

export function useSessionManager(activeProjectId: string | null): SessionManagerReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)
  // Keep ref in sync so callbacks always read the latest value
  activeSessionIdRef.current = activeSessionId
  const [allSessionMessages, setAllSessionMessages] = useState<Map<string, ChatMessage[]>>(new Map())

  const messages = useMemo(() => {
    return activeSessionId ? (allSessionMessages.get(activeSessionId) || []) : []
  }, [activeSessionId, allSessionMessages])

  const projectSessions = useMemo(() => {
    if (!activeProjectId) return sessions
    return sessions.filter(s => s.projectId === activeProjectId)
  }, [sessions, activeProjectId])

  const saveSessions = useCallback(async (newSessions: ChatSession[]) => {
    try {
      await window.artemis.store.set('chatSessions', newSessions)
    } catch (err) {
      console.error('[useSessionManager] Error saving sessions:', err)
    }
  }, [])

  const saveMessages = useCallback(async (sessionId: string, msgs: ChatMessage[]) => {
    try {
      await window.artemis.store.set(`messages-${sessionId}`, msgs)
    } catch (err) {
      console.error('[useSessionManager] Error saving messages:', err)
    }
  }, [])

  const createSession = useCallback((title?: string): string => {
    const id = generateId('session-')
    const now = new Date().toISOString()

    const newSession: ChatSession = {
      id,
      title: title || 'New Chat',
      projectId: activeProjectId || undefined,
      createdAt: now,
      updatedAt: now,
    }

    setSessions(prev => {
      const updated = [newSession, ...prev]
      saveSessions(updated)
      return updated
    })
    setActiveSessionId(id)
    setAllSessionMessages(prev => new Map(prev).set(id, []))

    return id
  }, [saveSessions, activeProjectId])

  const selectSession = useCallback(async (id: string) => {
    setActiveSessionId(id)

    try {
      const savedMessages = await window.artemis.store.get(`messages-${id}`)
      setAllSessionMessages(prev => {
        const existing = prev.get(id)
        if (existing && existing.length > 0) {
          return prev
        }
        const next = new Map(prev)
        if (Array.isArray(savedMessages) && savedMessages.length > 0) {
          next.set(id, savedMessages)
        } else {
          next.set(id, [])
        }
        return next
      })
    } catch {
      setAllSessionMessages(prev => {
        const existing = prev.get(id)
        if (existing && existing.length > 0) return prev
        return new Map(prev).set(id, [])
      })
    }
  }, [])

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id)
      saveSessions(updated)

      // Use ref to avoid stale closure over activeSessionId
      if (activeSessionIdRef.current === id) {
        if (updated.length > 0) {
          setActiveSessionId(updated[0].id)
          selectSession(updated[0].id)
        } else {
          setActiveSessionId(null)
          setAllSessionMessages(new Map())
        }
      }

      return updated
    })

    setAllSessionMessages(prev => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    window.artemis.store.delete(`messages-${id}`).catch(() => {})
  }, [saveSessions, selectSession])

  const renameSession = useCallback((id: string, title: string) => {
    setSessions(prev => {
      const updated = prev.map(s =>
        s.id === id ? { ...s, title, updatedAt: new Date().toISOString() } : s
      )
      saveSessions(updated)
      return updated
    })
  }, [saveSessions])

  const clearMessages = useCallback(() => {
    const currentId = activeSessionIdRef.current
    if (!currentId) return

    setAllSessionMessages(prev => new Map(prev).set(currentId, []))
    window.artemis.store.set(`messages-${currentId}`, []).catch(() => {})
  }, [])

  return {
    sessions,
    setSessions,
    projectSessions,
    activeSessionId,
    setActiveSessionId,
    allSessionMessages,
    setAllSessionMessages,
    messages,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    clearMessages,
    saveSessions,
    saveMessages,
  }
}
