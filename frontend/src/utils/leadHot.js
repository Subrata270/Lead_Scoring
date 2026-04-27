export function isHotCategory(category) {
  return (category || '').toLowerCase() === 'hot'
}

/** Hot lead created within the last `windowMs` (default 5 minutes). */
export function isHotNow(lead, windowMs = 5 * 60 * 1000) {
  if (!lead?.created_at || !isHotCategory(lead.category)) return false
  const created = new Date(lead.created_at).getTime()
  return Date.now() - created <= windowMs
}

export function sortLeadsByScoreDesc(list) {
  return [...list].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

/** True when Realtime event should surface a “new hot lead” alert (INSERT hot, or became hot on UPDATE). */
export function isNewHotLeadEvent(payload) {
  const row = payload?.new
  if (!isHotCategory(row?.category)) return false
  if (payload.eventType === 'INSERT') return true
  if (payload.eventType === 'UPDATE') {
    const old = payload.old || {}
    if (!Object.prototype.hasOwnProperty.call(old, 'category')) {
      return false
    }
    return !isHotCategory(old.category)
  }
  return false
}

export function formatTimeToFirstAction(createdAt, firstStatusAt) {
  if (!createdAt || !firstStatusAt) return null
  const ms = new Date(firstStatusAt).getTime() - new Date(createdAt).getTime()
  if (ms < 0) return null
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const r = sec % 60
  return r ? `${m}m ${r}s` : `${m}m`
}
