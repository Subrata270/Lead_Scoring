export function isConvertedLead(lead) {
  return (lead.status || '').toLowerCase() === 'converted'
}

export function aggregateBySource(leads) {
  const map = new Map()
  for (const l of leads) {
    const source = l.source || 'Unknown'
    if (!map.has(source)) {
      map.set(source, { source, total_leads: 0, converted_leads: 0 })
    }
    const row = map.get(source)
    row.total_leads += 1
    if (isConvertedLead(l)) row.converted_leads += 1
  }
  const rows = [...map.values()].map((r) => ({
    ...r,
    conversion_rate: r.total_leads ? (r.converted_leads / r.total_leads) * 100 : 0,
  }))
  rows.sort((a, b) => b.total_leads - a.total_leads)
  return rows
}

export function bestWorstSource(rows) {
  const withLeads = rows.filter((r) => r.total_leads > 0)
  if (withLeads.length === 0) return { best: null, worst: null }
  let best = withLeads[0]
  let worst = withLeads[0]
  for (const r of withLeads) {
    if (r.conversion_rate > best.conversion_rate) best = r
    if (r.conversion_rate < worst.conversion_rate) worst = r
  }
  return { best, worst }
}

function assigneeKey(lead) {
  const a = lead.assigned_to
  return a && String(a).trim() ? String(a).trim() : 'Unassigned'
}

export function aggregateByAssignee(leads) {
  const map = new Map()
  for (const l of leads) {
    const k = assigneeKey(l)
    if (!map.has(k)) {
      map.set(k, {
        assigned_to: k,
        leads_assigned: 0,
        leads_converted: 0,
        response_ms_samples: [],
      })
    }
    const row = map.get(k)
    row.leads_assigned += 1
    if (isConvertedLead(l)) row.leads_converted += 1
    if (l.first_status_changed_at && l.created_at) {
      const ms = new Date(l.first_status_changed_at) - new Date(l.created_at)
      if (ms >= 0) row.response_ms_samples.push(ms)
    }
  }
  return [...map.values()]
    .map((r) => ({
      assigned_to: r.assigned_to,
      leads_assigned: r.leads_assigned,
      leads_converted: r.leads_converted,
      conversion_rate: r.leads_assigned ? (r.leads_converted / r.leads_assigned) * 100 : 0,
      avg_response_time_ms:
        r.response_ms_samples.length > 0
          ? r.response_ms_samples.reduce((a, b) => a + b, 0) / r.response_ms_samples.length
          : null,
    }))
    .sort((a, b) => b.leads_assigned - a.leads_assigned)
}

export function topPerformerByConversion(reps) {
  const eligible = reps.filter((r) => r.leads_assigned > 0)
  if (eligible.length === 0) return null
  return eligible.reduce((best, r) => (r.conversion_rate > best.conversion_rate ? r : best))
}

export function computeGlobalResponseStats(leads) {
  const durations = []
  for (const l of leads) {
    if (l.first_status_changed_at && l.created_at) {
      const ms = new Date(l.first_status_changed_at) - new Date(l.created_at)
      if (ms >= 0) durations.push(ms)
    }
  }
  if (durations.length === 0) {
    return { count: 0, avg: null, fastest: null, slowest: null }
  }
  const sum = durations.reduce((a, b) => a + b, 0)
  return {
    count: durations.length,
    avg: sum / durations.length,
    fastest: Math.min(...durations),
    slowest: Math.max(...durations),
  }
}

function localDayKey(iso) {
  const d = new Date(iso)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function leadsCreatedPerDay(leads) {
  const map = new Map()
  for (const l of leads) {
    if (!l.created_at) continue
    const key = localDayKey(l.created_at)
    map.set(key, (map.get(key) || 0) + 1)
  }
  const rows = [...map.entries()]
    .map(([date, leads_count]) => ({ date, leads_count }))
    .sort((a, b) => a.date.localeCompare(b.date))
  return rows
}
