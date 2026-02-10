// Pure-JS token estimator — no WASM dependency (runs in renderer).
// Calibrated to cl100k_base (~4 chars per token for English/code).

export function estimateTokens(text: string): number {
  if (!text) return 0
  // cl100k_base averages ~4 characters per token for mixed English + code.
  // This is more accurate than the old heuristic which overestimated by ~2x.
  return Math.max(1, Math.ceil(text.length / 4))
}

export function estimatePromptTokens(text: string): number {
  return estimateTokens(text) + 4
}

export function estimateCompletionTokens(text: string): number {
  return estimateTokens(text)
}

// Bulk estimate for project token counting (char-count based).
export function estimateTokensFromCharCount(charCount: number): number {
  return Math.max(0, Math.ceil(charCount / 4))
}
