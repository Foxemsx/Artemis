/**
 * TODO Plan Parser — Extracts structured TODO/plan items from AI messages.
 * Looks for numbered lists, checkbox patterns, and bullet plans.
 */

export interface TodoItem {
  id: string
  text: string
  status: 'pending' | 'in_progress' | 'done'
  index: number
}

export interface TodoPlan {
  sessionId: string
  messageId: string
  items: TodoItem[]
  timestamp: number
  title: string
}

/**
 * Extract TODO items from a message text.
 * Recognizes patterns like:
 *   1. Do something
 *   - [ ] Do something
 *   - [x] Done thing
 *   - **Step 1**: Do something
 *   TODO: something
 */
export function extractTodoPlan(text: string, sessionId: string, messageId: string): TodoPlan | null {
  const items: TodoItem[] = []
  const lines = text.split('\n')
  let planTitle = 'Plan'

  // Try to find a title line before the list
  for (const line of lines) {
    const titleMatch = line.match(/^#{1,3}\s+(.+(?:plan|todo|steps|tasks|approach|implementation).*)$/i)
    if (titleMatch) {
      planTitle = titleMatch[1].replace(/[*_#]/g, '').trim()
      break
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Checkbox pattern: - [ ] or - [x]
    const checkboxMatch = trimmed.match(/^[-*]\s*\[([ xX✓✗])\]\s+(.+)$/)
    if (checkboxMatch) {
      const isDone = checkboxMatch[1] !== ' '
      items.push({
        id: `todo-${items.length}`,
        text: checkboxMatch[2].replace(/\*\*/g, '').trim(),
        status: isDone ? 'done' : 'pending',
        index: items.length,
      })
      continue
    }

    // Numbered list: 1. Do something or 1) Do something
    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)$/)
    if (numberedMatch) {
      const content = numberedMatch[2].replace(/\*\*/g, '').trim()
      // Skip very short items or items that are just headers
      if (content.length < 3) continue
      // Detect done markers
      const isDone = content.startsWith('~~') || content.toLowerCase().startsWith('done:') || content.includes('✅') || content.includes('✓')
      const isInProgress = content.toLowerCase().startsWith('current') || content.includes('🔄') || content.includes('⏳')
      items.push({
        id: `todo-${items.length}`,
        text: content.replace(/^~~|~~$/g, '').replace(/^(done|current):\s*/i, '').trim(),
        status: isDone ? 'done' : isInProgress ? 'in_progress' : 'pending',
        index: items.length,
      })
      continue
    }

    // Bullet with bold step: - **Step N**: description
    const stepMatch = trimmed.match(/^[-*]\s+\*\*(?:Step\s*\d+|Task\s*\d+)[^*]*\*\*[:\s]*(.+)$/i)
    if (stepMatch) {
      items.push({
        id: `todo-${items.length}`,
        text: stepMatch[1].replace(/\*\*/g, '').trim(),
        status: 'pending',
        index: items.length,
      })
    }
  }

  // Only return a plan if we found at least 2 items (single items aren't really a "plan")
  if (items.length < 2) return null

  return {
    sessionId,
    messageId,
    items,
    timestamp: Date.now(),
    title: planTitle,
  }
}

/**
 * Scan all messages in a session and return the latest TODO plan found.
 */
export function getLatestPlan(
  messages: Array<{ id: string; role: string; sessionId?: string; parts: Array<{ type: string; text?: string }> }>,
  sessionId: string
): TodoPlan | null {
  // Search from newest to oldest
  const sessionMsgs = messages
    .filter(m => m.role === 'assistant' && (!m.sessionId || m.sessionId === sessionId))
    .reverse()

  for (const msg of sessionMsgs) {
    const textContent = msg.parts
      .filter(p => p.type === 'text' && p.text)
      .map(p => p.text!)
      .join('\n')

    const plan = extractTodoPlan(textContent, sessionId, msg.id)
    if (plan) return plan
  }

  return null
}
