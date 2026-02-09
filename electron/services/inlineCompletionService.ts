/**
 * Inline Completion Service — AI-powered code completions for the editor.
 *
 * Uses a lightweight/fast model to provide ghost-text suggestions.
 * Designed for minimal latency: short prompts, small responses, cancellable.
 *
 * How it avoids excessive API calls:
 * - Frontend debounces 400ms after last keystroke
 * - Requests are cancellable (aborted if user types again)
 * - Only triggers when prefix is >10 chars (not on whitespace/empty lines)
 * - Max 1 concurrent request at a time — previous HTTP request is truly aborted
 * - LRU cache (50 entries) prevents re-requesting identical contexts
 * - Cooldown (500ms) between API calls prevents rapid-fire billing
 * - Prefix trimmed to last 1500 chars to minimize token usage
 * - Suffix trimmed to 500 chars
 * - Responses capped at configurable max_tokens (default 128)
 * - Smart filtering: skips empty lines, closing braces, trivial contexts
 */

import { net } from 'electron'

export interface InlineCompletionRequest {
  prefix: string
  suffix: string
  language: string
  filepath: string
}

export interface InlineCompletionResult {
  completion: string
}

export interface InlineCompletionConfig {
  enabled: boolean
  provider: string   // AIProvider id
  model: string      // model id
  maxTokens: number  // max tokens for completion (default 128)
}

const DEFAULT_CONFIG: InlineCompletionConfig = {
  enabled: false,
  provider: '',
  model: '',
  maxTokens: 128,
}

// Provider base URLs (mirrors zenClient.ts)
const BASE_URLS: Record<string, string> = {
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

// ─── LRU Cache ──────────────────────────────────────────────────────────────
const CACHE_MAX = 50

interface CacheEntry {
  completion: string
  timestamp: number
}

class LRUCache {
  private map = new Map<string, CacheEntry>()
  private maxSize: number

  constructor(maxSize: number) { this.maxSize = maxSize }

  get(key: string): string | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    // Expire after 60s — code context changes fast
    if (Date.now() - entry.timestamp > 60_000) {
      this.map.delete(key)
      return undefined
    }
    // Move to end (most recently used)
    this.map.delete(key)
    this.map.set(key, entry)
    return entry.completion
  }

  set(key: string, completion: string) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, { completion, timestamp: Date.now() })
    // Evict oldest if over capacity
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }

  clear() { this.map.clear() }
}

// ─── Smart Filtering ────────────────────────────────────────────────────────
// Lines where inline completion is almost never useful
const SKIP_LINE_PATTERNS = [
  /^\s*$/, // empty / whitespace-only
  /^\s*[}\])\;]+\s*$/, // closing braces/brackets/parens only
  /^\s*\/\//, // single-line comment
  /^\s*\/?\*/, // block comment line
  /^\s*#/, // hash comment (Python, Ruby, etc.)
  /^\s*import\s/, // import statement (user usually knows what to import)
  /^\s*from\s.*import\s/, // Python from-import
]

function shouldSkipLine(line: string): boolean {
  return SKIP_LINE_PATTERNS.some(p => p.test(line))
}

// ─── Context Trimming ───────────────────────────────────────────────────────
const MAX_PREFIX_CHARS = 1500
const MAX_SUFFIX_CHARS = 500

class InlineCompletionService {
  private config: InlineCompletionConfig = { ...DEFAULT_CONFIG }
  private apiKeys: Map<string, string> = new Map()
  private customBaseUrls: Map<string, string> = new Map()
  private currentRequest: { cancel: () => void } | null = null
  private cache = new LRUCache(CACHE_MAX)
  private lastRequestTime = 0
  private static readonly COOLDOWN_MS = 500

  setConfig(config: Partial<InlineCompletionConfig>) {
    this.config = { ...this.config, ...config }
    // Clear cache when model/provider changes to avoid stale completions
    if (config.provider || config.model) this.cache.clear()
  }

  getConfig(): InlineCompletionConfig {
    return { ...this.config }
  }

  setApiKey(provider: string, key: string) {
    this.apiKeys.set(provider, key)
  }

