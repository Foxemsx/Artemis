import { useState, useCallback, useRef, useEffect } from 'react'
import type { ChatSession, ChatMessage, MessagePart, Provider, Model, AgentMode } from '../types'
import { AGENT_MODES } from '../components/AgentModeSelector'
import { zenClient, type ZenModel, type ZenMessage, type ZenError } from '../lib/zenClient'

interface UseOpenCodeReturn {
  // Connection
  isReady: boolean
  hasApiKey: boolean
  error: string | null
  setApiKey: (key: string) => Promise<boolean>

  // Sessions (local state, not server-based)
  sessions: ChatSession[]
  activeSessionId: string | null
  createSession: (title?: string) => string
  selectSession: (id: string) => void
  deleteSession: (id: string) => void

  // Messages
  messages: ChatMessage[]
  isStreaming: boolean
  sendMessage: (text: string) => Promise<void>
  abortMessage: () => void

  // Models
  models: ZenModel[]
  activeModel: Model | null
  setActiveModel: (model: Model) => void
  refreshModels: () => Promise<void>

  // Providers (derived from models)
  providers: Provider[]

  // Agent Mode
  agentMode: AgentMode
  setAgentMode: (mode: AgentMode) => void
}

// Generate unique IDs
function generateId(prefix: string = ''): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

// Format API error for display in chat
function formatErrorForChat(error: ZenError): string {
  const icon = {
    auth: '🔐',
    billing: '💳',
    rate_limit: '⏱️',
    server: '🔧',
    network: '🌐',
    unknown: '❌',
  }[error.type] || '❌'

  let message = `${icon} **${error.message}**`
  
  if (error.details) {
    message += `\n\n${error.details}`
  }

  // Add helpful links based on error type
  if (error.type === 'billing') {
    message += '\n\n→ [Add credits at opencode.ai](https://opencode.ai/billing)'
    message += '\n→ Or try a **free model** like GPT 5 Nano or Big Pickle'
  } else if (error.type === 'auth') {
    message += '\n\n→ Go to **Settings** to update your API key'
    message += '\n→ Get a key at [opencode.ai](https://opencode.ai)'
  } else if (error.type === 'rate_limit') {
    message += '\n\n→ Wait a moment and try again'
  }

  return message
}

