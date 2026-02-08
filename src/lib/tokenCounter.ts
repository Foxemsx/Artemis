
const COMMON_SINGLE_TOKEN_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'because', 'but', 'and', 'or', 'if', 'while', 'that', 'this', 'these',
  'those', 'it', 'its', 'he', 'she', 'we', 'they', 'I', 'you', 'my',
  'your', 'his', 'her', 'our', 'their', 'me', 'him', 'us', 'them',
  'what', 'which', 'who', 'whom', 'whose',
  'function', 'return', 'const', 'let', 'var', 'if', 'else', 'for',
  'while', 'class', 'import', 'export', 'default', 'from', 'new',
  'true', 'false', 'null', 'undefined', 'typeof', 'void', 'async',
  'await', 'try', 'catch', 'throw', 'switch', 'case', 'break',
  'continue', 'interface', 'type', 'enum', 'extends', 'implements',
])

export function estimateTokens(text: string): number {
  if (!text) return 0

  let tokens = 0

  const segments = text.match(
    /[a-zA-Z]+(?:'[a-zA-Z]+)?|[0-9]+(?:\.[0-9]+)?|\s+|[^\s\w]|[\u0080-\uffff]+/g
  )

  if (!segments) return Math.ceil(text.length / 4)

  for (const seg of segments) {
    const trimmed = seg.trim()

    if (!trimmed) {
      const newlines = (seg.match(/\n/g) || []).length
      tokens += newlines
      const spaces = seg.length - newlines
    if (spaces > 0 && newlines === 0) {
      tokens += Math.ceil(spaces / 4)
    }
      continue
    }

    if (seg.length === 1 && /[^\w\s]/.test(seg)) {
      tokens += 1
      continue
    }

    if (/^[^\w\s]+$/.test(seg)) {
      tokens += 1
      continue
    }

    if (/^[0-9]/.test(seg)) {
      tokens += Math.max(1, Math.ceil(seg.length / 3))
      continue
    }

    if (/[\u0080-\uffff]/.test(seg)) {
      tokens += Math.max(1, Math.ceil(seg.length / 1.5))
      continue
    }

    const lower = seg.toLowerCase()

    if (COMMON_SINGLE_TOKEN_WORDS.has(lower)) {
      tokens += 1
      continue
    }

    if (seg.length <= 5) {
      tokens += 1
      continue
    }

    if (seg.length <= 10) {
      tokens += seg.length <= 7 ? 1 : 2
      continue
    }

    const camelParts = seg.split(/(?=[A-Z])/).filter(Boolean)
    if (camelParts.length > 1) {
      for (const part of camelParts) {
        tokens += part.length <= 6 ? 1 : Math.ceil(part.length / 5)
      }
    } else {
      tokens += Math.max(1, Math.ceil(seg.length / 4.5))
    }
  }

  return Math.max(1, tokens)
}

export function estimatePromptTokens(text: string): number {
  return estimateTokens(text) + 4
}

export function estimateCompletionTokens(text: string): number {
  return estimateTokens(text)
}
