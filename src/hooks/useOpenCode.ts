import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { ChatSession, ChatMessage, MessagePart, Provider, Model, AgentMode, EditApprovalMode, SessionTokenUsage, AgentStep, AIProvider } from '../types'
import { AGENT_MODES } from '../components/AgentModeSelector'
import { zenClient, type ZenModel, MODEL_METADATA, PROVIDER_REGISTRY, getProviderInfo } from '../lib/zenClient'
import { type SoundSettings, DEFAULT_SOUND_SETTINGS, playSound, showNotification } from '../lib/sounds'
import { createCheckpoint, getCheckpoints, restoreCheckpoint, extractModifiedFiles, type Checkpoint } from '../lib/checkpoints'
import { useSessionManager } from './useSessionManager'
import { useTokenTracker } from './useTokenTracker'
import { estimateTokens } from '../lib/tokenCounter'

interface UseOpenCodeReturn {
  // Connection
  isReady: boolean
  hasApiKey: boolean
  error: string | null
  setApiKey: (provider: AIProvider, key: string) => Promise<boolean>
  apiKeys: Record<AIProvider, { key: string; isConfigured: boolean }>

  // Sessions
  sessions: ChatSession[]           // ALL sessions across all projects
  projectSessions: ChatSession[]    // Sessions for the active project only
  activeSessionId: string | null
  createSession: (title?: string) => string
  selectSession: (id: string) => void
  deleteSession: (id: string) => void
  renameSession: (id: string, title: string) => void

  // Messages
  messages: ChatMessage[]
  isStreaming: boolean
  streamingSessionIds: Set<string>  // Which sessions have running agents (for UI badges)
  sendMessage: (text: string, fileContext?: string, modeOverride?: AgentMode, planText?: string, images?: Array<{ id: string; url: string; name: string }>) => Promise<void>
  abortMessage: () => void
  clearMessages: () => void

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

  // Edit Approval
  editApprovalMode: EditApprovalMode
  setEditApprovalMode: (mode: EditApprovalMode) => void

  // Sounds & Notifications
  soundSettings: SoundSettings
  setSoundSettings: (settings: SoundSettings) => void

  // Checkpoints
  checkpoints: Checkpoint[]
  restoreToCheckpoint: (checkpointId: string) => Promise<{ restored: number; errors: string[] } | null>

  // Token Usage
  sessionTokenUsage: SessionTokenUsage
  totalTokenUsage: SessionTokenUsage

  // Streaming speed (tokens/sec, 0 when not streaming)
  streamingSpeed: number

  // Project token count (total tokens in project, excluding node_modules/dist)
  projectTokenCount: number

  // Project context for tools
  setProjectPath: (path: string | null) => void
}

// Generate unique IDs
function generateId(prefix: string = ''): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}


// Module-level cache for project token counts (survives re-renders, cleared on page reload)
const projectTokenCache = new Map<string, {
  tokenCount: number
  computedAt: number
  fileStats: Map<string, number> // filePath → size for incremental invalidation
}>()

