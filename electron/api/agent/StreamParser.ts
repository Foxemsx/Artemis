
import type { StreamDelta, StreamToolCallDelta, ToolCall } from '../types'
import type { BaseProvider } from '../providers/BaseProvider'


export class SSEParser {
  private buffer: string = ''

  feed(chunk: string): string[] {
    this.buffer += chunk
    const payloads: string[] = []

    const lastNewline = this.buffer.lastIndexOf('\n')
    if (lastNewline === -1) return payloads

    const complete = this.buffer.slice(0, lastNewline + 1)
    this.buffer = this.buffer.slice(lastNewline + 1)

    const lines = complete.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()

      if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) continue

      if (trimmed === 'data: [DONE]') continue

      if (trimmed.startsWith('data: ')) {
        payloads.push(trimmed.slice(6))
      }
    }

    return payloads
  }

  flush(): string[] {
    if (!this.buffer.trim()) {
      this.buffer = ''
      return []
    }
    const remaining = this.buffer
    this.buffer = ''

    const payloads: string[] = []
    const lines = remaining.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) continue
      if (trimmed === 'data: [DONE]') continue
      if (trimmed.startsWith('data: ')) {
        payloads.push(trimmed.slice(6))
      }
    }
    return payloads
  }

  reset(): void {
    this.buffer = ''
  }
}


export class ToolCallAccumulator {
  private pending: Map<number, { id: string; name: string; arguments: string }> = new Map()

  feed(deltas: StreamToolCallDelta[]): void {
    for (const delta of deltas) {
      const idx = delta.index

      if (delta.id && delta.name) {
        this.pending.set(idx, {
          id: delta.id,
          name: delta.name,
          arguments: delta.arguments || '',
        })
      } else if (delta.arguments) {
        const existing = this.pending.get(idx)
        if (existing) {
          existing.arguments += delta.arguments
        }
      }
    }
  }

  flush(): ToolCall[] {
    const calls: ToolCall[] = []
    const entries = Array.from(this.pending.values())

    for (const tc of entries) {
      let args: Record<string, any> = {}
      try {
        args = JSON.parse(tc.arguments)
      } catch {
        try {
          args = JSON.parse(repairJson(tc.arguments))
        } catch {
          args = {}
        }
      }

      calls.push({
        id: tc.id,
        name: tc.name,
        arguments: args,
      })
    }

    this.pending.clear()
    return calls
  }

  hasPending(): boolean {
    return this.pending.size > 0
  }

  getPendingCount(): number {
    return this.pending.size
  }

  reset(): void {
    this.pending.clear()
  }
}


export interface StreamProcessorResult {
  content: string
  reasoningContent: string
  toolCalls: ToolCall[]
  finishReason: StreamDelta['finishReason']
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export class StreamProcessor {
  private sseParser = new SSEParser()
  private toolAccumulator = new ToolCallAccumulator()
  private content: string = ''
  private reasoningContent: string = ''
  private finishReason: StreamDelta['finishReason'] = null
  private usage: StreamProcessorResult['usage'] = undefined

  constructor(private adapter: BaseProvider) {}

  processChunk(rawText: string): StreamDelta[] {
    const payloads = this.sseParser.feed(rawText)
    const deltas: StreamDelta[] = []

    for (const payload of payloads) {
      let json: any
      try {
        json = JSON.parse(payload)
      } catch {
      }

      const delta = this.adapter.parseStreamEvent(json)
      if (!delta) continue

      if (delta.content) {
        this.content += delta.content
      }
      if (delta.reasoningContent) {
        this.reasoningContent += delta.reasoningContent
      }

      if (delta.toolCalls) {
        this.toolAccumulator.feed(delta.toolCalls)
      }

      if (delta.finishReason) {
        this.finishReason = delta.finishReason
      }

      if (delta.usage) {
        if (!this.usage) {
          this.usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
        }
        this.usage.promptTokens += delta.usage.promptTokens
        this.usage.completionTokens += delta.usage.completionTokens
        this.usage.totalTokens += delta.usage.totalTokens
      }

      deltas.push(delta)
    }

    return deltas
  }

  finish(): StreamProcessorResult {
    const remaining = this.sseParser.flush()
    for (const payload of remaining) {
      try {
        const json = JSON.parse(payload)
        const delta = this.adapter.parseStreamEvent(json)
        if (delta) {
          if (delta.content) this.content += delta.content
          if (delta.reasoningContent) this.reasoningContent += delta.reasoningContent
          if (delta.toolCalls) this.toolAccumulator.feed(delta.toolCalls)
          if (delta.finishReason) this.finishReason = delta.finishReason
        }
      } catch {}
    }

    return {
      content: this.content,
      reasoningContent: this.reasoningContent,
      toolCalls: this.toolAccumulator.flush(),
      finishReason: this.finishReason,
      usage: this.usage,
    }
  }

  reset(): void {
    this.sseParser.reset()
    this.toolAccumulator.reset()
    this.content = ''
    this.reasoningContent = ''
    this.finishReason = null
    this.usage = undefined
  }

  getCurrentContent(): string {
    return this.content
  }

  getCurrentReasoningContent(): string {
    return this.reasoningContent
  }
}


function repairJson(text: string): string {
  let s = text.trim()
  const r: string[] = []
  let inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (esc) { esc = false; r.push(ch); continue }
    if (ch === '\\' && inStr) { esc = true; r.push(ch); continue }
    if (ch === '"') { inStr = !inStr; r.push(ch); continue }
    if (inStr) {
      if (ch === '\n') { r.push('\\n'); continue }
      if (ch === '\r') { r.push('\\r'); continue }
      if (ch === '\t') { r.push('\\t'); continue }
      if (ch.charCodeAt(0) < 32) continue
    }
    r.push(ch)
  }
  s = r.join('')
  s = s.replace(/,\s*([}\]])/g, '$1')
  inStr = false; esc = false
  let braces = 0, brackets = 0
  for (const ch of s) {
    if (esc) { esc = false; continue }
    if (ch === '\\' && inStr) { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') braces++; else if (ch === '}') braces--
    if (ch === '[') brackets++; else if (ch === ']') brackets--
  }
  if (inStr) s += '"'
  while (brackets > 0) { s += ']'; brackets-- }
  while (braces > 0) { s += '}'; braces-- }
  return s
}
