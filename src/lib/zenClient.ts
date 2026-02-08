/**
 * OpenCode Zen & Z.AI API Client
 * Provides model discovery, API key management, and validation.
 * All chat/streaming communication is handled by the agent system in electron/api/.
 */

const PROVIDER_BASE_URLS = {
  zen: 'https://opencode.ai/zen/v1',
  zai: 'https://api.z.ai/api/paas/v4',
} as const

type AIProvider = 'zen' | 'zai'

export interface ZenModel {
  id: string
  name: string
  provider: string
  endpoint: string
  free?: boolean
  pricing?: {
    input: number   // per 1M tokens
    output: number  // per 1M tokens
  }
  maxTokens?: number
  contextWindow?: number
  description?: string
  aiProvider: AIProvider  // 'zen' for OpenCode Zen, 'zai' for Z.AI
}

interface ZenError {
  type: 'auth' | 'billing' | 'rate_limit' | 'server' | 'network' | 'unknown'
  message: string
  details?: string
}

const MODEL_ENDPOINTS: Record<string, string> = {
  'gpt-5.2': '/responses',
  'gpt-5.2-codex': '/responses',
  'gpt-5.1': '/responses',
  'gpt-5.1-codex': '/responses',
  'gpt-5.1-codex-max': '/responses',
  'gpt-5.1-codex-mini': '/responses',
  'gpt-5': '/responses',
  'gpt-5-codex': '/responses',
  'gpt-5-nano': '/responses',
  'claude-opus-4-6': '/messages',
  'claude-opus-4-5': '/messages',
  'claude-opus-4-1': '/messages',
  'claude-sonnet-4-5': '/messages',
  'claude-sonnet-4': '/messages',
  'claude-haiku-4-5': '/messages',
  'claude-3-5-haiku': '/messages',
  'gemini-3-pro': '/models/gemini-3-pro',
  'gemini-3-flash': '/models/gemini-3-flash',
  'qwen3-coder': '/chat/completions',
  'minimax-m2.1': '/chat/completions',
  'minimax-m2.1-free': '/messages',
  'glm-4.7': '/chat/completions',
  'glm-4.7-free': '/chat/completions',
  'glm-4.6': '/chat/completions',
  'kimi-k2.5': '/chat/completions',
  'kimi-k2.5-free': '/chat/completions',
  'kimi-k2-thinking': '/chat/completions',
  'kimi-k2': '/chat/completions',
  'big-pickle': '/chat/completions',
  'trinity-large-preview-free': '/chat/completions',
  'alpha-g5': '/chat/completions',
  'alpha-free': '/chat/completions',
}

const FREE_MODELS = [
  'gpt-5-nano',
  'minimax-m2.1-free',
  'glm-4.7-free',
  'kimi-k2.5-free',
  'big-pickle',
  'trinity-large-preview-free',
  'alpha-free',
]

