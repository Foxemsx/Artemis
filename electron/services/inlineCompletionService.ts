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
 * - Max 1 concurrent request at a time
 * - Responses capped at ~200 tokens (short completions)
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

class InlineCompletionService {
  private config: InlineCompletionConfig = { ...DEFAULT_CONFIG }
  private apiKeys: Map<string, string> = new Map()
  private customBaseUrls: Map<string, string> = new Map()
  private currentRequest: { cancel: () => void } | null = null

  setConfig(config: Partial<InlineCompletionConfig>) {
    this.config = { ...this.config, ...config }
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
   * Request an inline completion from the configured AI model.
   */
  async complete(request: InlineCompletionRequest): Promise<InlineCompletionResult> {
    // Cancel any in-flight request
    if (this.currentRequest) {
      this.currentRequest.cancel()
      this.currentRequest = null
    }

    if (!this.config.enabled || !this.config.provider || !this.config.model) {
      return { completion: '' }
    }

    const provider = this.config.provider
    const baseUrl = this.getBaseUrl(provider)
    if (!baseUrl) return { completion: '' }

    // Build the completion prompt — instruct the model to continue the code
    const systemPrompt = `You are an intelligent code completion engine. Complete the code at the cursor position. Output ONLY the completion text — no explanations, no markdown, no code fences, no repeating existing code. Output 1-3 lines maximum. If there is nothing meaningful to complete, output nothing.`

    const userPrompt = `Language: ${request.language}\nFile: ${request.filepath}\n\nCode before cursor:\n\`\`\`\n${request.prefix}\n\`\`\`\n\nCode after cursor:\n\`\`\`\n${request.suffix.slice(0, 500)}\n\`\`\`\n\nContinue the code from where the cursor is. Output only the completion:`

    // Use Anthropic Messages API for anthropic provider, else OpenAI Chat
    if (provider === 'anthropic') {
      return this.completeAnthropic(baseUrl, systemPrompt, userPrompt)
    }
    return this.completeOpenAI(baseUrl, provider, systemPrompt, userPrompt)
  }

  private completeOpenAI(baseUrl: string, provider: string, system: string, user: string): Promise<InlineCompletionResult> {
    return new Promise((resolve) => {
      let cancelled = false
      this.currentRequest = {
        cancel: () => { cancelled = true },
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

      let data = ''
      req.on('response', (response) => {
        response.on('data', (chunk: Buffer) => { data += chunk.toString() })
        response.on('end', () => {
          if (cancelled) return resolve({ completion: '' })
          try {
            const json = JSON.parse(data)
            const text = json.choices?.[0]?.message?.content || ''
            resolve({ completion: this.cleanCompletion(text) })
          } catch {
            resolve({ completion: '' })
          }
        })
      })
      req.on('error', () => resolve({ completion: '' }))
      req.write(body)
      req.end()
    })
  }

  private completeAnthropic(baseUrl: string, system: string, user: string): Promise<InlineCompletionResult> {
    return new Promise((resolve) => {
      let cancelled = false
      this.currentRequest = {
        cancel: () => { cancelled = true },
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
      const headers = this.getHeaders('anthropic')
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)

      let data = ''
      req.on('response', (response) => {
        response.on('data', (chunk: Buffer) => { data += chunk.toString() })
        response.on('end', () => {
          if (cancelled) return resolve({ completion: '' })
          try {
            const json = JSON.parse(data)
            const text = json.content?.[0]?.text || ''
            resolve({ completion: this.cleanCompletion(text) })
          } catch {
            resolve({ completion: '' })
          }
        })
      })
      req.on('error', () => resolve({ completion: '' }))
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