export function useOpenCode(): UseOpenCodeReturn {
  const [isReady, setIsReady] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  
  const [models, setModels] = useState<ZenModel[]>([])
  const [activeModel, setActiveModelState] = useState<Model | null>(null)
  const [agentMode, setAgentModeState] = useState<AgentMode>('builder')

  const abortControllerRef = useRef<AbortController | null>(null)

  // Derive providers from models
  const providers: Provider[] = models.reduce((acc, model) => {
    const existingProvider = acc.find(p => p.name === model.provider)
    const modelItem: Model = {
      id: model.id,
      name: model.name,
      providerId: model.provider.toLowerCase().replace(/\s+/g, '-'),
      providerName: model.provider,
    }
    
    if (existingProvider) {
      existingProvider.models.push(modelItem)
    } else {
      acc.push({
        id: model.provider.toLowerCase().replace(/\s+/g, '-'),
        name: model.provider,
        models: [modelItem],
      })
    }
    return acc
  }, [] as Provider[])

  // Load API key and preferences on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        // Load API key
        const savedKey = await window.artemis.store.get('apiKey')
        const pendingKey = await window.artemis.store.get('pendingApiKey')
        const key = savedKey || pendingKey
        
        if (key && typeof key === 'string') {
          zenClient.setApiKey(key)
          setHasApiKey(true)
          
          // Validate and fetch models
          const valid = await zenClient.validateApiKey()
          if (valid) {
            setIsReady(true)
            // Clear pending key if it was used
            if (pendingKey) {
              await window.artemis.store.set('pendingApiKey', null)
              await window.artemis.store.set('apiKey', key)
            }
          } else {
            setError('Invalid API key. Please check your key in Settings.')
          }
        }

        // Load preferences
        const savedMode = await window.artemis.store.get('agentMode')
        if (savedMode === 'builder' || savedMode === 'planner') {
          setAgentModeState(savedMode)
        }
        
        const savedModel = await window.artemis.store.get('activeModel')
        if (savedModel && typeof savedModel === 'object') {
          setActiveModelState(savedModel as Model)
        }

        // Load sessions from storage
        const savedSessions = await window.artemis.store.get('chatSessions')
        if (Array.isArray(savedSessions) && savedSessions.length > 0) {
          setSessions(savedSessions)
          setActiveSessionId(savedSessions[0].id)
          
          // Load messages for first session
          const savedMessages = await window.artemis.store.get(`messages-${savedSessions[0].id}`)
          if (Array.isArray(savedMessages)) {
            setMessages(savedMessages)
          }
        }
      } catch (err) {
        console.error('[useOpenCode] Initialization error:', err)
      }
    }
    
    initialize()
  }, [])

  // Fetch models when ready
  useEffect(() => {
    if (isReady || hasApiKey) {
      refreshModels()
    }
  }, [isReady, hasApiKey])

  // Set API key
  const setApiKey = useCallback(async (key: string): Promise<boolean> => {
    try {
      zenClient.setApiKey(key)
      
      // Validate key
      const valid = await zenClient.validateApiKey()
      
      if (valid) {
        await window.artemis.store.set('apiKey', key)
        await window.artemis.store.set('pendingApiKey', null)
        setHasApiKey(true)
        setIsReady(true)
        setError(null)
        
        // Fetch models
        await refreshModels()
        return true
      } else {
        setError('Invalid API key')
        return false
      }
    } catch (err) {
      console.error('[useOpenCode] Error setting API key:', err)
      setError('Failed to validate API key')
      return false
    }
  }, [])

  // Refresh models from API
  const refreshModels = useCallback(async () => {
    try {
      const fetchedModels = await zenClient.getModels()
      setModels(fetchedModels)
      
      // Set default model if none selected
      if (!activeModel && fetchedModels.length > 0) {
        // Prefer a free model as default
        const freeModel = fetchedModels.find(m => m.free)
        const defaultModel = freeModel || fetchedModels[0]
        
        const model: Model = {
          id: defaultModel.id,
          name: defaultModel.name,
          providerId: defaultModel.provider.toLowerCase().replace(/\s+/g, '-'),
          providerName: defaultModel.provider,
        }
        setActiveModelState(model)
        await window.artemis.store.set('activeModel', model)
      }
    } catch (err) {
      console.error('[useOpenCode] Error fetching models:', err)
    }
  }, [activeModel])

  // Set active model
  const setActiveModel = useCallback((model: Model) => {
    setActiveModelState(model)
    window.artemis.store.set('activeModel', model).catch(err => {
      console.error('[useOpenCode] Error saving model preference:', err)
    })
  }, [])

  // Set agent mode
  const setAgentMode = useCallback((mode: AgentMode) => {
    setAgentModeState(mode)
    window.artemis.store.set('agentMode', mode).catch(err => {
      console.error('[useOpenCode] Error saving agent mode:', err)
    })
  }, [])

  // Save sessions to storage
  const saveSessions = useCallback(async (newSessions: ChatSession[]) => {
    try {
      await window.artemis.store.set('chatSessions', newSessions)
    } catch (err) {
      console.error('[useOpenCode] Error saving sessions:', err)
    }
  }, [])

  // Save messages to storage
  const saveMessages = useCallback(async (sessionId: string, msgs: ChatMessage[]) => {
    try {
      await window.artemis.store.set(`messages-${sessionId}`, msgs)
    } catch (err) {
      console.error('[useOpenCode] Error saving messages:', err)
    }
  }, [])

  // Create session
  const createSession = useCallback((title?: string): string => {
    const id = generateId('session-')
    const now = new Date().toISOString()
    
    const newSession: ChatSession = {
      id,
      title: title || 'New Chat',
      createdAt: now,
      updatedAt: now,
    }
    
    setSessions(prev => {
      const updated = [newSession, ...prev]
      saveSessions(updated)
      return updated
    })
    setActiveSessionId(id)
    setMessages([])
    
    return id
  }, [saveSessions])

  // Select session
  const selectSession = useCallback(async (id: string) => {
    setActiveSessionId(id)
    
    // Load messages for this session
    try {
      const savedMessages = await window.artemis.store.get(`messages-${id}`)
      if (Array.isArray(savedMessages)) {
        setMessages(savedMessages)
      } else {
        setMessages([])
      }
    } catch {
      setMessages([])
    }
  }, [])

  // Delete session
  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const updated = prev.filter(s => s.id !== id)
      saveSessions(updated)
      
      // If deleting active session, switch to first remaining
      if (activeSessionId === id) {
        if (updated.length > 0) {
          setActiveSessionId(updated[0].id)
          selectSession(updated[0].id)
        } else {
          setActiveSessionId(null)
          setMessages([])
        }
      }
      
      return updated
    })
    
    // Clean up messages
    window.artemis.store.set(`messages-${id}`, null).catch(() => {})
  }, [activeSessionId, saveSessions, selectSession])

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    if (!activeModel || !text.trim()) {
      if (!activeModel) setError('Please select a model first')
      return
    }

    if (!zenClient.hasApiKey()) {
      setError('Please set your API key first')
      return
    }

    // Ensure we have a session
    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = createSession()
    }

    // Create user message
    const userMsg: ChatMessage = {
      id: generateId('msg-'),
      sessionId,
      role: 'user',
      parts: [{ type: 'text', text }],
      createdAt: new Date().toISOString(),
    }

    // Create placeholder assistant message
    const assistantMsg: ChatMessage = {
      id: generateId('msg-'),
      sessionId,
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      model: activeModel.name,
      createdAt: new Date().toISOString(),
    }

    // Update messages state
    setMessages(prev => {
      const updated = [...prev, userMsg, assistantMsg]
      return updated
    })
    setIsStreaming(true)
    setError(null)

    // Prepare conversation history
    const currentMessages = [...messages, userMsg]
    const zenMessages: ZenMessage[] = currentMessages.map(m => ({
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.parts.map(p => p.text || '').join('\n'),
    }))

    // Get system prompt from agent mode
    const modeConfig = AGENT_MODES[agentMode]
    const systemPrompt = modeConfig?.systemPromptAddition

    // Create abort controller
    abortControllerRef.current = new AbortController()

    try {
      let fullContent = ''
      let streamError: ZenError | null = null

      // Stream the response
      for await (const chunk of zenClient.chatStream(
        activeModel.id,
        zenMessages,
        {
          system: systemPrompt,
          signal: abortControllerRef.current.signal,
        }
      )) {
        // Check if this is an error chunk
        if ('error' in chunk) {
          streamError = chunk.error
          break
        }
        
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) {
          fullContent += delta
          
          // Update the assistant message
          setMessages(prev => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.parts = [{ type: 'text', text: fullContent }]
            }
            return updated
          })
        }
      }

      // Handle stream error
      if (streamError) {
        const errorDisplay = formatErrorForChat(streamError)
        setMessages(prev => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.parts = [{ type: 'text', text: errorDisplay }]
          }
          return updated
        })
        return
      }

      // Save final messages
      setMessages(prev => {
        saveMessages(sessionId!, prev)
        return prev
      })

      // Update session title if it's the first message
      if (messages.length === 0) {
        setSessions(prev => {
          const updated = prev.map(s => {
            if (s.id === sessionId) {
              // Use first few words of user message as title
              const title = text.slice(0, 50) + (text.length > 50 ? '...' : '')
              return { ...s, title, updatedAt: new Date().toISOString() }
            }
            return s
          })
          saveSessions(updated)
          return updated
        })
      }

    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('[useOpenCode] Request aborted')
      } else {
        console.error('[useOpenCode] Chat error:', err)
        const errorMessage = err.message || 'Failed to send message'
        setError(errorMessage)
        
        // Update assistant message with error
        setMessages(prev => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          if (lastMsg && lastMsg.role === 'assistant') {
            lastMsg.parts = [{ type: 'text', text: `**Error:** ${errorMessage}` }]
          }
          return updated
        })
      }
    } finally {
      setIsStreaming(false)
      abortControllerRef.current = null
    }
  }, [activeSessionId, activeModel, messages, agentMode, createSession, saveMessages, saveSessions])

  // Abort message
  const abortMessage = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setIsStreaming(false)
    }
  }, [])

  return {
    isReady,
    hasApiKey,
    error,
    setApiKey,
    sessions,
    activeSessionId,
    createSession,
    selectSession,
    deleteSession,
    messages,
    isStreaming,
    sendMessage,
    abortMessage,
    models,
    activeModel,
    setActiveModel,
    refreshModels,
    providers,
    agentMode,
    setAgentMode,
  }
}
