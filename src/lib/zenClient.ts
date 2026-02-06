/**
 * OpenCode Zen API Client
 * Communication with OpenCode Zen API via Electron proxy (to bypass CORS)
 * 
 * API Endpoints:
 * - Models: https://opencode.ai/zen/v1/models
 * - Chat (OpenAI-compatible): https://opencode.ai/zen/v1/chat/completions
 * - Messages (Anthropic): https://opencode.ai/zen/v1/messages
 * - Responses (OpenAI): https://opencode.ai/zen/v1/responses
 */

const ZEN_BASE_URL = 'https://opencode.ai/zen/v1'

export interface ZenModel {
  id: string
  name: string
  provider: string
  endpoint: string
  free?: boolean
  pricing?: {
    input: number
    output: number
  }
}

export interface ZenMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface ZenChatRequest {
  model: string
  messages: ZenMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
  system?: string
}

export interface ZenChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: {
      role: 'assistant'
      content: string
    }
    finish_reason: string
  }[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface ZenStreamChunk {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    delta: {
      role?: 'assistant'
      content?: string
    }
    finish_reason: string | null
  }[]
}

// Error types for better UX
export interface ZenError {
  type: 'auth' | 'billing' | 'rate_limit' | 'server' | 'network' | 'unknown'
  message: string
  details?: string
}

// Model endpoint mapping based on provider
const MODEL_ENDPOINTS: Record<string, string> = {
  // OpenAI models use /responses
  'gpt-5.2': '/responses',
  'gpt-5.2-codex': '/responses',
  'gpt-5.1': '/responses',
  'gpt-5.1-codex': '/responses',
  'gpt-5.1-codex-max': '/responses',
  'gpt-5.1-codex-mini': '/responses',
  'gpt-5': '/responses',
  'gpt-5-codex': '/responses',
  'gpt-5-nano': '/responses',
  
  // Anthropic models use /messages
  'claude-sonnet-4-5': '/messages',
  'claude-sonnet-4': '/messages',
  'claude-haiku-4-5': '/messages',
  'claude-3-5-haiku': '/messages',
  'claude-opus-4-6': '/messages',
  'claude-opus-4-5': '/messages',
  'claude-opus-4-1': '/messages',
  
  // Google models use /models/{model}
  'gemini-3-pro': '/models/gemini-3-pro',
  'gemini-3-flash': '/models/gemini-3-flash',
  
  // OpenAI-compatible models use /chat/completions
  'minimax-m2.1': '/chat/completions',
  'minimax-m2.1-free': '/messages', // Uses Anthropic format
  'glm-4.7': '/chat/completions',
  'glm-4.7-free': '/chat/completions',
  'glm-4.6': '/chat/completions',
  'kimi-k2.5': '/chat/completions',
  'kimi-k2.5-free': '/chat/completions',
  'kimi-k2-thinking': '/chat/completions',
  'kimi-k2': '/chat/completions',
  'qwen3-coder': '/chat/completions',
  'big-pickle': '/chat/completions',
}

// Free models list
const FREE_MODELS = [
  'gpt-5-nano',
  'minimax-m2.1-free',
  'glm-4.7-free',
  'kimi-k2.5-free',
  'big-pickle',
]

