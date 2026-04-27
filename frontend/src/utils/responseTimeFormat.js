/** Human-readable duration from milliseconds (for response-time metrics). */
export function formatDurationMs(ms) {
  if (ms == null || Number.isNaN(ms) || ms < 0) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const h = Math.floor(m / 60)
  const remM = m % 60
  const remS = sec % 60
  if (h > 0) return `${h}h ${remM}m`
  return remS ? `${m}m ${remS}s` : `${m}m`
}