export const MODEL_METADATA: Record<string, { contextWindow: number; maxTokens: number; pricing?: { input: number; output: number }; description: string }> = {
  'gpt-5.2':           { contextWindow: 256000, maxTokens: 32768,  pricing: { input: 1.75,  output: 14.00 },  description: 'Most capable OpenAI model. Excellent at reasoning and code.' },
  'gpt-5.2-codex':     { contextWindow: 256000, maxTokens: 32768,  pricing: { input: 1.75,  output: 14.00 },  description: 'GPT 5.2 optimized for code generation and editing.' },
  'gpt-5.1':           { contextWindow: 256000, maxTokens: 32768,  pricing: { input: 1.07,  output: 8.50 },   description: 'High-performance reasoning model from OpenAI.' },
  'gpt-5.1-codex':     { contextWindow: 256000, maxTokens: 32768,  pricing: { input: 1.07,  output: 8.50 },   description: 'GPT 5.1 tuned for coding tasks with tool calling.' },
  'gpt-5.1-codex-max': { contextWindow: 256000, maxTokens: 65536,  pricing: { input: 1.25,  output: 10.00 },  description: 'Max context version of GPT 5.1 Codex.' },
  'gpt-5.1-codex-mini':{ contextWindow: 128000, maxTokens: 16384,  pricing: { input: 0.25,  output: 2.00 },   description: 'Smaller, faster GPT 5.1 Codex variant.' },
  'gpt-5':             { contextWindow: 128000, maxTokens: 16384,  pricing: { input: 1.07,  output: 8.50 },   description: 'Powerful general-purpose model from OpenAI.' },
  'gpt-5-codex':       { contextWindow: 128000, maxTokens: 16384,  pricing: { input: 1.07,  output: 8.50 },   description: 'GPT 5 optimized for code.' },
  'gpt-5-nano':        { contextWindow: 128000, maxTokens: 8192,   description: 'Free, lightweight GPT model for quick tasks.' },
  'claude-opus-4-6':   { contextWindow: 200000, maxTokens: 32000,  pricing: { input: 5.00,  output: 25.00 },  description: 'Most capable Claude model. Exceptional at complex tasks.' },
  'claude-opus-4-5':   { contextWindow: 200000, maxTokens: 32000,  pricing: { input: 5.00,  output: 25.00 },  description: 'Highly capable Claude with extended thinking support.' },
  'claude-opus-4-1':   { contextWindow: 200000, maxTokens: 32000,  pricing: { input: 15.00, output: 75.00 },  description: 'Previous generation Opus model.' },
  'claude-sonnet-4-5': { contextWindow: 200000, maxTokens: 16000,  pricing: { input: 3.00,  output: 15.00 },  description: 'Best balance of speed, intelligence, and cost.' },
  'claude-sonnet-4':   { contextWindow: 200000, maxTokens: 8192,   pricing: { input: 3.00,  output: 15.00 },  description: 'Fast, capable model ideal for most tasks.' },
  'claude-haiku-4-5':  { contextWindow: 200000, maxTokens: 8192,   pricing: { input: 1.00,  output: 5.00 },   description: 'Ultra-fast Claude for quick responses.' },
  'claude-3-5-haiku':  { contextWindow: 200000, maxTokens: 8192,   pricing: { input: 0.80,  output: 4.00 },   description: 'Claude 3.5 Haiku — fast and cost-effective.' },
  'gemini-3-pro':      { contextWindow: 1000000, maxTokens: 65536,  pricing: { input: 2.00,  output: 12.00 },  description: 'Google\'s most capable model. 1M token context.' },
  'gemini-3-flash':    { contextWindow: 1000000, maxTokens: 65536,  pricing: { input: 0.50,  output: 3.00 },   description: 'Ultra-fast Gemini with 1M context window.' },
  'minimax-m2.1':      { contextWindow: 1000000, maxTokens: 65536,  pricing: { input: 0.30,  output: 1.20 },   description: 'MiniMax M2.1 with 1M token context.' },
  'minimax-m2.1-free': { contextWindow: 245760,  maxTokens: 16384,  description: 'Free tier MiniMax M2.1.' },
  'glm-4.7':           { contextWindow: 128000, maxTokens: 16384,  pricing: { input: 0.60,  output: 2.20 },   description: 'Zhipu GLM 4.7 — strong multilingual model.' },
  'glm-4.7-free':      { contextWindow: 32000,  maxTokens: 4096,   description: 'Free tier GLM 4.7.' },
  'glm-4.6':           { contextWindow: 128000, maxTokens: 16384,  pricing: { input: 0.60,  output: 2.20 },   description: 'Previous generation GLM model.' },
  'kimi-k2.5':         { contextWindow: 131072, maxTokens: 16384,  pricing: { input: 0.60,  output: 3.00 },   description: 'Kimi K2.5 — fast and capable.' },
  'kimi-k2.5-free':    { contextWindow: 32000,  maxTokens: 4096,   description: 'Free tier Kimi K2.5.' },
  'kimi-k2-thinking':  { contextWindow: 131072, maxTokens: 16384,  pricing: { input: 0.40,  output: 2.50 },   description: 'Kimi K2 with extended reasoning.' },
  'kimi-k2':           { contextWindow: 131072, maxTokens: 16384,  pricing: { input: 0.40,  output: 2.50 },   description: 'Kimi K2 general-purpose model.' },
  'qwen3-coder':       { contextWindow: 131072, maxTokens: 32768,  pricing: { input: 0.45,  output: 1.50 },   description: 'Qwen3 Coder 480B — huge code-focused model.' },
  'big-pickle':                 { contextWindow: 128000, maxTokens: 8192,  description: 'OpenCode community free model.' },
  'trinity-large-preview-free': { contextWindow: 128000, maxTokens: 8192,  description: 'Trinity Large Preview — free experimental model.' },
  'alpha-g5':                   { contextWindow: 128000, maxTokens: 8192,  pricing: { input: 0.30,  output: 1.00 },  description: 'Alpha G5 — experimental model.' },
  'alpha-free':                 { contextWindow: 128000, maxTokens: 8192,  description: 'Alpha Free — free experimental model.' },
}

// ─── Error parser ───────────────────────────────────────────────────────────

