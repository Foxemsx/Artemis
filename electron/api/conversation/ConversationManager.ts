
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

  getMessages(): UniversalMessage[] {
    return [...this.messages]
  }

  getMessageCount(): number {
    return this.messages.length
  }

  setMaxContextTokens(limit: number): void {
    this.maxContextTokens = limit
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: 'user', content })
    this.estimatedTokens += this.estimateMessageTokens(content)
    this.trimIfNeeded()
  }

  addAssistantMessage(content: string): void {
    this.messages.push({ role: 'assistant', content })
    this.estimatedTokens += this.estimateMessageTokens(content)
    this.trimIfNeeded()
  }

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

  addToolResults(results: ToolResult[]): void {
    for (const result of results) {
      this.addToolResult(result)
    }
  }

  replaceHistory(messages: UniversalMessage[]): void {
    this.messages = [...messages]
    this.estimatedTokens = this.estimateTokens(this.messages)
  }

  clear(): void {
    this.messages = []
    this.estimatedTokens = 0
  }

  getEstimatedTokens(): number {
    return this.estimatedTokens
  }

  private trimIfNeeded(): void {
    if (this.estimatedTokens <= this.maxContextTokens) return

    const minKeep = 4
    if (this.messages.length <= minKeep) return

    const maxIterations = this.messages.length - minKeep
    let iterations = 0

    while (this.estimatedTokens > this.maxContextTokens && this.messages.length > minKeep && iterations < maxIterations) {
      iterations++
      const removed = this.messages[0]
      if (removed.role === 'system') {
        let foundNonSystem = false
        for (let i = 1; i < this.messages.length - minKeep + 1; i++) {
          if (this.messages[i].role !== 'system') {
            const msg = this.messages.splice(i, 1)[0]
            this.estimatedTokens -= this.estimateMessageTokens(msg.content)
            foundNonSystem = true
            break
          }
        }
        if (!foundNonSystem) break
      } else {
        this.messages.shift()
        this.estimatedTokens -= this.estimateMessageTokens(removed.content)
      }
    }

    if (this.estimatedTokens < 0) {
      this.estimatedTokens = this.estimateTokens(this.messages)
    }
  }

  private estimateMessageTokens(content: string): number {
    return Math.ceil((content || '').length / 4)
  }

  private estimateTokens(messages: UniversalMessage[]): number {
    return messages.reduce((sum, m) => sum + this.estimateMessageTokens(m.content), 0)
  }

  toJSON(): UniversalMessage[] {
    return this.messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.toolCalls && { toolCalls: m.toolCalls }),
      ...(m.toolCallId && { toolCallId: m.toolCallId }),
      ...(m.toolName && { toolName: m.toolName }),
    }))
  }

  static fromJSON(data: UniversalMessage[]): ConversationManager {
    return new ConversationManager(data)
  }
}
