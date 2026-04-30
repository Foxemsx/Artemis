
import type { StreamDelta, StreamToolCallDelta, ToolCall } from '../types'
import type { BaseProvider } from '../providers/BaseProvider'


export class SSEParser {
  private buffer: string = ''

  feed(chunk: string): string[] {
    this.buffer += chunk
    return this.drainCompleteEvents(false)
  }

  flush(): string[] {
    if (!this.buffer.trim()) {
      this.buffer = ''
      return []
    }
    return this.drainCompleteEvents(true)
  }

  private drainCompleteEvents(flush: boolean): string[] {
    const normalized = this.buffer.replace(/\r\n/g, '\n')
    const events: string[] = []
    let cursor = 0

    while (true) {
      const boundary = normalized.indexOf('\n\n', cursor)
      if (boundary === -1) break
      events.push(normalized.slice(cursor, boundary))
      cursor = boundary + 2
    }

    if (flush && cursor < normalized.length) {
      events.push(normalized.slice(cursor))
      cursor = normalized.length
    }

    this.buffer = normalized.slice(cursor)

    const payloads: string[] = []
    for (const event of events) {
      const dataLines: string[] = []
      for (const line of event.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) continue
        if (trimmed === 'data: [DONE]') continue
        if (trimmed.startsWith('data:')) {
          dataLines.push(trimmed.slice(5).trimStart())
        }
      }
      if (dataLines.length > 0) {
        payloads.push(dataLines.join('\n'))
      }
    }

    return payloads
  }

  reset(): void {
    this.buffer = ''
  }
}


export class ToolCallAccumulator {
  private pending: Map<number, { id?: string; name?: string; arguments: string }> = new Map()

  feed(deltas: StreamToolCallDelta[]): void {
    for (const delta of deltas) {
      const idx = delta.index
      const existing = this.pending.get(idx) || { arguments: '' }

      if (delta.id) {
        existing.id = delta.id
      }
      if (delta.name) {
        existing.name = delta.name
      }
      if (delta.arguments) {
        existing.arguments += delta.arguments
      }

      this.pending.set(idx, existing)
    }
  }

  flush(): ToolCall[] {
    const calls: ToolCall[] = []
    const entries = Array.from(this.pending.entries())

    for (const [index, tc] of entries) {
      if (!tc.name) continue
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
        id: tc.id || `tool-${index}`,
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
        continue
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
          if (delta.usage) {
            if (!this.usage) {
              this.usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            }
            this.usage.promptTokens += delta.usage.promptTokens
            this.usage.completionTokens += delta.usage.completionTokens
            this.usage.totalTokens += delta.usage.totalTokens
          }
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
