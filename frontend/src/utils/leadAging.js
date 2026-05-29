const MS_PER_DAY = 86400000

export const AGING_BUCKETS = [
  { key: '0-7', label: '0–7 days', min: 0, max: 7 },
  { key: '8-15', label: '8–15 days', min: 8, max: 15 },
  { key: '16-30', label: '16–30 days', min: 16, max: 30 },
  { key: '30+', label: '30+ days', min: 31, max: Infinity },
]

export function leadAgeDays(lead, now = Date.now()) {
  if (!lead?.created_at) return null
  const created = new Date(lead.created_at).getTime()
  if (!Number.isFinite(created)) return null
  return Math.floor((now - created) / MS_PER_DAY)
}

export function bucketForAge(days) {
  if (days == null || days < 0) return null
  for (const b of AGING_BUCKETS) {
    if (days >= b.min && days <= b.max) return b.key
  }
  return '30+'
}

/**
 * Aggregate leads into aging buckets (active pipeline only by default).
 * @param {Array} leads
 * @param {{ excludeClosed?: boolean }} [opts]
 */
export function aggregateLeadAging(leads, opts = {}) {
  const excludeClosed = opts.excludeClosed !== false
  const counts = Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, 0]))

  let eligible = leads ?? []
  if (excludeClosed) {
    eligible = eligible.filter((l) => {
      const s = (l.status || 'new').toLowerCase()
      return s !== 'converted' && s !== 'lost'
    })
  }

  const total = eligible.length
  for (const lead of eligible) {
    const days = leadAgeDays(lead)
    const key = bucketForAge(days)
    if (key) counts[key] += 1
  }

  return AGING_BUCKETS.map((b) => ({
    bucket: b.key,
    label: b.label,
    count: counts[b.key],
    percentage: total ? (counts[b.key] / total) * 100 : 0,
  }))
}

export function isAgingAlertLead(lead, thresholdDays = 15) {
  const status = (lead.status || 'new').toLowerCase()
  if (status === 'converted' || status === 'lost') return false
  const days = leadAgeDays(lead)
  return days != null && days > thresholdDays
}
