
export function formatTokenCount(count: number, decimals: number = 1): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(decimals)}M`
  if (count >= 1_000) return `${(count / 1_000).toFixed(decimals)}K`
  return count.toString()
}

export function formatCost(cost: number): string {
  if (cost < 0.01) return '$0.00'
  return `$${cost.toFixed(4)}`
}

export function truncatePath(path: string, maxLength: number = 50): string {
  if (path.length <= maxLength) return path

  const parts = path.split(/[/\\]/)
  if (parts.length <= 2) return path.slice(-maxLength)

  return parts[0] + '/.../' + parts.slice(-2).join('/')
}