// Parse API error response
function parseApiError(status: number, data: string): ZenError {
  // Try to parse JSON error
  try {
    const json = JSON.parse(data)
    const errorMsg = json.error?.message || json.message || json.detail || data
    
    if (status === 401 || errorMsg.toLowerCase().includes('unauthorized') || errorMsg.toLowerCase().includes('invalid api key')) {
      return {
        type: 'auth',
        message: 'Invalid or expired API key',
        details: 'Please check your API key in Settings. Make sure it starts with "zen-" for OpenCode Zen.',
      }
    }
    
    if (status === 402 || errorMsg.toLowerCase().includes('billing') || errorMsg.toLowerCase().includes('payment') || errorMsg.toLowerCase().includes('insufficient')) {
      return {
        type: 'billing',
        message: 'Billing issue - insufficient credits',
        details: 'Your account needs credits to use this model. Add billing at opencode.ai or try a free model.',
      }
    }
    
    if (status === 429 || errorMsg.toLowerCase().includes('rate limit')) {
      return {
        type: 'rate_limit',
        message: 'Rate limit exceeded',
        details: 'Too many requests. Please wait a moment and try again.',
      }
    }
    
    if (status >= 500) {
      return {
        type: 'server',
        message: 'Server error',
        details: 'OpenCode Zen is experiencing issues. Please try again later.',
      }
    }
    
    return {
      type: 'unknown',
      message: errorMsg || `Request failed with status ${status}`,
      details: data,
    }
  } catch {
    // Not JSON, return raw message
    if (status === 401) {
      return {
        type: 'auth',
        message: 'Invalid or expired API key',
        details: 'Please check your API key in Settings.',
      }
    }
    
    return {
      type: 'unknown',
      message: data || `Request failed with status ${status}`,
    }
  }
}

export class ZenClient {
  private apiKey: string | null = null

  setApiKey(key: string) {
    this.apiKey = key
  }

  getApiKey(): string | null {
    return this.apiKey
  }

  hasApiKey(): boolean {
    return !!this.apiKey
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    return headers
  }

