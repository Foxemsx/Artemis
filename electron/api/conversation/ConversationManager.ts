/**
 * ConversationManager — Maintains conversation history in universal format.
 * 
 * All messages are stored as UniversalMessage. Conversion to provider-specific
 * formats happens only at the moment of sending an API request, handled by
 * the provider adapter. This ensures a single source of truth.
 */

import type { UniversalMessage, ToolCall, ToolResult } from '../types'

export class ConversationManager {
  private messages: UniversalMessage[] = []
  private maxContextTokens: number = 128_000
  private estimatedTokens: number = 0

  constructor(initialHistory?: UniversalMessage[]) {
    if (initialHistory) {
      this.messages = [...initialHistory]
      this.estimatedTokens = this.estimateTokens(this.messages)
    }
  }

  /** Get the full conversation history */
  getMessages(): UniversalMessage[] {
    return [...this.messages]
  }

  /** Get message count */
  getMessageCount(): number {
    return this.messages.length
  }

  /** Set the context window limit (in tokens) */
  setMaxContextTokens(limit: number): void {
    this.maxContextTokens = limit
  }

  /** Add a user message */
  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content })
    this.estimatedTokens += this.estimateMessageTokens(content)
    this.trimIfNeeded()
  }

  /** Add an assistant message (text-only, no tool calls) */
  addAssistantMessage(content: string): void {
    this.messages.push({ role: 'assistant', content })
    this.estimatedTokens += this.estimateMessageTokens(content)
    this.trimIfNeeded()
  }

  /** Add an assistant message that includes tool calls */
  addAssistantToolCallMessage(content: string, toolCalls: ToolCall[]): void {
    this.messages.push({
      role: 'assistant',
      content,
      toolCalls,
    })
    const tcText = toolCalls.map(tc => `${tc.name}(${JSON.stringify(tc.arguments)})`).join(' ')
    this.estimatedTokens += this.estimateMessageTokens(content + tcText)
    this.trimIfNeeded()
  }

  /** Add a tool result message */
  addToolResult(result: ToolResult): void {
    this.messages.push({
      role: 'tool',
      content: result.output,
      toolCallId: result.toolCallId,
      toolName: result.toolName,
    })
    this.estimatedTokens += this.estimateMessageTokens(result.output)
    this.trimIfNeeded()
  }

  /** Add multiple tool results (one message per result) */
  addToolResults(results: ToolResult[]): void {
    for (const result of results) {
      this.addToolResult(result)
    }
  }

  /** Replace the full message history (e.g. when restoring from persistence) */
  replaceHistory(messages: UniversalMessage[]): void {
    this.messages = [...messages]
    this.estimatedTokens = this.estimateTokens(this.messages)
  }

  /** Clear all messages */
  clear(): void {
    this.messages = []
    this.estimatedTokens = 0
  }

  /** Get estimated token count */
  getEstimatedTokens(): number {
    return this.estimatedTokens
  }

  /**
   * Trim conversation history to fit within context window.
   * Strategy: keep system messages and the most recent messages.
   * Removes oldest non-system messages first.
   */
  private trimIfNeeded(): void {
    if (this.estimatedTokens <= this.maxContextTokens) return

    // Keep at least the last 4 messages (current exchange + tool results)
    const minKeep = 4
    if (this.messages.length <= minKeep) return

    // Remove from the front (oldest), but never remove system messages
    while (this.estimatedTokens > this.maxContextTokens && this.messages.length > minKeep) {
      const removed = this.messages[0]
      if (removed.role === 'system') {
        // Don't remove system messages — move past them
        if (this.messages.length > minKeep + 1) {
          const msg = this.messages.splice(1, 1)[0]
          this.estimatedTokens -= this.estimateMessageTokens(msg.content)
        } else {
          break
        }
      } else {
        this.messages.shift()
        this.estimatedTokens -= this.estimateMessageTokens(removed.content)
      }
    }

    // Ensure token count doesn't go negative
    if (this.estimatedTokens < 0) {
      this.estimatedTokens = this.estimateTokens(this.messages)
    }
  }

  /** Rough token estimate: ~4 chars per token */
  private estimateMessageTokens(content: string): number {
    return Math.ceil((content || '').length / 4)
  }

  /** Estimate total tokens for a message array */
  private estimateTokens(messages: UniversalMessage[]): number {
    return messages.reduce((sum, m) => sum + this.estimateMessageTokens(m.content), 0)
  }

  /**
   * Get a serializable snapshot of the conversation for persistence.
   */
  toJSON(): UniversalMessage[] {
    return this.messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.toolCalls && { toolCalls: m.toolCalls }),
      ...(m.toolCallId && { toolCallId: m.toolCallId }),
      ...(m.toolName && { toolName: m.toolName }),
    }))
  }

  /**
   * Restore from a serialized snapshot.
   */
  static fromJSON(data: UniversalMessage[]): ConversationManager {
    return new ConversationManager(data)
  }
}
