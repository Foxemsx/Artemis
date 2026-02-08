/**
 * StreamParser — Parses SSE (Server-Sent Events) streams from any provider
 * and normalizes them into StreamDelta objects via the provider adapter.
 * 
 * Handles:
 * - SSE line buffering (data split across TCP chunks)
 * - JSON parsing with error recovery
 * - Provider-specific event normalization via adapter
 * - Tool call accumulation from streaming deltas
 */

import type { StreamDelta, StreamToolCallDelta, ToolCall } from '../types'
import type { BaseProvider } from '../providers/BaseProvider'

// ─── SSE Line Parser ─────────────────────────────────────────────────────────

export class SSEParser {
  private buffer: string = ''

  /**
   * Feed raw text data from the stream. Returns complete SSE data payloads.
   */
  feed(chunk: string): string[] {
    this.buffer += chunk
    const payloads: string[] = []

    // Process complete lines
    const lastNewline = this.buffer.lastIndexOf('\n')
    if (lastNewline === -1) return payloads

    const complete = this.buffer.slice(0, lastNewline + 1)
    this.buffer = this.buffer.slice(lastNewline + 1)

    const lines = complete.split('\n')
    for (const line of lines) {
      const trimmed = line.trim()

      // Skip empty lines, comments, event type lines
      if (!trimmed || trimmed.startsWith(':') || trimmed.startsWith('event:')) continue

      // End of stream marker
      if (trimmed === 'data: [DONE]') continue

      // Extract data payload
      if (trimmed.startsWith('data: ')) {
        payloads.push(trimmed.slice(6))
      }
    }

    return payloads
  }

  /** Flush any remaining buffered data */
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

// ─── Tool Call Accumulator ───────────────────────────────────────────────────

export class ToolCallAccumulator {
  private pending: Map<number, { id: string; name: string; arguments: string }> = new Map()

  /**
   * Feed a streaming tool call delta. Accumulates partial data.
   */
  feed(deltas: StreamToolCallDelta[]): void {
    for (const delta of deltas) {
      const idx = delta.index

      if (delta.id && delta.name) {
        // New tool call starting at this index
        this.pending.set(idx, {
          id: delta.id,
          name: delta.name,
          arguments: delta.arguments || '',
        })
      } else if (delta.arguments) {
        // Append arguments to existing tool call
        const existing = this.pending.get(idx)
        if (existing) {
          existing.arguments += delta.arguments
        }
      }
    }
  }

  /**
   * Get all completed tool calls and clear the accumulator.
   */
  flush(): ToolCall[] {
    const calls: ToolCall[] = []
    const entries = Array.from(this.pending.values())

    for (const tc of entries) {
      let args: Record<string, any> = {}
      try {
        args = JSON.parse(tc.arguments)
      } catch {
        // Try to repair common JSON issues
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

  /** Check if there are any pending tool calls being accumulated */
  hasPending(): boolean {
    return this.pending.size > 0
  }

  /** Get count of pending tool calls */
  getPendingCount(): number {
    return this.pending.size
  }

  /** Reset without returning */
  reset(): void {
    this.pending.clear()
  }
}

// ─── Stream Processor ────────────────────────────────────────────────────────

export interface StreamProcessorResult {
  /** Accumulated text content */
  content: string
  /** Accumulated reasoning/thinking content */
  reasoningContent: string
  /** Completed tool calls (populated when finishReason === 'tool_calls') */
  toolCalls: ToolCall[]
  /** How the stream ended */
  finishReason: StreamDelta['finishReason']
  /** Actual token usage from the API (when available) */
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * High-level stream processor that combines SSE parsing, provider normalization,
 * and tool call accumulation into a single interface.
 */
export class StreamProcessor {
  private sseParser = new SSEParser()
  private toolAccumulator = new ToolCallAccumulator()
  private content: string = ''
  private reasoningContent: string = ''
  private finishReason: StreamDelta['finishReason'] = null
  private usage: StreamProcessorResult['usage'] = undefined

  constructor(private adapter: BaseProvider) {}

  /**
   * Process a raw chunk of SSE data. Returns normalized deltas for UI streaming.
   */
  processChunk(rawText: string): StreamDelta[] {
    const payloads = this.sseParser.feed(rawText)
    const deltas: StreamDelta[] = []

    for (const payload of payloads) {
      let json: any
      try {
        json = JSON.parse(payload)
      } catch {
        continue // Skip malformed JSON
      }

      const delta = this.adapter.parseStreamEvent(json)
      if (!delta) continue

      // Accumulate content
      if (delta.content) {
        this.content += delta.content
      }
      if (delta.reasoningContent) {
        this.reasoningContent += delta.reasoningContent
      }

      // Accumulate tool calls
      if (delta.toolCalls) {
        this.toolAccumulator.feed(delta.toolCalls)
      }

      // Track finish reason
      if (delta.finishReason) {
        this.finishReason = delta.finishReason
      }

      // Accumulate usage (additive — Anthropic splits across message_start and message_delta)
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

  /**
   * Flush remaining data and get the complete result.
   */
  finish(): StreamProcessorResult {
    // Process any remaining SSE buffer
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

  /** Reset for reuse */
  reset(): void {
    this.sseParser.reset()
    this.toolAccumulator.reset()
    this.content = ''
    this.reasoningContent = ''
    this.finishReason = null
    this.usage = undefined
  }

  /** Get current accumulated content (for real-time UI updates) */
  getCurrentContent(): string {
    return this.content
  }

  /** Get current accumulated reasoning content */
  getCurrentReasoningContent(): string {
    return this.reasoningContent
  }
}

// ─── JSON Repair Utility ─────────────────────────────────────────────────────

function repairJson(text: string): string {
  let s = text.trim()
  // Fix literal newlines/tabs inside strings
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
  // Close unclosed structures
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