function parseApiError(status: number, data: string, provider?: AIProvider): ZenError {
  try {
    const json = JSON.parse(data)
    const errorMsg = json.error?.message || json.message || json.detail || data

    if (status === 401 || errorMsg.toLowerCase().includes('unauthorized') || errorMsg.toLowerCase().includes('invalid api key')) {
      return {
        type: 'auth',
        message: 'Invalid or expired API key',
        details: provider === 'zai'
          ? 'Please check your Z.AI API key in Settings.'
          : 'Please check your API key in Settings. Make sure it starts with "zen-" for OpenCode Zen.',
      }
    }

    if (status === 402 || errorMsg.toLowerCase().includes('billing') || errorMsg.toLowerCase().includes('payment') || errorMsg.toLowerCase().includes('insufficient') || errorMsg.toLowerCase().includes('plan')) {
      return {
        type: 'billing',
        message: 'Billing issue - insufficient credits or plan mismatch',
        details: provider === 'zai'
          ? 'If you have a Z.AI Coding Plan (Lite/Pro/Max), Artemis now routes through the Coding Plan endpoint automatically. If this error persists:\n\n1. Verify your Coding Plan is active at z.ai/manage-apikey/subscription\n2. Check your 5-hour usage quota hasn\'t been exhausted\n3. Make sure your API key is correct in Settings\n\nThe quota resets automatically at the start of the next 5-hour cycle.'
          : 'Your account needs credits to use this model. Add billing at opencode.ai or try a free model.',
      }
    }

    if (status === 429 || errorMsg.toLowerCase().includes('rate limit') || errorMsg.toLowerCase().includes('rate_limit')) {
      return {
        type: 'rate_limit',
        message: 'Rate limit exceeded',
        details: 'You\'ve hit the rate limit for this model. Free models (like Kimi K2.5 Free, GLM 4.7 Free) have stricter rate limits even though they\'re free to use.\n\n- Wait 15-30 seconds and try again\n- Or switch to a paid model for higher limits\n- Free model limits reset automatically after a short cooldown',
      }
    }

    if (status >= 500 || errorMsg.toLowerCase().includes('unavailable') || errorMsg.toLowerCase().includes('overloaded')) {
      return {
        type: 'server',
        message: 'Model unavailable or overloaded',
        details: 'The model may be temporarily unavailable. Try again in a moment, or switch to a different model.',
      }
    }

    return {
      type: 'unknown',
      message: errorMsg || `Request failed with status ${status}`,
      details: data,
    }
  } catch {
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

// ─── ZenClient ──────────────────────────────────────────────────────────────

export class ZenClient {
  private apiKeys: Map<AIProvider, string> = new Map()

  private getDefaultProvider(): AIProvider {
    const configured = this.getConfiguredProviders()
    return configured.length > 0 ? configured[0] : 'zen'
  }

  setApiKey(provider: AIProvider, key: string) {
    this.apiKeys.set(provider, key)
  }

  hasApiKey(provider?: AIProvider): boolean {
    if (provider) {
      return this.apiKeys.has(provider) && !!this.apiKeys.get(provider)
    }
    return Array.from(this.apiKeys.values()).some(key => !!key)
  }

  getConfiguredProviders(): AIProvider[] {
    return Array.from(this.apiKeys.entries())
      .filter(([_, key]) => !!key)
      .map(([provider, _]) => provider)
  }

  private getHeaders(provider?: AIProvider): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const apiKey = this.apiKeys.get(provider || this.getDefaultProvider()) || null
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`
    }
    return headers
  }

  private async proxyRequest(url: string, method: string, body?: any, provider?: AIProvider): Promise<{ ok: boolean; status: number; data: any; error?: ZenError }> {
    try {
      const response = await window.artemis.zen.request({
        url,
        method,
        headers: this.getHeaders(provider),
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const error = parseApiError(response.status, response.data, provider)
        console.error(`[ZenClient] API Error:`, { provider, url, status: response.status, data: response.data, error })
        return { ok: false, status: response.status, data: response.data, error }
      }

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
          details: err.message || 'Failed to connect to AI provider. Check your internet connection.',
        },
      }
    }
  }

  private getModelEndpoint(modelId: string): string {
    return MODEL_ENDPOINTS[modelId] || '/chat/completions'
  }

  async getModels(): Promise<ZenModel[]> {
    const allModels: ZenModel[] = []
    const configuredProviders = this.getConfiguredProviders()

    if (configuredProviders.length === 0) {
      return this.getHardcodedModels()
    }

    for (const provider of configuredProviders) {
      const baseUrl = PROVIDER_BASE_URLS[provider]
      const result = await this.proxyRequest(`${baseUrl}/models`, 'GET', undefined, provider)

      if (!result.ok) {
        console.error(`[ZenClient] Error fetching models from ${provider}:`, result.error)
        continue
      }

      const data = result.data
      const modelList = Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : [])

      for (const model of modelList) {
        const id = model.id || model.model
        if (!id) continue

        if (id === 'claude-3-5-haiku') continue

        const meta = MODEL_METADATA[id]
        const zenModel: ZenModel = {
          id,
          name: model.name || this.formatModelName(id),
          provider: model.provider || this.getProviderFromModelId(id),
          endpoint: this.getModelEndpoint(id),
          free: FREE_MODELS.includes(id),
          aiProvider: provider,
          ...(meta && {
            maxTokens: meta.maxTokens,
            contextWindow: meta.contextWindow,
            pricing: meta.pricing,
            description: meta.description,
          }),
        }
        console.log(`[ZenClient] Fetched model:`, { id, name: zenModel.name, aiProvider: provider })
        allModels.push(zenModel)
      }
    }

    if (allModels.length === 0) {
      return this.getHardcodedModels()
    }

    allModels.sort((a, b) => {
      if (a.free && !b.free) return -1
      if (!a.free && b.free) return 1
      return a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)
    })

    return allModels
  }

  private formatModelName(id: string): string {
    const nameMap: Record<string, string> = {
      'gpt-5.2': 'GPT 5.2',
      'gpt-5.2-codex': 'GPT 5.2 Codex',
      'gpt-5.1': 'GPT 5.1',
      'gpt-5.1-codex': 'GPT 5.1 Codex',
      'gpt-5.1-codex-max': 'GPT 5.1 Codex Max',
      'gpt-5.1-codex-mini': 'GPT 5.1 Codex Mini',
      'gpt-5': 'GPT 5',
      'gpt-5-codex': 'GPT 5 Codex',
      'gpt-5-nano': 'GPT 5 Nano',
      'claude-opus-4-6': 'Claude Opus 4.6',
      'claude-opus-4-5': 'Claude Opus 4.5',
      'claude-opus-4-1': 'Claude Opus 4.1',
      'claude-sonnet-4-5': 'Claude Sonnet 4.5',
      'claude-sonnet-4': 'Claude Sonnet 4',
      'claude-haiku-4-5': 'Claude Haiku 4.5',
      'claude-3-5-haiku': 'Claude 3.5 Haiku',
      'gemini-3-pro': 'Gemini 3 Pro',
      'gemini-3-flash': 'Gemini 3 Flash',
      'minimax-m2.1': 'MiniMax M2.1',
      'minimax-m2.1-free': 'MiniMax M2.1 Free',
      'glm-4.7': 'GLM 4.7',
      'glm-4.7-free': 'GLM 4.7 Free',
      'glm-4.6': 'GLM 4.6',
      'kimi-k2.5': 'Kimi K2.5',
      'kimi-k2.5-free': 'Kimi K2.5 Free',
      'kimi-k2-thinking': 'Kimi K2 Thinking',
      'kimi-k2': 'Kimi K2',
      'qwen3-coder': 'Qwen3 Coder 480B',
      'big-pickle': 'Big Pickle',
      'trinity-large-preview-free': 'Trinity Large Preview Free',
      'alpha-g5': 'Alpha G5',
      'alpha-free': 'Alpha Free',
    }

    return nameMap[id] || id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  private getHardcodedModels(): ZenModel[] {
    const allModels: ZenModel[] = []
    const configuredProviders = this.getConfiguredProviders()

    for (const [id, endpoint] of Object.entries(MODEL_ENDPOINTS)) {
      const meta = MODEL_METADATA[id]

      let aiProvider: AIProvider = 'zen'
      if (id.startsWith('glm-') && configuredProviders.includes('zai')) {
        aiProvider = 'zai'
      }

      allModels.push({
        id,
        name: this.formatModelName(id),
        provider: this.getProviderFromModelId(id),
        endpoint,
        free: FREE_MODELS.includes(id),
        aiProvider,
        ...(meta && {
          maxTokens: meta.maxTokens,
          contextWindow: meta.contextWindow,
          pricing: meta.pricing,
          description: meta.description,
        }),
      })
    }

    allModels.sort((a, b) => {
      if (a.free && !b.free) return -1
      if (!a.free && b.free) return 1
      return a.provider.localeCompare(b.provider) || a.name.localeCompare(b.name)
    })

    return allModels
  }

  private getProviderFromModelId(modelId: string): string {
    if (modelId.startsWith('gpt')) return 'OpenAI'
    if (modelId.startsWith('claude')) return 'Anthropic'
    if (modelId.startsWith('gemini')) return 'Google'
    if (modelId.startsWith('minimax')) return 'MiniMax'
    if (modelId.startsWith('glm')) return 'Zhipu'
    if (modelId.startsWith('kimi')) return 'Moonshot'
    if (modelId.startsWith('qwen')) return 'Alibaba'
    return 'OpenCode'
  }

  async validateApiKey(provider?: AIProvider): Promise<boolean> {
    const aiProvider = provider || this.getDefaultProvider()
    if (!this.hasApiKey(aiProvider)) return false
    const baseUrl = PROVIDER_BASE_URLS[aiProvider]
    const result = await this.proxyRequest(`${baseUrl}/models`, 'GET', undefined, aiProvider)
    return result.ok
  }
}

// Singleton instance
export const zenClient = new ZenClient()
