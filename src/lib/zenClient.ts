import type { AIProvider } from '../types'
import modelsConfig from './models.json'

const PROVIDER_BASE_URLS: Record<string, string> = {
  zen: 'https://opencode.ai/zen/v1',
  zai: 'https://api.z.ai/api/paas/v4',
  anthropic: 'https://api.anthropic.com/v1',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  deepseek: 'https://api.deepseek.com',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  perplexity: 'https://api.perplexity.ai',
  synthetic: 'https://api.synthetic.new/openai/v1',
  ollama: 'http://localhost:11434/v1',
}

export interface ProviderInfo {
  id: AIProvider
  name: string
  description: string
  docsUrl: string
  placeholder: string
  helpUrl: string
  /** Whether this provider supports listing models via API */
  supportsModelList: boolean
  /** Whether a custom base URL is configurable */
  customBaseUrl?: boolean
  /** Default endpoint format for this provider */
  defaultFormat: 'openai-chat' | 'openai-responses' | 'anthropic-messages'
  /** Validation endpoint path (relative to base URL) */
  validationPath: string
}

export const PROVIDER_REGISTRY: ProviderInfo[] = [
  {
    id: 'zen', name: 'OpenCode Zen',
    description: 'GPT, Claude, Gemini, DeepSeek, and 20+ models via OpenCode',
    docsUrl: 'https://opencode.ai/docs', helpUrl: 'https://opencode.ai',
    placeholder: 'zen-... or sk-...', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'zai', name: 'Z.AI (Coding Plan)',
    description: 'GLM 4.7 via Z.AI Coding Plan (Lite/Pro/Max)',
    docsUrl: 'https://z.ai/docs', helpUrl: 'https://z.ai/manage-apikey/apikey-list',
    placeholder: 'your Z.AI API key', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'anthropic', name: 'Anthropic',
    description: 'Claude Opus, Sonnet & Haiku — direct from Anthropic',
    docsUrl: 'https://docs.anthropic.com', helpUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-...', supportsModelList: true,
    defaultFormat: 'anthropic-messages', validationPath: '/models',
  },
  {
    id: 'openai', name: 'OpenAI',
    description: 'GPT-4o, o1, o3 and more — direct from OpenAI',
    docsUrl: 'https://platform.openai.com/docs', helpUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-...', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'openrouter', name: 'OpenRouter',
    description: 'Access 200+ models from every major provider through one API',
    docsUrl: 'https://openrouter.ai/docs', helpUrl: 'https://openrouter.ai/keys',
    placeholder: 'sk-or-v1-...', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'google', name: 'Google Gemini',
    description: 'Gemini Pro & Flash — 1M+ token context for full codebase reading',
    docsUrl: 'https://ai.google.dev/docs', helpUrl: 'https://aistudio.google.com/apikey',
    placeholder: 'AIza...', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'deepseek', name: 'DeepSeek',
    description: 'DeepSeek-V3/R1 — SOTA coding performance at very low cost',
    docsUrl: 'https://api-docs.deepseek.com', helpUrl: 'https://platform.deepseek.com/api_keys',
    placeholder: 'sk-...', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'groq', name: 'Groq',
    description: 'Ultra-low latency inference — ideal for fast agentic loops',
    docsUrl: 'https://console.groq.com/docs', helpUrl: 'https://console.groq.com/keys',
    placeholder: 'gsk_...', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'mistral', name: 'Mistral AI',
    description: 'Codestral & Mistral Large — strong European AI models',
    docsUrl: 'https://docs.mistral.ai', helpUrl: 'https://console.mistral.ai/api-keys',
    placeholder: 'your Mistral API key', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'moonshot', name: 'Moonshot AI (Kimi)',
    description: 'Kimi K2.5 — fast and capable from Moonshot AI',
    docsUrl: 'https://platform.moonshot.cn/docs', helpUrl: 'https://platform.moonshot.cn/console/api-keys',
    placeholder: 'sk-...', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'perplexity', name: 'Perplexity',
    description: 'Specialized for real-time web information and citations',
    docsUrl: 'https://docs.perplexity.ai', helpUrl: 'https://www.perplexity.ai/settings/api',
    placeholder: 'pplx-...', supportsModelList: false,
    defaultFormat: 'openai-chat', validationPath: '/chat/completions',
  },
  {
    id: 'synthetic', name: 'Synthetic',
    description: 'DeepSeek, Qwen, Kimi, GLM & more — OpenAI-compatible API with subscription tiers',
    docsUrl: 'https://dev.synthetic.new/docs/api/overview', helpUrl: 'https://dev.synthetic.new/docs/api/overview',
    placeholder: 'syn_...', supportsModelList: true,
    defaultFormat: 'openai-chat', validationPath: '/models',
  },
  {
    id: 'ollama', name: 'Ollama (Local)',
    description: 'Privacy-focused local models — runs on your machine, no API key needed',
    docsUrl: 'https://github.com/ollama/ollama/tree/main/docs', helpUrl: 'https://ollama.com/download',
    placeholder: 'no key needed (leave empty)', supportsModelList: true,
    customBaseUrl: true, defaultFormat: 'openai-chat', validationPath: '/models',
  },
]