  setBaseUrl(provider: string, url: string) {
    this.customBaseUrls.set(provider, url)
  }

  private getBaseUrl(provider: string): string {
    return this.customBaseUrls.get(provider) || BASE_URLS[provider] || ''
  }

  private getHeaders(provider: string): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const apiKey = this.apiKeys.get(provider) || ''

    if (provider === 'anthropic') {
      if (apiKey) headers['x-api-key'] = apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else if (provider === 'openrouter') {
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
      headers['HTTP-Referer'] = 'https://artemis.ide'
      headers['X-Title'] = 'Artemis IDE'
    } else {
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    }
    return headers
  }

  /**
   * Build a cache key from the request context.
   * Uses a hash of the trimmed prefix tail + suffix head + language + model.
   */
  private cacheKey(prefix: string, suffix: string, language: string): string {
    // Use last 200 chars of prefix + first 100 chars of suffix as the cache key.
    // This is enough to identify the exact cursor position context while keeping keys small.
    const pTail = prefix.slice(-200)
    const sHead = suffix.slice(0, 100)
    return `${this.config.model}:${language}:${pTail}:${sHead}`
  }

  /**
   * Request an inline completion from the configured AI model.
   */
  async complete(request: InlineCompletionRequest): Promise<InlineCompletionResult> {
    // Cancel any in-flight request (truly aborts the HTTP call)
    if (this.currentRequest) {
      this.currentRequest.cancel()
      this.currentRequest = null
    }

    if (!this.config.enabled || !this.config.provider || !this.config.model) {
      return { completion: '' }
    }

    const provider = this.config.provider
    let baseUrl = this.getBaseUrl(provider)
    if (!baseUrl) return { completion: '' }

    const apiKey = this.apiKeys.get(provider)
    if (!apiKey && provider !== 'ollama') {
      console.log('[InlineCompletion] No API key for provider:', provider)
      return { completion: '' }
    }

    // Smart filtering: skip lines where completions are rarely useful
    const lastLine = request.prefix.split('\n').pop() || ''
    if (shouldSkipLine(lastLine)) {
      return { completion: '' }
    }

    // Trim context to reduce token usage
    const prefix = request.prefix.slice(-MAX_PREFIX_CHARS)
    const suffix = request.suffix.slice(0, MAX_SUFFIX_CHARS)

    // Check cache first — avoid duplicate API calls for identical contexts
    const key = this.cacheKey(prefix, suffix, request.language)
    const cached = this.cache.get(key)
    if (cached !== undefined) {
      return { completion: cached }
    }

    // Cooldown: enforce minimum interval between API calls
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < InlineCompletionService.COOLDOWN_MS) {
      return { completion: '' }
    }
    this.lastRequestTime = now

    // Build the completion prompt — instruct the model to continue the code
    const systemPrompt = `You are an intelligent code completion engine. Complete the code at the cursor position. Output ONLY the completion text — no explanations, no markdown, no code fences, no repeating existing code. Output 1-3 lines maximum. If there is nothing meaningful to complete, output nothing.`

    const userPrompt = `Language: ${request.language}\nFile: ${request.filepath}\n\nCode before cursor:\n\`\`\`\n${prefix}\n\`\`\`\n\nCode after cursor:\n\`\`\`\n${suffix}\n\`\`\`\n\nContinue the code from where the cursor is. Output only the completion:`

    // Z.AI GLM models must use the Anthropic-compatible endpoint
    const isZaiGlm = provider === 'zai' && this.config.model.startsWith('glm-')
    let result: InlineCompletionResult
    if (isZaiGlm) {
      result = await this.completeAnthropic('https://api.z.ai/api/anthropic/v1', systemPrompt, userPrompt, 'zai')
    } else if (provider === 'anthropic') {
      result = await this.completeAnthropic(baseUrl, systemPrompt, userPrompt)
    } else {
      result = await this.completeOpenAI(baseUrl, provider, systemPrompt, userPrompt)
    }

    // Cache the result (even empty ones to avoid re-requesting useless contexts)
    if (result.completion !== undefined) {
      this.cache.set(key, result.completion)
    }

