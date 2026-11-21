export function relativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (Number.isNaN(seconds)) return ''
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

/** Up to two decimals, trailing zeros trimmed: 0.48 -> "0.48%", 12.8 -> "12.8%", 100 -> "100%". */
export function formatPercent(value: number): string {
  return `${parseFloat(value.toFixed(2))}%`
}