export function getProviderInfo(id: AIProvider): ProviderInfo | undefined {
  return PROVIDER_REGISTRY.find(p => p.id === id)
}

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
  maxTokens?: number
  contextWindow?: number
  description?: string
  aiProvider: AIProvider
  supportsTools?: boolean
}

interface ZenError {
  type: 'auth' | 'billing' | 'rate_limit' | 'server' | 'network' | 'unknown'
  message: string
  details?: string
}

// Central model registry — edit src/lib/models.json to add/remove models
const zenModels = modelsConfig.zen as Array<{
  id: string; name: string; endpoint: string; free: boolean
  contextWindow: number; maxTokens: number
  pricing?: { input: number; output: number }; description?: string
  supports_tools?: boolean
}>

const MODEL_ENDPOINTS: Record<string, string> = Object.fromEntries(
  zenModels.map(m => [m.id, m.endpoint])
)

const FREE_MODELS = zenModels.filter(m => m.free).map(m => m.id)

const MODEL_NAME_MAP: Record<string, string> = Object.fromEntries(
  zenModels.map(m => [m.id, m.name])
)

export const MODEL_METADATA: Record<string, { contextWindow: number; maxTokens: number; pricing?: { input: number; output: number }; description: string; supportsTools?: boolean }> = Object.fromEntries(
  zenModels.map(m => [m.id, {
    contextWindow: m.contextWindow,
    maxTokens: m.maxTokens,
    ...(m.pricing && { pricing: m.pricing }),
    description: m.description || '',
    ...(m.supports_tools !== undefined && { supportsTools: m.supports_tools }),
  }])
)


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


export class ZenClient {
  private apiKeys: Map<AIProvider, string> = new Map()
  private customBaseUrls: Map<AIProvider, string> = new Map()

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

  setBaseUrl(provider: AIProvider, url: string) {
    this.customBaseUrls.set(provider, url)
  }

  getBaseUrl(provider: AIProvider): string {
    return this.customBaseUrls.get(provider) || PROVIDER_BASE_URLS[provider] || ''
  }