  /**
   * Make a request via Electron proxy
   */
  private async proxyRequest(url: string, method: string, body?: any): Promise<{ ok: boolean; status: number; data: any; error?: ZenError }> {
    try {
      const response = await window.artemis.zen.request({
        url,
        method,
        headers: this.getHeaders(),
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const error = parseApiError(response.status, response.data)
        return { ok: false, status: response.status, data: response.data, error }
      }

      // Try to parse JSON
      let data = response.data
      try {
        data = JSON.parse(response.data)
      } catch {
        // Keep as string
      }

      return { ok: true, status: response.status, data }
    } catch (err: any) {
      return {
        ok: false,
        status: 0,
        data: null,
        error: {
          type: 'network',
          message: 'Network error',
          details: err.message || 'Failed to connect to OpenCode Zen. Check your internet connection.',
        },
      }
    }
  }

  /**
   * Fetch available models from Zen API
   */
  async getModels(): Promise<ZenModel[]> {
    const result = await this.proxyRequest(`${ZEN_BASE_URL}/models`, 'GET')
    
    if (!result.ok) {
      console.error('[ZenClient] Error fetching models:', result.error)
      // Return hardcoded models as fallback
      return this.getHardcodedModels()
    }
    
    const data = result.data
    const models: ZenModel[] = []
    
    if (Array.isArray(data)) {
      // Direct array of models
      for (const model of data) {
        models.push({
          id: model.id || model.model,
          name: model.name || model.id || model.model,
          provider: model.provider || this.getProviderFromModelId(model.id || model.model),
          endpoint: MODEL_ENDPOINTS[model.id] || '/chat/completions',
          free: FREE_MODELS.includes(model.id),
        })
      }
    } else if (data.data && Array.isArray(data.data)) {
      // OpenAI-style response
      for (const model of data.data) {
        models.push({
          id: model.id,
          name: model.name || model.id,
          provider: model.provider || this.getProviderFromModelId(model.id),
          endpoint: MODEL_ENDPOINTS[model.id] || '/chat/completions',
          free: FREE_MODELS.includes(model.id),
        })
      }
    }
    
    // If API doesn't return models, use hardcoded list
    if (models.length === 0) {
      return this.getHardcodedModels()
    }
    
    return models
  }

  /**
   * Hardcoded models list as fallback
   */
  private getHardcodedModels(): ZenModel[] {
    return [
      // Free models
      { id: 'gpt-5-nano', name: 'GPT 5 Nano', provider: 'OpenAI', endpoint: '/responses', free: true },
      { id: 'big-pickle', name: 'Big Pickle', provider: 'OpenCode', endpoint: '/chat/completions', free: true },
      { id: 'minimax-m2.1-free', name: 'MiniMax M2.1 Free', provider: 'MiniMax', endpoint: '/messages', free: true },
      { id: 'glm-4.7-free', name: 'GLM 4.7 Free', provider: 'Zhipu', endpoint: '/chat/completions', free: true },
      { id: 'kimi-k2.5-free', name: 'Kimi K2.5 Free', provider: 'Moonshot', endpoint: '/chat/completions', free: true },
      
      // Premium models
      { id: 'gpt-5.2', name: 'GPT 5.2', provider: 'OpenAI', endpoint: '/responses' },
      { id: 'gpt-5.2-codex', name: 'GPT 5.2 Codex', provider: 'OpenAI', endpoint: '/responses' },
      { id: 'gpt-5.1', name: 'GPT 5.1', provider: 'OpenAI', endpoint: '/responses' },
      { id: 'gpt-5.1-codex', name: 'GPT 5.1 Codex', provider: 'OpenAI', endpoint: '/responses' },
      { id: 'gpt-5.1-codex-max', name: 'GPT 5.1 Codex Max', provider: 'OpenAI', endpoint: '/responses' },
      { id: 'gpt-5.1-codex-mini', name: 'GPT 5.1 Codex Mini', provider: 'OpenAI', endpoint: '/responses' },
      { id: 'gpt-5', name: 'GPT 5', provider: 'OpenAI', endpoint: '/responses' },
      { id: 'gpt-5-codex', name: 'GPT 5 Codex', provider: 'OpenAI', endpoint: '/responses' },
      
      { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'Anthropic', endpoint: '/messages' },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'Anthropic', endpoint: '/messages' },
      { id: 'claude-opus-4-1', name: 'Claude Opus 4.1', provider: 'Anthropic', endpoint: '/messages' },
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'Anthropic', endpoint: '/messages' },
      { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider: 'Anthropic', endpoint: '/messages' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', provider: 'Anthropic', endpoint: '/messages' },
      { id: 'claude-3-5-haiku', name: 'Claude Haiku 3.5', provider: 'Anthropic', endpoint: '/messages' },
      
      { id: 'gemini-3-pro', name: 'Gemini 3 Pro', provider: 'Google', endpoint: '/models/gemini-3-pro' },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash', provider: 'Google', endpoint: '/models/gemini-3-flash' },
      
      { id: 'minimax-m2.1', name: 'MiniMax M2.1', provider: 'MiniMax', endpoint: '/chat/completions' },
      { id: 'glm-4.7', name: 'GLM 4.7', provider: 'Zhipu', endpoint: '/chat/completions' },
      { id: 'glm-4.6', name: 'GLM 4.6', provider: 'Zhipu', endpoint: '/chat/completions' },
      { id: 'kimi-k2.5', name: 'Kimi K2.5', provider: 'Moonshot', endpoint: '/chat/completions' },
      { id: 'kimi-k2-thinking', name: 'Kimi K2 Thinking', provider: 'Moonshot', endpoint: '/chat/completions' },
      { id: 'kimi-k2', name: 'Kimi K2', provider: 'Moonshot', endpoint: '/chat/completions' },
      { id: 'qwen3-coder', name: 'Qwen3 Coder 480B', provider: 'Alibaba', endpoint: '/chat/completions' },
    ]
  }

  private getProviderFromModelId(modelId: string): string {
    if (modelId.startsWith('gpt')) return 'OpenAI'
    if (modelId.startsWith('claude')) return 'Anthropic'
    if (modelId.startsWith('gemini')) return 'Google'
    if (modelId.startsWith('minimax')) return 'MiniMax'
    if (modelId.startsWith('glm')) return 'Zhipu'
    if (modelId.startsWith('kimi')) return 'Moonshot'
    if (modelId.startsWith('qwen')) return 'Alibaba'
    if (modelId === 'big-pickle') return 'OpenCode'
    return 'OpenCode'
  }