export function useOpenCode(activeProjectId: string | null = null): UseOpenCodeReturn {
  const [isReady, setIsReady] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [apiKeys, setApiKeys] = useState<Record<AIProvider, { key: string; isConfigured: boolean }>>(() => {
    const init = {} as Record<AIProvider, { key: string; isConfigured: boolean }>
    for (const p of PROVIDER_REGISTRY) {
      init[p.id] = { key: '', isConfigured: false }
    }
    return init
  })

  // ─── Delegated Sub-Hooks ──────────────────────────────────────────────────
  const {
    sessions, setSessions, projectSessions, activeSessionId, setActiveSessionId,
    allSessionMessages, setAllSessionMessages, messages,
    createSession, selectSession, deleteSession, renameSession, clearMessages,
    saveSessions, saveMessages,
  } = useSessionManager(activeProjectId)

  const {
    sessionTokenUsage, totalTokenUsage, trackUsage, restoreSessionUsage,
  } = useTokenTracker(activeSessionId)
  
  const [streamingSessionIds, setStreamingSessionIds] = useState<Set<string>>(new Set())
  
  // Computed: is the ACTIVE session currently streaming?
  const isStreaming = activeSessionId ? streamingSessionIds.has(activeSessionId) : false
  
  const [models, setModels] = useState<ZenModel[]>([])
  const [activeModel, setActiveModelState] = useState<Model | null>(null)
  const [agentMode, setAgentModeState] = useState<AgentMode>('builder')
  const [editApprovalMode, setEditApprovalModeState] = useState<EditApprovalMode>('allow-all')
  const [soundSettings, setSoundSettingsState] = useState<SoundSettings>(DEFAULT_SOUND_SETTINGS)

  // Concurrency: Per-session state maps to prevent interference between concurrent agent runs
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map()) // sessionId → AbortController
  const activeRequestsRef = useRef<Map<string, string>>(new Map()) // sessionId → requestId
  const activeCleanupFnsRef = useRef<Map<string, () => void>>(new Map()) // sessionId → cleanup fn
  const [projectPath, setProjectPathState] = useState<string | null>(null)
  const projectPathRef = useRef<string | null>(null)
  const [streamingSpeed, setStreamingSpeed] = useState(0) // tokens/sec
  const [projectTokenCount, setProjectTokenCount] = useState(0)

  // Batched streaming updates: coalesce rapid setAllSessionMessages calls into one per animation frame
  const pendingMessageUpdatesRef = useRef<Map<string, (msgs: ChatMessage[]) => ChatMessage[]>>(new Map())
  const rafIdRef = useRef<number | null>(null)

  const flushMessageUpdates = useCallback(() => {
    rafIdRef.current = null
    const pending = pendingMessageUpdatesRef.current
    if (pending.size === 0) return
    const updates = new Map(pending)
    pending.clear()
    setAllSessionMessages(prev => {
      const next = new Map(prev)
      for (const [sessionId, updater] of updates) {
        const current = next.get(sessionId) || []
        next.set(sessionId, updater(current))
      }
      return next
    })
  }, [])

  const scheduleMessageUpdate = useCallback((sessionId: string, updater: (msgs: ChatMessage[]) => ChatMessage[]) => {
    // Chain updaters so multiple calls per frame compose correctly
    const existing = pendingMessageUpdatesRef.current.get(sessionId)
    if (existing) {
      pendingMessageUpdatesRef.current.set(sessionId, (msgs) => updater(existing(msgs)))
    } else {
      pendingMessageUpdatesRef.current.set(sessionId, updater)
    }
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushMessageUpdates)
    }
  }, [flushMessageUpdates])

  // Keep ref in sync with state for use in other functions
  useEffect(() => {
    projectPathRef.current = projectPath
  }, [projectPath])

  useEffect(() => {
    return () => {
      // Clean up all active sessions on unmount
      activeCleanupFnsRef.current.forEach(fn => fn())
      activeCleanupFnsRef.current.clear()
      // Cancel any pending rAF to prevent setState on unmounted component
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
    }
  }, [])

  // Calculate total token count for the project (excluding node_modules, dist, etc.)
  // Uses a module-level cache with a 5-minute TTL to avoid redundant I/O.
  useEffect(() => {
    if (!projectPath) return

    const abortController = new AbortController()
    const signal = abortController.signal
    const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

    const cached = projectTokenCache.get(projectPath)
    if (cached && Date.now() - cached.computedAt < CACHE_TTL_MS) {
      setProjectTokenCount(cached.tokenCount)
      return
    }

    const timeoutId = setTimeout(async () => {
      try {
        const ignore = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.next', '__pycache__', '.venv', 'venv', 'build', '.cache'])
        let totalChars = 0
        const MAX_FILE_SIZE = 500_000
        const MAX_TOTAL_CHARS = 10_000_000
        const MAX_DEPTH = 6
        const prevFileStats = cached?.fileStats || new Map<string, number>()
        const newFileStats = new Map<string, number>()
        let usedCacheHits = 0

        async function countInDir(dirPath: string, depth: number): Promise<void> {
          if (signal.aborted || depth > MAX_DEPTH || totalChars > MAX_TOTAL_CHARS) return
          
          try {
            const dirEntries = await window.artemis.fs.readDir(dirPath)
            if (signal.aborted) return
            
            for (const entry of dirEntries) {
              if (signal.aborted) return
              if (ignore.has(entry.name)) continue
              const fullPath = `${dirPath}/${entry.name}`.replace(/\\/g, '/')
              if (entry.type === 'directory') {
                await countInDir(fullPath, depth + 1)
                if (signal.aborted) return
              } else {
                try {
                  const stat = await window.artemis.fs.stat(fullPath)
                  if (signal.aborted) return
                  if (stat.size < MAX_FILE_SIZE) {
                    // If file size matches cached stat, skip re-reading
                    const prevSize = prevFileStats.get(fullPath)
                    if (prevSize !== undefined && prevSize === stat.size) {
                      usedCacheHits++
                    }
                    totalChars += stat.size
                    newFileStats.set(fullPath, stat.size)
                  }
                } catch {}
              }
            }
          } catch {}
        }

        await countInDir(projectPath, 0)
        if (!signal.aborted) {
          const tokenCount = Math.ceil(totalChars / 3.5)
          setProjectTokenCount(tokenCount)
          projectTokenCache.set(projectPath, {
            tokenCount,
            computedAt: Date.now(),
            fileStats: newFileStats,
          })
        }
      } catch {}
    }, 1000)

    return () => {
      abortController.abort()
      clearTimeout(timeoutId)
    }
  }, [projectPath])

  // Derive providers from models - group by aiProvider (zen, zai, openrouter, anthropic, etc.)
  const providers: Provider[] = useMemo(() => models.reduce((acc, model) => {
    // GLM-4.7-Free is only available on OpenCode Zen, not Z.AI
    if (model.aiProvider === 'zai' && model.id === 'glm-4.7-free') {
      return acc
    }

    // Group by the actual AI provider backend
    const providerId = model.aiProvider || 'zen'
    const providerInfo = getProviderInfo(providerId as AIProvider)
    const providerName = providerInfo?.name || providerId
    const existingProvider = acc.find(p => p.id === providerId)
    const meta = MODEL_METADATA[model.id]
    const modelItem: Model = {
      id: model.id,
      name: model.name,
      providerId: model.provider.toLowerCase().replace(/\s+/g, '-'),
      providerName: model.provider,
      aiProvider: model.aiProvider,
      maxTokens: model.maxTokens || meta?.maxTokens,
      contextWindow: model.contextWindow || meta?.contextWindow,
      pricing: model.pricing || meta?.pricing,
      free: model.free || false,
      description: model.description || meta?.description,
      supportsTools: model.supportsTools ?? meta?.supportsTools,
    }

    if (existingProvider) {
      existingProvider.models.push(modelItem)
    } else {
      acc.push({
        id: providerId,
        name: providerName,
        models: [modelItem],
      })
    }
    return acc
  }, [] as Provider[]), [models])

  // Load API keys and preferences on mount
  useEffect(() => {
    const initialize = async () => {
      try {
        // Parallel batch: load all store keys at once instead of sequential IPC calls
        const storeKeys = [
          'pendingApiKeys',
          ...PROVIDER_REGISTRY.map(p => `apiKey:${p.id}`),
          'baseUrl:ollama',
          'agentMode', 'editApprovalMode', 'soundSettings', 'activeModel', 'chatSessions',
        ]
        const storeResults = await Promise.all(storeKeys.map(k => window.artemis.store.get(k)))

        // Unpack results by index
        let idx = 0
        const pendingApiKeys = storeResults[idx++]
        const providerKeys: Record<string, any> = {}
        for (const p of PROVIDER_REGISTRY) {
          providerKeys[p.id] = storeResults[idx++]
        }
        const ollamaCustomUrl = storeResults[idx++]
        const savedMode = storeResults[idx++]
        const savedApproval = storeResults[idx++]
        const savedSounds = storeResults[idx++]
        const savedModel = storeResults[idx++]
        const savedSessions = storeResults[idx++]

        // Process API keys
        const newApiKeys = {} as Record<AIProvider, { key: string; isConfigured: boolean }>
        for (const p of PROVIDER_REGISTRY) {
          newApiKeys[p.id] = { key: '', isConfigured: false }
        }

        for (const p of PROVIDER_REGISTRY) {
          const savedKey = providerKeys[p.id]
          const key = savedKey || (pendingApiKeys as any)?.[p.id]

          // Ollama doesn't need a key — load custom base URL instead
          if (p.id === 'ollama') {
            if (ollamaCustomUrl && typeof ollamaCustomUrl === 'string') {
              zenClient.setBaseUrl('ollama', ollamaCustomUrl)
            }
            const ollamaKey = (typeof key === 'string' && key) ? key : ''
            if (ollamaKey) {
              zenClient.setApiKey('ollama', ollamaKey)
            }
            continue
          }

          if (key && typeof key === 'string') {
            zenClient.setApiKey(p.id, key)
            newApiKeys[p.id] = { key, isConfigured: true }
          }
        }

        setApiKeys(newApiKeys)

        const hasAnyKey = Object.values(newApiKeys).some(v => v.isConfigured)
        setHasApiKey(hasAnyKey)

        if (hasAnyKey) {
          // Validate configured providers in parallel, resolve on first success
          const configuredProviders = PROVIDER_REGISTRY.filter(p => newApiKeys[p.id]?.isConfigured)
          const validationResults = await Promise.allSettled(
            configuredProviders.map(p => zenClient.validateApiKey(p.id))
          )
          const anyValid = validationResults.some(
            r => r.status === 'fulfilled' && r.value === true
          )

          if (anyValid) {
            setIsReady(true)
            // Clear pending keys if they were used
            if (pendingApiKeys) {
              const pendingSaves = [window.artemis.store.set('pendingApiKeys', null)]
              for (const p of PROVIDER_REGISTRY) {
                const key = (pendingApiKeys as any)?.[p.id]
                if (key) pendingSaves.push(window.artemis.store.set(`apiKey:${p.id}`, key))
              }
              await Promise.all(pendingSaves)
            }
          } else {
            setError('Invalid API key(s). Please check your keys in Settings.')
          }
        }

        // Apply loaded preferences (already fetched in parallel above)
        if (savedMode === 'builder' || savedMode === 'planner' || savedMode === 'chat') {
          setAgentModeState(savedMode as AgentMode)
        }

        if (savedApproval === 'allow-all' || savedApproval === 'session-only' || savedApproval === 'ask') {
          setEditApprovalModeState(savedApproval as EditApprovalMode)
        }

        if (savedSounds && typeof savedSounds === 'object') {
          setSoundSettingsState({ ...DEFAULT_SOUND_SETTINGS, ...savedSounds as Partial<SoundSettings> })
        }
        
        if (savedModel && typeof savedModel === 'object') {
          if ('aiProvider' in (savedModel as object)) {
            setActiveModelState(savedModel as Model)
          } else {
            await window.artemis.store.set('activeModel', null)
          }
        }

        // Load sessions — only load messages for the ACTIVE session (lazy-load others)
        if (Array.isArray(savedSessions) && savedSessions.length > 0) {
          setSessions(savedSessions as ChatSession[])
          const firstSessionId = (savedSessions as ChatSession[])[0].id
          setActiveSessionId(firstSessionId)
          
          // Only load messages for the active session, not all sessions
          try {
            const activeMessages = await window.artemis.store.get(`messages-${firstSessionId}`)
            const messagesMap = new Map<string, ChatMessage[]>()
            messagesMap.set(firstSessionId, Array.isArray(activeMessages) ? activeMessages : [])
            setAllSessionMessages(messagesMap)
          } catch {
            setAllSessionMessages(new Map([[firstSessionId, []]]))
          }
        }
      } catch (err) {
        console.error('[useOpenCode] Initialization error:', err)
      }
    }
    
    initialize()
  }, [])

  // When active project changes, switch to the first session of that project
  useEffect(() => {
    if (!activeProjectId) return
    const projectSess = sessions.filter(s => s.projectId === activeProjectId)
    if (projectSess.length > 0) {
      // Select the most recent session for this project
      setActiveSessionId(projectSess[0].id)
      restoreSessionUsage(projectSess[0].id)
    }
    // Don't auto-create — App.tsx handles that
  }, [activeProjectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch models when ready
  useEffect(() => {
    if (isReady || hasApiKey) {
      refreshModels()
    }
  }, [isReady, hasApiKey])

  // Set API key for a specific provider
  const setApiKey = useCallback(async (provider: AIProvider, key: string): Promise<boolean> => {
    try {
      zenClient.setApiKey(provider, key)
      
      // Validate key
      const valid = await zenClient.validateApiKey(provider)
      
      if (valid) {
        await window.artemis.store.set(`apiKey:${provider}`, key)
        await window.artemis.store.set('pendingApiKeys', null)
        
        setApiKeys(prev => ({
          ...prev,
          [provider]: { key, isConfigured: true }
        }))
        
        // Check if we now have any valid keys
        const hasAnyKey = zenClient.hasApiKey() || provider === 'ollama'
        setHasApiKey(hasAnyKey)
        
        if (hasAnyKey) {
          setIsReady(true)
          setError(null)
          await refreshModels()
        }
        
        return true
      } else {
        const info = getProviderInfo(provider)
        setError(`Invalid API key for ${info?.name || provider}`)
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
          aiProvider: defaultModel.aiProvider,
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

  // Set edit approval mode
  const setEditApprovalMode = useCallback((mode: EditApprovalMode) => {
    setEditApprovalModeState(mode)
    window.artemis.store.set('editApprovalMode', mode).catch(err => {
      console.error('[useOpenCode] Error saving edit approval mode:', err)
    })
  }, [])

  // Restore to a specific checkpoint
  const restoreToCheckpoint = useCallback(async (checkpointId: string): Promise<{ restored: number; errors: string[] } | null> => {
    if (!activeSessionId) return null
    const cps = getCheckpoints(activeSessionId)
    const cp = cps.find(c => c.id === checkpointId)
    if (!cp) return null
    return restoreCheckpoint(cp)
  }, [activeSessionId])

  // Set sound settings
  const setSoundSettings = useCallback((settings: SoundSettings) => {
    setSoundSettingsState(settings)
    window.artemis.store.set('soundSettings', settings).catch(err => {
      console.error('[useOpenCode] Error saving sound settings:', err)
    })
  }, [])

  // Set project path for tool execution
  const setProjectPath = useCallback((path: string | null) => {
    projectPathRef.current = path
    setProjectPathState(path)
  }, [])

  // Helper: set the assistant message parts directly (preserves interleaved order)
  // Automatically preserves thinking/reasoning blocks that were set separately
  // Uses batched rAF updates to avoid Map cloning on every streaming delta
  const updateAssistantParts = useCallback((sessionId: string, parts: MessagePart[]) => {
    scheduleMessageUpdate(sessionId, (msgs) => {
      if (msgs.length === 0) return msgs
      
      const newMsgs = [...msgs]
      const lastIndex = newMsgs.length - 1
      if (newMsgs[lastIndex]?.role === 'assistant') {
        const existing = newMsgs[lastIndex].parts
        const thinkingPart = existing.find(p => p.type === 'thinking')
        const reasoningPart = existing.find(p => p.type === 'reasoning')
        const finalParts = [...parts]
        if (thinkingPart) finalParts.push(thinkingPart)
        if (reasoningPart) finalParts.push(reasoningPart)
        newMsgs[lastIndex] = { ...newMsgs[lastIndex], parts: finalParts }
      }
      
      return newMsgs
    })
  }, [scheduleMessageUpdate])

  // Helper: update thinking block in assistant message
  // Uses batched rAF updates to avoid Map cloning on every streaming delta
  const updateThinkingBlock = useCallback((sessionId: string, steps: AgentStep[], startTime: number, isComplete: boolean, reasoningContent?: string) => {
    scheduleMessageUpdate(sessionId, (msgs) => {
      if (msgs.length === 0) return msgs
      
      const newMsgs = [...msgs]
      const lastIndex = newMsgs.length - 1
      if (newMsgs[lastIndex]?.role === 'assistant') {
        const duration = Date.now() - startTime
        const existingParts = newMsgs[lastIndex].parts.filter(p => p.type !== 'thinking' && p.type !== 'reasoning')
        const newParts: MessagePart[] = [
          ...existingParts,
          {
            type: 'thinking',
            thinking: {
              steps,
              duration,
              isComplete,
            },
          },
        ]
        
        // Add reasoning content if present
        if (reasoningContent && reasoningContent.trim()) {
          newParts.push({
            type: 'reasoning',
            reasoning: {
              content: reasoningContent,
              isComplete,
            },
          })
        }
        
        newMsgs[lastIndex] = {
          ...newMsgs[lastIndex],
          parts: newParts,
        }
      }
      
      return newMsgs
    })
  }, [scheduleMessageUpdate])

  // Send message — uses the new provider-agnostic agent system
  // modeOverride: force a specific agent mode for this request (e.g. when switching from planner to builder)
  const sendMessage = useCallback(async (text: string, fileContext?: string, modeOverride?: AgentMode, planText?: string, images?: Array<{ id: string; url: string; name: string }>) => {
    if (!activeModel || (!text.trim() && !images)) {
      if (!activeModel) setError('Please select a model first')
      return
    }

    if (!zenClient.hasApiKey() && activeModel.aiProvider !== 'ollama') {
      setError('Please set your API key first')
      return
    }

    // Ensure we have a session
    let sessionId = activeSessionId
    if (!sessionId) {
      sessionId = createSession()
    }

    // Build user message parts - text + images
    const userParts: MessagePart[] = []
    if (text.trim()) {
      userParts.push({ type: 'text', text })
    }
    if (images && images.length > 0) {
      for (const img of images) {
        userParts.push({
          type: 'image',
          image: {
            url: img.url,
            mimeType: `image/${img.name.split('.').pop() || 'png'}`,
          },
        })
      }
    }

    // Create user message
    const userMsg: ChatMessage = {
      id: generateId('msg-'),
      sessionId,
      role: 'user',
      parts: userParts,
      createdAt: new Date().toISOString(),
      ...(planText ? { planText } : {}),
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

    // Update messages state for the current session + save immediately
    setAllSessionMessages(prev => {
      const currentSessionMessages = prev.get(sessionId!) || []
      const updated = new Map(prev)
      const newMsgs = [...currentSessionMessages, userMsg, assistantMsg]
      updated.set(sessionId!, newMsgs)
      saveMessages(sessionId!, newMsgs)
      return updated
    })
    setStreamingSessionIds(prev => { const next = new Set(prev); next.add(sessionId!); return next })
    setError(null)

    // ─── Build Provider Config ─────────────────────────────────
    const aiProvider = (activeModel.aiProvider || 'zen') as AIProvider
    const apiKey = await window.artemis.store.get(`apiKey:${aiProvider}`) as string || ''
    const providerInfo = getProviderInfo(aiProvider)
    const isZaiGlm = aiProvider === 'zai' && activeModel.id.startsWith('glm-')

    // Resolve base URL (custom for Ollama, registry for others)
    const baseUrl = zenClient.getBaseUrl(aiProvider)

    // Build provider-specific extra headers
    const extraHeaders: Record<string, string> = {}
    if (aiProvider === 'anthropic') {
      extraHeaders['anthropic-version'] = '2023-06-01'
    } else if (aiProvider === 'openrouter') {
      extraHeaders['HTTP-Referer'] = 'https://artemis.ide'
      extraHeaders['X-Title'] = 'Artemis IDE'
    }

    const providerConfig = {
      id: aiProvider,
      name: providerInfo?.name || aiProvider,
      baseUrl,
      apiKey,
      defaultFormat: (providerInfo?.defaultFormat || 'openai-chat') as 'openai-chat' | 'openai-responses' | 'anthropic-messages',
      ...(Object.keys(extraHeaders).length > 0 ? { extraHeaders } : {}),
    }

    // ─── Build Model Config ────────────────────────────────────
    // Z.AI GLM models use the Anthropic-compatible endpoint with mapped names
    const ZAI_GLM_NAME_MAP: Record<string, string> = {
      'glm-4.7': 'GLM-4.7', 'glm-4.7-free': 'GLM-4.7',
      'glm-4.6': 'GLM-4.6',
    }

    // Determine if this model needs a special endpoint format override
    const isAnthropicDirect = aiProvider === 'anthropic'

    // Use the model's supportsTools field if available, otherwise fall back to heuristic
    const NO_TOOL_PREFIXES = ['gemma-', 'gemma3n', 'gemma-3n', 'gemma-2-', 'gemma-3-']
    const modelIdLower = activeModel.id.toLowerCase()
    const supportsTools = activeModel.supportsTools !== undefined
      ? activeModel.supportsTools
      : !NO_TOOL_PREFIXES.some(p => modelIdLower.includes(p))

    const modelConfig = {
      id: activeModel.id,
      name: activeModel.name,
      maxTokens: activeModel.maxTokens || 4096,
      contextWindow: activeModel.contextWindow,
      supportsTools,
      ...(isZaiGlm ? {
        baseUrl: 'https://api.z.ai/api/anthropic/v1',
        endpointFormat: 'anthropic-messages' as const,
        apiModelId: ZAI_GLM_NAME_MAP[activeModel.id] || activeModel.id,
      } : {}),
      ...(isAnthropicDirect ? {
        endpointFormat: 'anthropic-messages' as const,
      } : {}),
    }

    // ─── Build System Prompt ───────────────────────────────────
    const effectiveMode = modeOverride || agentMode
    const modeConfig = AGENT_MODES[effectiveMode]
    const projectPath = projectPathRef.current
    let systemPrompt = modeConfig?.systemPromptAddition || ''

    if (projectPath) {
      systemPrompt += `\nThe user has the following project open: ${projectPath}`
      if (effectiveMode === 'planner') {
        systemPrompt += `\nYou are in PLANNER mode (read-only). You can read files, list directories, and search code to help the user plan and review. You CANNOT create, edit, or delete files, and you CANNOT run commands. If the user asks you to create or modify files, tell them to switch to Builder mode. Do NOT attempt to use write_file, str_replace, execute_command, or any write tools — they are not available to you.`
      } else {
        systemPrompt += `\nYou are an AI coding assistant working inside an IDE. You have access to the user's codebase. When the user asks you to create files, edit code, or do anything with their project, use your tools (write_file, str_replace, read_file, list_directory, execute_command, etc.) to actually do it — do NOT just output code in chat.`
        if (modeOverride && modeOverride !== agentMode) {
          systemPrompt += `\n\nIMPORTANT: The user has just switched from ${agentMode.toUpperCase()} mode to ${effectiveMode.toUpperCase()} mode. You now have full write access. IGNORE any previous assistant messages that say you are in read-only or planner mode — those are outdated. Proceed with implementing the requested changes using your tools.`
        }
      }

      // Auto-inject a compact directory listing so the model has context
      try {
        const entries = await window.artemis.fs.readDir(projectPath)
        const ignore = new Set(['node_modules', '.git', 'dist', 'dist-electron', '.next', '__pycache__', '.venv', 'venv', 'build', '.cache'])
        const listing = entries
          .filter(e => !ignore.has(e.name) && !e.name.startsWith('.'))
          .map(e => `${e.type === 'directory' ? '[DIR]' : '[FILE]'} ${e.name}`)
          .join('\n')
        if (listing) {
          systemPrompt += `\nProject files:\n${listing}`
        }
      } catch {}

      // ─── Hierarchical artemis.md Rules ─────────────────────────
      // 1) Project-root artemis.md (shared with team, committed to git)
      try {
        const artemisPath = `${projectPath}/artemis.md`.replace(/\\/g, '/')
        const artemisContent = await window.artemis.fs.readFile(artemisPath)
        if (artemisContent && artemisContent.trim()) {
          systemPrompt += `\n\n[Project Rules (artemis.md) — Always follow these instructions]\n${artemisContent.slice(0, 15000)}`
        }
      } catch {
        // artemis.md doesn't exist — that's fine
      }

      // 2) Personal rules from .artemis/rules (local, gitignored, edited in Settings)
      try {
        const personalRulesPath = `${projectPath}/.artemis/rules`.replace(/\\/g, '/')
        const personalRules = await window.artemis.fs.readFile(personalRulesPath)
        if (personalRules && personalRules.trim()) {
          systemPrompt += `\n\n[Personal Rules (.artemis/rules) — User-specific instructions, take priority]\n${personalRules.slice(0, 15000)}`
        }
      } catch {
        // .artemis/rules doesn't exist — that's fine
      }
    }

    // ─── Agent Tool Hints ─────────────────────────────────────────
    if (effectiveMode !== 'planner') {
      systemPrompt += `\nYou have access to web_search (DuckDuckGo, no API key) and fetch_url (fetch any web page) tools. Use web_search when the user asks you to look something up. Use fetch_url when the user shares a URL or you need to read a web page, docs, or article.`

      // Provider-specific docs search tool: scope fetch_url to the active provider's documentation
      if (providerInfo?.docsUrl) {
        systemPrompt += `\n\n## Provider Documentation Search\nThe current AI provider is **${providerInfo.name}**. When the user asks about this provider's API, models, capabilities, rate limits, or configuration, use fetch_url to consult the official documentation at: ${providerInfo.docsUrl}\nAlways prefer fetching from this official source over general web searches for provider-specific questions.`
      }
    }

    // ─── MCP Tool Awareness ──────────────────────────────────────
    try {
      const mcpTools = await window.artemis.mcp.getConnectedTools()
      if (mcpTools && mcpTools.length > 0) {
        const toolsByServer: Record<string, string[]> = {}
        for (const t of mcpTools) {
          if (!toolsByServer[t.serverId]) toolsByServer[t.serverId] = []
          toolsByServer[t.serverId].push(t.name)
        }
        const serverList = Object.entries(toolsByServer)
          .map(([sid, tools]) => `  - ${sid}: ${tools.join(', ')}`)
          .join('\n')
        systemPrompt += `\n\n## MCP Tools Available\nYou have Model Context Protocol (MCP) tools connected. These are SPECIALIZED tools that you MUST prefer over generic terminal commands (execute_command) when they cover the same functionality.\n\nConnected MCP servers and tools:\n${serverList}\n\nIMPORTANT: When the user asks for operations that an MCP tool can handle (e.g., git operations via git MCP, GitHub operations via GitHub MCP), ALWAYS use the MCP tool instead of execute_command. MCP tools provide structured, reliable output. The tool names in your tool list that start with "mcp_" are these MCP tools.`
      }
    } catch {
      // MCP tools not available — that's fine
    }

    // ─── URL Auto-Detection ───────────────────────────────────────
    const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi
    const detectedUrls = text.match(urlRegex)
    if (detectedUrls && detectedUrls.length > 0) {
      const uniqueUrls = [...new Set(detectedUrls)]
      systemPrompt += `\n\nThe user's message contains ${uniqueUrls.length === 1 ? 'a URL' : 'URLs'}. You SHOULD use the fetch_url tool to read ${uniqueUrls.length === 1 ? 'it' : 'them'} and incorporate the content into your response. URLs detected: ${uniqueUrls.join(', ')}`
    }

    // ─── Build Conversation History ────────────────────────────
    // Convert existing session messages to universal format for context
    const currentSessionMessages = allSessionMessages.get(sessionId) || []
    const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []

    for (const m of currentSessionMessages) {
      if (m.role !== 'user' && m.role !== 'assistant') continue

      const textContent = m.parts
        .filter(p => p.type === 'text')
        .map(p => p.text || '')
        .join('\n')
        .trim()

      // For assistant messages, include tool call summaries so the model
      // has context about what tools were previously executed
      const toolSummaries: string[] = []
      for (const p of m.parts) {
        if (p.type === 'tool-call' && p.toolCall) {
          toolSummaries.push(`[Called ${p.toolCall.name}(${JSON.stringify(p.toolCall.args).slice(0, 200)})]`)
        }
        if (p.type === 'tool-result' && p.toolResult) {
          const status = p.toolResult.success ? 'Success' : 'Failed'
          toolSummaries.push(`[${p.toolResult.name} ${status}: ${p.toolResult.output.slice(0, 200)}]`)
        }
      }

      const fullContent = [textContent, ...toolSummaries].filter(Boolean).join('\n')
      if (fullContent) {
        conversationHistory.push({
          role: m.role as 'user' | 'assistant',
          content: fullContent,
        })
      }
    }

    // ─── Build Agent Request ───────────────────────────────────
    const requestId = generateId('agent-')
    activeRequestsRef.current.set(sessionId!, requestId)

    const agentRequest = {
      requestId,
      userMessage: text,
      fileContext: fileContext || undefined,
      model: modelConfig,
      provider: providerConfig,
      systemPrompt,
      agentMode: effectiveMode,
      maxIterations: 50,
      projectPath: projectPath || undefined,
      conversationHistory,
      editApprovalMode,
    }

    // ─── Interleaved Parts Array ─────────────────────────────────
    // Parts are stored in chronological order: text → tool-call → tool-result → text → ...
    // This gives Windsurf-style interleaved rendering instead of text-on-top/tools-on-bottom
    const parts: MessagePart[] = [{ type: 'text', text: '' }]
    let reasoningContent = ''
    const apiUsageRef: { current: { promptTokens: number; completionTokens: number; totalTokens: number } | null } = { current: null }
    const agentSteps: AgentStep[] = []
    const thinkingStartTime = Date.now()
    let stepStartTime = thinkingStartTime
    let lastUpdateTime = 0
    const UPDATE_INTERVAL = 50
    // Track when text streaming actually starts (for accurate speed calculation)
    let textStreamStartTime: number | null = null
    // Sliding window for more accurate speed measurement (last 2 seconds)
    const speedWindow: { chars: number; time: number }[] = []

    // Get or create the current text part (last part if it's text, else new)
    const getTextPart = (): MessagePart => {
      const last = parts[parts.length - 1]
      if (last && last.type === 'text') return last
      const newPart: MessagePart = { type: 'text', text: '' }
      parts.push(newPart)
      return newPart
    }

    // Get total text content across all text parts (for token estimation)
    const getTotalText = (): string => {
      return parts.filter(p => p.type === 'text').map(p => p.text || '').join('')
    }

    const addStep = (type: AgentStep['type'], content: string, toolCall?: AgentStep['toolCall'], toolResult?: AgentStep['toolResult']) => {
      const now = Date.now()
      agentSteps.push({
        id: generateId('step-'),
        type,
        content,
        timestamp: now,
        duration: now - stepStartTime,
        toolCall,
        toolResult,
      })
      stepStartTime = now
      if (agentMode !== 'chat') {
        updateThinkingBlock(sessionId!, agentSteps, thinkingStartTime, false, reasoningContent)
      }
    }

    // ─── Create Checkpoint Before Agent Run ──────────────────────
    if (projectPath && agentMode !== 'chat') {
      try {
        // Collect files that were previously modified in this session
        const prevMessages = allSessionMessages.get(sessionId) || []
        const prevParts = prevMessages.flatMap(m => m.parts)
        const trackedFiles = extractModifiedFiles(prevParts)
        await createCheckpoint(sessionId!, assistantMsg.id, `Before: ${text.slice(0, 40)}${text.length > 40 ? '...' : ''}`, projectPath, trackedFiles.length > 0 ? trackedFiles : undefined)
      } catch (err) {
        console.warn('[useOpenCode] Failed to create checkpoint:', err)
      }
    }

    // ─── Set Up Event Listener ─────────────────────────────────
    const cleanupEvent = window.artemis.agent.onEvent(requestId, (event: any) => {
      const now = Date.now()

      switch (event.type) {
        case 'thinking':
          if (agentMode !== 'chat') {
            addStep('thinking', event.data.message || 'Analyzing the request and planning approach...')
          }
          break

        case 'text_delta': {
          const textPart = getTextPart()
          const content = event.data.content || ''
          textPart.text = (textPart.text || '') + content

          // Start tracking time when first text delta arrives
          if (!textStreamStartTime) {
            textStreamStartTime = now
          }

          // Add to sliding window (max 2 seconds)
          speedWindow.push({ chars: content.length, time: now })
          const twoSecondsAgo = now - 2000
          while (speedWindow.length > 0 && speedWindow[0].time < twoSecondsAgo) {
            speedWindow.shift()
          }

          // Update streaming speed using sliding window (~4 chars per token estimate)
          if (speedWindow.length > 0 && textStreamStartTime) {
            const windowChars = speedWindow.reduce((sum, entry) => sum + entry.chars, 0)
            const windowElapsed = (now - speedWindow[0].time) / 1000
            if (windowElapsed > 0.1) {
              const tokensPerSec = Math.round((windowChars / 3.5) / windowElapsed)
              setStreamingSpeed(tokensPerSec)
            }
          }

          if (now - lastUpdateTime >= UPDATE_INTERVAL) {
            lastUpdateTime = now
            updateAssistantParts(sessionId!, parts)
          }
          break
        }

        case 'reasoning_delta':
          reasoningContent += event.data.content || ''
          if (agentMode !== 'chat') {
            updateThinkingBlock(sessionId!, agentSteps, thinkingStartTime, false, reasoningContent)
          }
          break

        case 'tool_call_start':
          if (event.data.name) {
            const tcId = event.data.id || generateId('tc-')
            // Deduplicate: tool_call_start fires twice per tool (once during
            // streaming with id+name, once before execution with id+name+args).
            // If a part with the same id exists, update it instead of pushing a duplicate.
            const existingIdx = parts.findIndex(
              p => p.type === 'tool-call' && p.toolCall?.id === tcId
            )
            if (existingIdx >= 0) {
              // Merge in arguments that arrived with the second event
              parts[existingIdx] = {
                ...parts[existingIdx],
                toolCall: {
                  ...parts[existingIdx].toolCall!,
                  args: { ...parts[existingIdx].toolCall!.args, ...event.data.arguments },
                },
              }
            } else {
              addStep('tool-call', `Calling ${event.data.name}...`, {
                name: event.data.name,
                args: event.data.arguments || {},
              })
              parts.push({
                type: 'tool-call' as const,
                toolCall: {
                  id: tcId,
                  name: event.data.name,
                  args: event.data.arguments || {},
                },
              })
            }
            updateAssistantParts(sessionId!, parts)
          }
          break

        case 'tool_result':
          addStep('tool-result',
            `${event.data.name}: ${event.data.success ? 'Success' : 'Failed'}`,
            undefined,
            { success: event.data.success, output: (event.data.output || '').slice(0, 200) }
          )
          parts.push({
            type: 'tool-result' as const,
            toolResult: {
              id: event.data.id || generateId('tr-'),
              name: event.data.name,
              success: event.data.success,
              output: (event.data.output || '').slice(0, 5000),
            },
          })
          updateAssistantParts(sessionId!, parts)
          break

        case 'iteration_complete':
          // Save intermediate state
          setAllSessionMessages(prev => {
            const msgs = prev.get(sessionId!) || []
            saveMessages(sessionId!, msgs)
            return prev
          })
          break

        case 'tool_approval_required': {
          // Show approval prompt in chat as a special tool-call part
          playSound('action-required', soundSettings)
          showNotification('Artemis — Approval Required', `${event.data.toolName} needs your approval`, soundSettings)
          // Add an approval-pending part to the message
          parts.push({
            type: 'tool-call' as const,
            toolCall: {
              id: event.data.toolCallId || generateId('tc-'),
              name: event.data.toolName,
              args: { ...event.data.toolArgs, __approvalId: event.data.approvalId, __pendingApproval: true },
            },
          })
          updateAssistantParts(sessionId!, parts)
          break
        }

        case 'path_approval_required': {
          playSound('action-required', soundSettings)
          showNotification('Artemis — Path Access', 'Access to file outside project requested', soundSettings)
          parts.push({
            type: 'tool-call' as const,
            toolCall: {
              id: generateId('tc-'),
              name: 'path_approval',
              args: {
                __approvalId: event.data.approvalId,
                __pendingApproval: true,
                filePath: event.data.filePath,
                reason: event.data.reason,
              },
            },
          })
          updateAssistantParts(sessionId!, parts)
          break
        }

        case 'agent_complete':
          // Capture actual token usage from the API if available
          if (event.data.usage) {
            apiUsageRef.current = event.data.usage
          }
          break

        case 'agent_error':
          console.error('[Agent] Error:', event.data.error)
          playSound('error', soundSettings)
          showNotification('Artemis — Error', event.data.error || 'Agent encountered an error', soundSettings)
          break
      }
    })
    activeCleanupFnsRef.current.set(sessionId!, cleanupEvent)

    // ─── Run the Agent ─────────────────────────────────────────
    try {
      console.log('[useOpenCode] Starting agent run:', activeModel.name, 'via', aiProvider, isZaiGlm ? '(Z.AI Anthropic)' : '')
      const response = await window.artemis.agent.run(agentRequest)

      // Handle error from agent response
      if (response.error && !getTotalText().trim()) {
        getTextPart().text = `**Error:** ${response.error}`
      }

      // Handle empty response
      const hasToolParts = parts.some(p => p.type === 'tool-call' || p.type === 'tool-result')
      if (!getTotalText().trim() && !hasToolParts) {
        getTextPart().text = 'No response received. The model may be unavailable — try again or switch to a different model.'
      }

      // Final UI update with interleaved parts
      updateAssistantParts(sessionId!, parts)

      // ─── Finalize Thinking Block ───────────────────────────────
      const totalText = getTotalText()
      if (agentMode !== 'chat' && agentSteps.length > 0) {
        addStep('summary', totalText.slice(0, 150) + (totalText.length > 150 ? '...' : ''))
        updateThinkingBlock(sessionId!, agentSteps, thinkingStartTime, true, reasoningContent)
      }

      // Flush any pending rAF-batched updates before the final save
      // to ensure the thinking block's isComplete flag is in state
      flushMessageUpdates()

      // ─── Final Message Save ────────────────────────────────────
      setAllSessionMessages(prev => {
        const updated = new Map(prev)
        const sessionMsgs = [...(prev.get(sessionId!) || [])]
        const lastIndex = sessionMsgs.length - 1
        if (lastIndex >= 0 && sessionMsgs[lastIndex].role === 'assistant') {
          // Use interleaved parts + preserve thinking/reasoning
          const finalParts = [...parts]
          const existingThinking = sessionMsgs[lastIndex].parts.find(p => p.type === 'thinking')
          const existingReasoning = sessionMsgs[lastIndex].parts.find(p => p.type === 'reasoning')
          if (existingThinking) finalParts.push(existingThinking)
          if (existingReasoning) finalParts.push(existingReasoning)
          sessionMsgs[lastIndex] = { ...sessionMsgs[lastIndex], parts: finalParts }
        }
        saveMessages(sessionId!, sessionMsgs)
        updated.set(sessionId!, sessionMsgs)
        return updated
      })

      // ─── Token Usage (delegated to useTokenTracker) ──────────────
      // Use actual API usage when available, fall back to client-side estimation
      if (apiUsageRef.current && apiUsageRef.current.totalTokens > 0) {
        trackUsage(sessionId!, activeModel.id, 0, 0, undefined, undefined, apiUsageRef.current)
      } else {
        let totalInputChars = (systemPrompt || '').length + text.length + (fileContext || '').length
        for (const msg of conversationHistory) {
          totalInputChars += msg.content.length
        }
        for (const p of parts) {
          if (p.type === 'tool-call' && p.toolCall?.args) {
            totalInputChars += JSON.stringify(p.toolCall.args).length
          }
          if (p.type === 'tool-result' && p.toolResult?.output) {
            totalInputChars += p.toolResult.output.length
          }
        }
        trackUsage(sessionId!, activeModel.id, totalInputChars, totalText.length)
      }

      // ─── Play completion sound ──────────────────────────────────
      playSound('task-done', soundSettings)
      showNotification('Artemis — Task Complete', totalText.slice(0, 100) || 'Agent finished', soundSettings)

      // ─── Session Title ─────────────────────────────────────────
      if (currentSessionMessages.length <= 2) {
        setSessions(prev => {
          const updated = prev.map(s => {
            if (s.id === sessionId) {
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
        console.error('[useOpenCode] Agent error:', err)
        const errorMessage = err.message || 'Failed to send message'
        setError(errorMessage)

        setAllSessionMessages(prev => {
          const updated = new Map(prev)
          const sessionMsgs = [...(prev.get(sessionId!) || [])]
          const lastIndex = sessionMsgs.length - 1
          if (lastIndex >= 0 && sessionMsgs[lastIndex].role === 'assistant') {
            sessionMsgs[lastIndex] = {
              ...sessionMsgs[lastIndex],
              parts: [{ type: 'text', text: `**Error:** ${errorMessage}` }],
            }
          }
          saveMessages(sessionId!, sessionMsgs)
          updated.set(sessionId!, sessionMsgs)
          return updated
        })
      }
    } finally {
      cleanupEvent()
      activeCleanupFnsRef.current.delete(sessionId!)
      activeRequestsRef.current.delete(sessionId!)
      abortControllersRef.current.delete(sessionId!)
      setStreamingSessionIds(prev => { const next = new Set(prev); next.delete(sessionId!); return next })
      setStreamingSpeed(0)
    }
  }, [activeSessionId, activeModel, allSessionMessages, agentMode, soundSettings, createSession, saveMessages, saveSessions, updateAssistantParts, updateThinkingBlock, flushMessageUpdates, trackUsage])

  const abortMessage = useCallback(() => {
    if (!activeSessionId) return
    const requestId = activeRequestsRef.current.get(activeSessionId)
    if (requestId) {
      window.artemis.agent.abort(requestId).catch(() => {})
      activeRequestsRef.current.delete(activeSessionId)
    }
    const controller = abortControllersRef.current.get(activeSessionId)
    if (controller) {
      controller.abort()
      abortControllersRef.current.delete(activeSessionId)
    }
    // Clean up the event listener for this session
    const cleanupFn = activeCleanupFnsRef.current.get(activeSessionId)
    if (cleanupFn) {
      cleanupFn()
      activeCleanupFnsRef.current.delete(activeSessionId)
    }
    setStreamingSessionIds(prev => { const next = new Set(prev); next.delete(activeSessionId); return next })
  }, [activeSessionId])

  return {
    isReady,
    hasApiKey,
    error,
    setApiKey,
    apiKeys,
    sessions,
    projectSessions,
    activeSessionId,
    createSession,
    selectSession,
    deleteSession,
    renameSession,
    clearMessages,
    messages,
    isStreaming,
    streamingSessionIds,
    sendMessage,
    abortMessage,
    models,
    activeModel,
    setActiveModel,
    refreshModels,
    providers,
    agentMode,
    setAgentMode,
    editApprovalMode,
    setEditApprovalMode,
    soundSettings,
    setSoundSettings,
    checkpoints: activeSessionId ? getCheckpoints(activeSessionId) : [],
    restoreToCheckpoint,
    sessionTokenUsage,
    totalTokenUsage,
    streamingSpeed,
    projectTokenCount,
    setProjectPath,
  }
}