  private getHeaders(provider?: AIProvider): Record<string, string> {
    const p = provider || this.getDefaultProvider()
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const apiKey = this.apiKeys.get(p) || null

    if (p === 'anthropic') {
      if (apiKey) headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else if (p === 'openrouter') {
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
      headers['HTTP-Referer'] = 'https://artemis.ide'
      headers['X-Title'] = 'Artemis IDE'
    } else if (p === 'ollama') {
      // Ollama typically needs no auth
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    } else {
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
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

    // Separate providers that need API fetch from those using hardcoded models
    const hardcodedOnly: AIProvider[] = []
    const fetchable: { provider: AIProvider; modelsUrl: string }[] = []

    for (const provider of configuredProviders) {
      const info = getProviderInfo(provider)
      if (info && !info.supportsModelList) {
        hardcodedOnly.push(provider)
        continue
      }
      const baseUrl = this.getBaseUrl(provider)
      if (!baseUrl) continue
      fetchable.push({ provider, modelsUrl: `${baseUrl}/models` })
    }

    // Add hardcoded-only providers synchronously
    for (const provider of hardcodedOnly) {
      allModels.push(...this.getHardcodedModelsForProvider(provider))
    }

    // Fetch all API-based providers in parallel
    const results = await Promise.allSettled(
      fetchable.map(async ({ provider, modelsUrl }) => {
        const result = await this.proxyRequest(modelsUrl, 'GET', undefined, provider)
        return { provider, result }
      })
    )

    for (const settled of results) {
      if (settled.status === 'rejected') continue

      const { provider, result } = settled.value

      if (!result.ok) {
        console.error(`[ZenClient] Error fetching models from ${provider}:`, result.error)
        const hardcoded = this.getHardcodedModelsForProvider(provider)
        if (hardcoded.length > 0) allModels.push(...hardcoded)
        continue
      }

      const data = result.data
      const modelList = Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : [])

      for (const model of modelList) {
        const id = model.id || model.model
        if (!id) continue

        if (id === 'claude-3-5-haiku') continue

        const meta = MODEL_METADATA[id]

        // Determine tool support from API response or hardcoded metadata
        let supportsTools: boolean | undefined = meta?.supportsTools
        // OpenRouter includes supported_parameters array with 'tools' / 'tool_choice'
        if (model.supported_parameters && Array.isArray(model.supported_parameters)) {
          supportsTools = model.supported_parameters.includes('tools') || model.supported_parameters.includes('tool_choice')
        }

        const zenModel: ZenModel = {
          id,
          name: model.name || this.formatModelName(id),
          provider: model.provider || this.getProviderFromModelId(id, provider),
          endpoint: this.getModelEndpoint(id),
          free: FREE_MODELS.includes(id) || provider === 'ollama',
          aiProvider: provider,
          supportsTools,
          ...(meta && {
            maxTokens: meta.maxTokens,
            contextWindow: meta.contextWindow,
            pricing: meta.pricing,
            description: meta.description,
          }),
          // Use context_length from API if available and no hardcoded value
          ...(!meta?.contextWindow && model.context_length && { contextWindow: model.context_length }),
          // Use max_completion_tokens from API if available and no hardcoded value
          ...(!meta?.maxTokens && model.top_provider?.max_completion_tokens && {
            maxTokens: model.top_provider.max_completion_tokens,
          }),
          // Use pricing from OpenRouter API if available and no hardcoded pricing
          ...(!meta?.pricing && model.pricing && (parseFloat(model.pricing.prompt) > 0 || parseFloat(model.pricing.completion) > 0) && {
            pricing: {
              input: parseFloat(model.pricing.prompt) * 1_000_000,
              output: parseFloat(model.pricing.completion) * 1_000_000,
            },
          }),
          // Use description from API if available and no hardcoded description
          ...(!meta?.description && model.description && { description: model.description }),
        }
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
    return MODEL_NAME_MAP[id] || id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
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
        supportsTools: meta?.supportsTools,
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

  private getProviderFromModelId(modelId: string, aiProvider?: AIProvider): string {
    if (aiProvider) {
      const info = getProviderInfo(aiProvider)
      if (info) return info.name
    }
    if (modelId.startsWith('gpt') || modelId.startsWith('o1') || modelId.startsWith('o3')) return 'OpenAI'
    if (modelId.startsWith('claude')) return 'Anthropic'
    if (modelId.startsWith('gemini')) return 'Google'
    if (modelId.startsWith('minimax')) return 'MiniMax'
    if (modelId.startsWith('glm')) return 'Zhipu'
    if (modelId.startsWith('kimi') || modelId.startsWith('moonshot')) return 'Moonshot'
    if (modelId.startsWith('qwen')) return 'Alibaba'
    if (modelId.startsWith('deepseek')) return 'DeepSeek'
    if (modelId.startsWith('llama') || modelId.startsWith('mixtral') || modelId.startsWith('gemma')) return 'Meta/Google'
    if (modelId.startsWith('mistral') || modelId.startsWith('codestral')) return 'Mistral'
    if (modelId.startsWith('sonar') || modelId.startsWith('pplx')) return 'Perplexity'
    return 'OpenCode'
  }

  /** Return hardcoded model lists for providers that don't expose /models or as fallback.
   *  Models are loaded from src/lib/models.json — edit that file to add/remove models. */
  private getHardcodedModelsForProvider(provider: AIProvider): ZenModel[] {
    const models: ZenModel[] = []
    // OpenRouter and Ollama get models from their APIs; zen/zai use the zen model list
    if (provider === 'openrouter' || provider === 'ollama' || provider === 'zen' || provider === 'zai') {
      return models
    }

    const configModels = (modelsConfig as unknown as Record<string, Array<{
      id: string; name: string; provider: string; contextWindow: number; maxTokens: number
      pricing?: { input: number; output: number }; description?: string
      supports_tools?: boolean
    }>>)[provider]

    if (configModels) {
      for (const m of configModels) {
        models.push({
          id: m.id,
          name: m.name,
          provider: m.provider,
          endpoint: '/chat/completions',
          free: false,
          aiProvider: provider,
          contextWindow: m.contextWindow,
          maxTokens: m.maxTokens,
          pricing: m.pricing,
          description: m.description,
          supportsTools: m.supports_tools,
        })
      }
    }

    return models
  }

  async validateApiKey(provider?: AIProvider): Promise<boolean> {
    const aiProvider = provider || this.getDefaultProvider()

    // Ollama doesn't require a key — just check connectivity
    if (aiProvider === 'ollama') {
      const baseUrl = this.getBaseUrl('ollama')
      const result = await this.proxyRequest(`${baseUrl}/models`, 'GET', undefined, 'ollama')
      return result.ok
    }

    if (!this.hasApiKey(aiProvider)) return false

    const info = getProviderInfo(aiProvider)
    const baseUrl = this.getBaseUrl(aiProvider)
    if (!baseUrl) return false

    // Perplexity doesn't have a /models endpoint; validate with a minimal completion
    if (aiProvider === 'perplexity') {
      const result = await this.proxyRequest(`${baseUrl}/chat/completions`, 'POST', {
        model: 'sonar', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1,
      }, 'perplexity')
      return result.ok
    }

    const validationPath = info?.validationPath || '/models'
    const result = await this.proxyRequest(`${baseUrl}${validationPath}`, 'GET', undefined, aiProvider)
    return result.ok
  }
}

export const zenClient = new ZenClient()