  /**
   * Send a chat message and get a response (non-streaming)
   */
  async chat(
    modelId: string,
    messages: ZenMessage[],
    options?: {
      system?: string
      maxTokens?: number
      temperature?: number
    }
  ): Promise<{ response?: ZenChatResponse; error?: ZenError }> {
    if (!this.apiKey) {
      return {
        error: {
          type: 'auth',
          message: 'API key not configured',
          details: 'Please add your API key in Settings to start chatting.',
        },
      }
    }

    const endpoint = MODEL_ENDPOINTS[modelId] || '/chat/completions'
    const url = `${ZEN_BASE_URL}${endpoint}`

    // Prepare messages with optional system prompt
    const allMessages: ZenMessage[] = []
    if (options?.system) {
      allMessages.push({ role: 'system', content: options.system })
    }
    allMessages.push(...messages)

    const body: ZenChatRequest = {
      model: modelId,
      messages: allMessages,
      stream: false,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
    }

    const result = await this.proxyRequest(url, 'POST', body)

    if (!result.ok) {
      return { error: result.error }
    }

    return { response: result.data }
  }

  /**
   * Send a chat message and stream the response
   */
  async *chatStream(
    modelId: string,
    messages: ZenMessage[],
    options?: {
      system?: string
      maxTokens?: number
      temperature?: number
      signal?: AbortSignal
    }
  ): AsyncGenerator<ZenStreamChunk | { error: ZenError }, void, unknown> {
    if (!this.apiKey) {
      yield {
        error: {
          type: 'auth',
          message: 'API key not configured',
          details: 'Please add your API key in Settings to start chatting.',
        },
      }
      return
    }

    const endpoint = MODEL_ENDPOINTS[modelId] || '/chat/completions'
    const url = `${ZEN_BASE_URL}${endpoint}`

    // Prepare messages with optional system prompt
    const allMessages: ZenMessage[] = []
    if (options?.system) {
      allMessages.push({ role: 'system', content: options.system })
    }
    allMessages.push(...messages)

    const body: ZenChatRequest = {
      model: modelId,
      messages: allMessages,
      stream: true,
      max_tokens: options?.maxTokens || 4096,
      temperature: options?.temperature,
    }

    // Generate unique request ID
    const requestId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    
    // Create a queue for chunks
    const chunks: (any | 'done' | { error: ZenError })[] = []
    let resolveNext: (() => void) | null = null
    let isDone = false

    // Listen for stream chunks
    const removeListener = window.artemis.zen.onStreamChunk(requestId, (data) => {
      if (data.type === 'done') {
        isDone = true
        chunks.push('done')
      } else if (data.type === 'error') {
        const error = parseApiError(data.status || 500, data.data || data.message || 'Unknown error')
        chunks.push({ error })
        isDone = true
      } else if (data.type === 'chunk') {
        // Parse SSE data
        const lines = data.data.split('\n')
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed === 'data: [DONE]') continue
          
          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6))
              chunks.push(json)
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
      
      // Wake up the generator if it's waiting
      if (resolveNext) {
        resolveNext()
        resolveNext = null
      }
    })

    // Start the streaming request
    window.artemis.zen.streamRequest({
      requestId,
      url,
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    })

    // Handle abort
    if (options?.signal) {
      options.signal.addEventListener('abort', () => {
        isDone = true
        if (resolveNext) {
          resolveNext()
          resolveNext = null
        }
      })
    }

    try {
      // Yield chunks as they arrive
      while (!isDone || chunks.length > 0) {
        if (chunks.length === 0) {
          // Wait for next chunk
          await new Promise<void>((resolve) => {
            resolveNext = resolve
            // Timeout to prevent infinite waiting
            setTimeout(resolve, 100)
          })
          continue
        }

        const chunk = chunks.shift()
        
        if (chunk === 'done') {
          break
        }
        
        if (chunk && typeof chunk === 'object') {
          if ('error' in chunk) {
            yield chunk as { error: ZenError }
            break
          }
          yield chunk as ZenStreamChunk
        }
      }
    } finally {
      removeListener()
    }
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.apiKey) return false

    const result = await this.proxyRequest(`${ZEN_BASE_URL}/models`, 'GET')
    return result.ok
  }
}

// Singleton instance
export const zenClient = new ZenClient()