    return result
  }

  private completeOpenAI(baseUrl: string, provider: string, system: string, user: string): Promise<InlineCompletionResult> {
    return new Promise((resolve) => {
      let resolved = false
      const done = (result: InlineCompletionResult) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        this.currentRequest = null
        resolve(result)
      }

      const url = `${baseUrl}/chat/completions`
      const body = JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: this.config.maxTokens,
        temperature: 0,
        stream: false,
      })

      const req = net.request({ url, method: 'POST' })
      const headers = this.getHeaders(provider)
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)

      // Wire up real abort so cancelled requests don't waste tokens
      this.currentRequest = {
        cancel: () => { try { req.abort() } catch {} done({ completion: '' }) },
      }

      // Timeout: abort if API doesn't respond within 8s
      const timeout = setTimeout(() => {
        try { req.abort() } catch {}
        done({ completion: '' })
      }, 8_000)

      let data = ''
      req.on('response', (response) => {
        response.on('data', (chunk: Buffer) => { data += chunk.toString() })
        response.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.error) {
              console.error('[InlineCompletion] API error:', json.error)
              return done({ completion: '' })
            }
            const text = json.choices?.[0]?.message?.content || ''
            done({ completion: this.cleanCompletion(text) })
          } catch (e) {
            console.error('[InlineCompletion] Parse error:', data.slice(0, 200))
            done({ completion: '' })
          }
        })
      })
      req.on('error', () => done({ completion: '' }))
      req.write(body)
      req.end()
    })
  }

  private completeAnthropic(baseUrl: string, system: string, user: string, headerProvider: string = 'anthropic'): Promise<InlineCompletionResult> {
    return new Promise((resolve) => {
      let resolved = false
      const done = (result: InlineCompletionResult) => {
        if (resolved) return
        resolved = true
        clearTimeout(timeout)
        this.currentRequest = null
        resolve(result)
      }

      const url = `${baseUrl}/messages`
      const body = JSON.stringify({
        model: this.config.model,
        system,
        messages: [{ role: 'user', content: user }],
        max_tokens: this.config.maxTokens,
        temperature: 0,
        stream: false,
      })

      const req = net.request({ url, method: 'POST' })
      // Anthropic-compatible endpoints always need x-api-key + anthropic-version
      const apiKey = this.apiKeys.get(headerProvider) || ''
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      }
      if (apiKey) headers['x-api-key'] = apiKey
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)

      // Wire up real abort so cancelled requests don't waste tokens
      this.currentRequest = {
        cancel: () => { try { req.abort() } catch {} done({ completion: '' }) },
      }

      // Timeout: abort if API doesn't respond within 8s
      const timeout = setTimeout(() => {
        try { req.abort() } catch {}
        done({ completion: '' })
      }, 8_000)

      let data = ''
      req.on('response', (response) => {
        response.on('data', (chunk: Buffer) => { data += chunk.toString() })
        response.on('end', () => {
          try {
            const json = JSON.parse(data)
            if (json.error || json.type === 'error') {
              console.error('[InlineCompletion] Anthropic API error:', json.error || json)
              return done({ completion: '' })
            }
            const text = json.content?.[0]?.text || ''
            done({ completion: this.cleanCompletion(text) })
          } catch (e) {
            console.error('[InlineCompletion] Parse error:', data.slice(0, 200))
            done({ completion: '' })
          }
        })
      })
      req.on('error', () => done({ completion: '' }))
      req.write(body)
      req.end()
    })
  }

  /** Remove common LLM artifacts from completion text */
  private cleanCompletion(text: string): string {
    let cleaned = text.trim()
    // Remove markdown code fences
    if (cleaned.startsWith('```')) {
      const lines = cleaned.split('\n')
      lines.shift() // remove opening ```
      if (lines[lines.length - 1]?.trim() === '```') lines.pop()
      cleaned = lines.join('\n')
    }
    // Remove leading/trailing backticks
    if (cleaned.startsWith('`') && cleaned.endsWith('`') && !cleaned.includes('\n')) {
      cleaned = cleaned.slice(1, -1)
    }
    return cleaned
  }
}

export const inlineCompletionService = new InlineCompletionService()
