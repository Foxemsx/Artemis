import { net } from 'electron'

export interface CommitMessageConfig {
  enabled: boolean
  provider: string
  model: string
}

const DEFAULT_CONFIG: CommitMessageConfig = {
  enabled: false,
  provider: '',
  model: '',
}

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

class CommitMessageService {
  private config: CommitMessageConfig = { ...DEFAULT_CONFIG }
  private apiKeys: Map<string, string> = new Map()
  private customBaseUrls: Map<string, string> = new Map()

  setConfig(config: Partial<CommitMessageConfig>) {
    this.config = { ...this.config, ...config }
  }

  getConfig(): CommitMessageConfig {
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

  async generate(diff: string): Promise<{ message: string; error?: string }> {
    if (!this.config.enabled || !this.config.provider || !this.config.model) {
      return { message: '', error: 'Commit message generation is not configured. Set a provider and model in Settings > Source Control.' }
    }

    const provider = this.config.provider
    const baseUrl = this.getBaseUrl(provider)
    if (!baseUrl) return { message: '', error: 'Unknown provider' }

    const apiKey = this.apiKeys.get(provider)
    if (!apiKey && provider !== 'ollama') {
      return { message: '', error: `No API key configured for ${provider}` }
    }

    const truncatedDiff = diff.slice(0, 8000)
    const systemPrompt = `You are a commit message generator. Given a git diff, write a concise, conventional commit message. Follow the Conventional Commits format: type(scope): description. Common types: feat, fix, refactor, style, docs, test, chore, perf. Keep the first line under 72 characters. If the changes are complex, add a blank line followed by bullet points for details. Output ONLY the commit message — no explanations, no markdown fences, no quotes.`
    const userPrompt = `Generate a commit message for the following diff:\n\n${truncatedDiff}${diff.length > 8000 ? '\n\n... (diff truncated)' : ''}`

    const isZaiGlm = provider === 'zai' && this.config.model.startsWith('glm-')
    if (isZaiGlm) {
      return this.generateAnthropic('https://api.z.ai/api/anthropic/v1', systemPrompt, userPrompt, 'zai')
    } else if (provider === 'anthropic') {
      return this.generateAnthropic(baseUrl, systemPrompt, userPrompt)
    } else {
      return this.generateOpenAI(baseUrl, provider, systemPrompt, userPrompt)
    }
  }

  private generateOpenAI(baseUrl: string, provider: string, system: string, user: string): Promise<{ message: string; error?: string }> {
    return new Promise((resolve) => {
      const url = `${baseUrl}/chat/completions`
      const body = JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 256,
        temperature: 0.3,
        stream: false,
      })

      const req = net.request({ url, method: 'POST' })
      const headers = this.getHeaders(provider)
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)

      const timeout = setTimeout(() => {
        try { req.abort() } catch {}
        resolve({ message: '', error: 'Request timed out' })
      }, 15_000)

      let data = ''
      req.on('response', (response) => {
        response.on('data', (chunk: Buffer) => { data += chunk.toString() })
        response.on('end', () => {
          clearTimeout(timeout)
          try {
            const json = JSON.parse(data)
            if (json.error) {
              resolve({ message: '', error: json.error.message || 'API error' })
              return
            }
            const text = json.choices?.[0]?.message?.content || ''
            resolve({ message: text.trim() })
          } catch {
            resolve({ message: '', error: 'Failed to parse response' })
          }
        })
      })
      req.on('error', (err: any) => {
        clearTimeout(timeout)
        resolve({ message: '', error: err.message || 'Network error' })
      })
      req.write(body)
      req.end()
    })
  }

  private generateAnthropic(baseUrl: string, system: string, user: string, headerProvider: string = 'anthropic'): Promise<{ message: string; error?: string }> {
    return new Promise((resolve) => {
      const url = `${baseUrl}/messages`
      const body = JSON.stringify({
        model: this.config.model,
        system,
        messages: [{ role: 'user', content: user }],
        max_tokens: 256,
        temperature: 0.3,
        stream: false,
      })

      const req = net.request({ url, method: 'POST' })
      const apiKey = this.apiKeys.get(headerProvider) || ''
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      }
      if (apiKey) headers['x-api-key'] = apiKey
      for (const [k, v] of Object.entries(headers)) req.setHeader(k, v)

      const timeout = setTimeout(() => {
        try { req.abort() } catch {}
        resolve({ message: '', error: 'Request timed out' })
      }, 15_000)

      let data = ''
      req.on('response', (response) => {
        response.on('data', (chunk: Buffer) => { data += chunk.toString() })
        response.on('end', () => {
          clearTimeout(timeout)
          try {
            const json = JSON.parse(data)
            if (json.error || json.type === 'error') {
              resolve({ message: '', error: (json.error as any)?.message || 'Anthropic API error' })
              return
            }
            const text = json.content?.[0]?.text || ''
            resolve({ message: text.trim() })
          } catch {
            resolve({ message: '', error: 'Failed to parse response' })
          }
        })
      })
      req.on('error', (err: any) => {
        clearTimeout(timeout)
        resolve({ message: '', error: err.message || 'Network error' })
      })
      req.write(body)
      req.end()
    })
  }
}

export const commitMessageService = new CommitMessageService()
