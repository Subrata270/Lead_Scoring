import { isTaskOverdue } from './taskHelpers.js'

export const DATE_PRESETS = {
  TODAY: 'today',
  LAST_7: 'last7',
  LAST_30: 'last30',
  CUSTOM: 'custom',
}

/** Canonical source labels for ordering / grouping */
export const SOURCE_ORDER = [
  'referral',
  'website',
  'ads',
  'public_form',
  'api',
  'event',
  'other',
]

export function isConvertedLead(lead) {
  return (lead.status || '').toLowerCase() === 'converted'
}

export function isLostLead(lead) {
  return (lead.status || '').toLowerCase() === 'lost'
}

export function isContactedOnlyLead(lead) {
  return (lead.status || '').toLowerCase() === 'contacted'
}

export function isHotLead(lead) {
  return (lead.category || '').toLowerCase() === 'hot'
}

export function normalizeSourceKey(source) {
  const s = (source || '').trim().toLowerCase()
  if (!s) return 'other'
  if (SOURCE_ORDER.includes(s)) return s
  return 'other'
}

/** @returns {{ startIso: string, endIso: string }} */
export function getDateRangeFromPreset(preset, customFrom, customTo) {
  const now = new Date()

  const endOfDay = (d) => {
    const x = new Date(d)
    x.setHours(23, 59, 59, 999)
    return x
  }

  const startOfDay = (d) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }

  if (preset === DATE_PRESETS.TODAY) {
    return {
      startIso: startOfDay(now).toISOString(),
      endIso: endOfDay(now).toISOString(),
    }
  }

  if (preset === DATE_PRESETS.LAST_7) {
    const start = new Date(now)
    start.setDate(start.getDate() - 6)
    return {
      startIso: startOfDay(start).toISOString(),
      endIso: endOfDay(now).toISOString(),
    }
  }

  if (preset === DATE_PRESETS.LAST_30) {
    const start = new Date(now)
    start.setDate(start.getDate() - 29)
    return {
      startIso: startOfDay(start).toISOString(),
      endIso: endOfDay(now).toISOString(),
    }
  }

  if (preset === DATE_PRESETS.CUSTOM && customFrom && customTo) {
    const from = startOfDay(new Date(`${customFrom}T00:00:00`))
    const to = endOfDay(new Date(`${customTo}T00:00:00`))
    if (from > to) {
      return { startIso: startOfDay(to).toISOString(), endIso: endOfDay(from).toISOString() }
    }
    return { startIso: from.toISOString(), endIso: to.toISOString() }
  }

  const start = new Date(now)
  start.setDate(start.getDate() - 29)
  return {
    startIso: startOfDay(start).toISOString(),
    endIso: endOfDay(now).toISOString(),
  }
}

export function indexTasksByLeadId(tasks) {
  const map = {}
  for (const t of tasks || []) {
    if (!map[t.lead_id]) map[t.lead_id] = []
    map[t.lead_id].push(t)
  }
  return map
}

/**
 * @param {object[]} leads
 * @param {Record<string, object[]>} tasksByLeadId
 */
export function computeFunnelMetrics(leads, tasksByLeadId) {
  const total = leads.length
  const pct = (n) => (total > 0 ? (n / total) * 100 : 0)

  let contacted = 0
  let followupActive = 0
  let converted = 0
  let lost = 0

  for (const l of leads) {
    if (isConvertedLead(l)) converted += 1
    else if (isLostLead(l)) lost += 1
    else if (isContactedOnlyLead(l)) contacted += 1

    const ts = tasksByLeadId[l.id] || []
    if (ts.some((t) => t.status === 'pending')) followupActive += 1
  }

  return {
    total,
    contacted,
    followup_active: followupActive,
    converted,
    lost,
    pct_contacted: pct(contacted),
    pct_followup_active: pct(followupActive),
    pct_converted: pct(converted),
    pct_lost: pct(lost),
  }
}

function responseMs(lead) {
  if (!lead.first_status_changed_at || !lead.created_at) return null
  const ms = new Date(lead.first_status_changed_at) - new Date(lead.created_at)
  return ms >= 0 ? ms : null
}

export function aggregateBySource(leads) {
  const map = new Map()
  for (const l of leads) {
    const source = normalizeSourceKey(l.source)
    if (!map.has(source)) {
      map.set(source, {
        source,
        total_leads: 0,
        converted_leads: 0,
        response_ms_samples: [],
        hot_leads: 0,
      })
    }
    const row = map.get(source)
    row.total_leads += 1
    if (isConvertedLead(l)) row.converted_leads += 1
    if (isHotLead(l)) row.hot_leads += 1
    const ms = responseMs(l)
    if (ms != null) row.response_ms_samples.push(ms)
  }

  const rows = [...map.values()].map((r) => ({
    source: r.source,
    total_leads: r.total_leads,
    converted_leads: r.converted_leads,
    conversion_rate: r.total_leads ? (r.converted_leads / r.total_leads) * 100 : 0,
    avg_response_time_ms:
      r.response_ms_samples.length > 0
        ? r.response_ms_samples.reduce((a, b) => a + b, 0) / r.response_ms_samples.length
        : null,
    hot_lead_pct: r.total_leads ? (r.hot_leads / r.total_leads) * 100 : 0,
  }))

  rows.sort((a, b) => {
    const ai = SOURCE_ORDER.indexOf(a.source)
    const bi = SOURCE_ORDER.indexOf(b.source)
    const ar = ai === -1 ? 999 : ai
    const br = bi === -1 ? 999 : bi
    if (ar !== br) return ar - br
    return b.total_leads - a.total_leads
  })
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

export function aggregateByAssignee(leads, tasksByLeadId = {}) {
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
    const ms = responseMs(l)
    if (ms != null) row.response_ms_samples.push(ms)
  }

  const rows = [...map.values()].map((r) => {
    let pending = 0
    let overdue = 0
    for (const l of leads) {
      if (assigneeKey(l) !== r.assigned_to) continue
      const ts = tasksByLeadId[l.id] || []
      for (const t of ts) {
        if (t.status === 'pending') {
          pending += 1
          if (isTaskOverdue(t.due_date, t.status)) overdue += 1
        }
      }
    }
    return {
      assigned_to: r.assigned_to,
      leads_assigned: r.leads_assigned,
      leads_converted: r.leads_converted,
      conversion_rate: r.leads_assigned ? (r.leads_converted / r.leads_assigned) * 100 : 0,
      avg_response_time_ms:
        r.response_ms_samples.length > 0
          ? r.response_ms_samples.reduce((a, b) => a + b, 0) / r.response_ms_samples.length
          : null,
      pending_tasks: pending,
      overdue_tasks: overdue,
    }
  })

  rows.sort((a, b) => b.leads_assigned - a.leads_assigned)
  return rows
}

export function topPerformerByConversion(reps) {
  const eligible = reps.filter((r) => r.leads_assigned > 0 && r.assigned_to !== 'Unassigned')
  if (eligible.length === 0) return null
  return eligible.reduce((best, r) => (r.conversion_rate > best.conversion_rate ? r : best))
}

export function topPerformerByResponseSpeed(reps) {
  const eligible = reps.filter(
    (r) => r.leads_assigned >= 2 && r.avg_response_time_ms != null && r.assigned_to !== 'Unassigned',
  )
  if (eligible.length === 0) return null
  return eligible.reduce((best, r) =>
    r.avg_response_time_ms < best.avg_response_time_ms ? r : best,
  )
}

export function computeGlobalResponseStats(leads) {
  const durations = []
  for (const l of leads) {
    const ms = responseMs(l)
    if (ms != null) durations.push(ms)
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
  return [...map.entries()]
    .map(([date, leads_count]) => ({ date, leads_count }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

function industryLabel(lead) {
  const n = lead.industries?.name
  if (n) return String(n)
  if (lead.industry_id) return `Industry ${String(lead.industry_id).slice(0, 8)}…`
  return 'Unknown industry'
}

export function aggregateByIndustry(leads) {
  const map = new Map()
  for (const l of leads) {
    const key = industryLabel(l)
    if (!map.has(key)) {
      map.set(key, {
        industry: key,
        lead_count: 0,
        hot_count: 0,
        converted: 0,
        budget_samples: [],
      })
    }
    const row = map.get(key)
    row.lead_count += 1
    if (isHotLead(l)) row.hot_count += 1
    if (isConvertedLead(l)) row.converted += 1
    const b = Number(l.budget)
    if (Number.isFinite(b) && b >= 0) row.budget_samples.push(b)
  }
  return [...map.values()]
    .map((r) => ({
      industry: r.industry,
      lead_count: r.lead_count,
      hot_count: r.hot_count,
      hot_pct: r.lead_count ? (r.hot_count / r.lead_count) * 100 : 0,
      conversion_rate: r.lead_count ? (r.converted / r.lead_count) * 100 : 0,
      avg_budget:
        r.budget_samples.length > 0
          ? r.budget_samples.reduce((a, b) => a + b, 0) / r.budget_samples.length
          : 0,
    }))
    .sort((a, b) => b.lead_count - a.lead_count)
}

function businessTypeLabel(lead) {
  const n = lead.business_types?.name
  if (n) return String(n)
  if (lead.business_type_id) return `Type ${String(lead.business_type_id).slice(0, 8)}…`
  return 'Unknown type'
}

export function aggregateByBusinessType(leads) {
  const map = new Map()
  for (const l of leads) {
    const key = businessTypeLabel(l)
    if (!map.has(key)) {
      map.set(key, {
        business_type: key,
        lead_count: 0,
        converted: 0,
        budget_samples: [],
      })
    }
    const row = map.get(key)
    row.lead_count += 1
    if (isConvertedLead(l)) row.converted += 1
    const b = Number(l.budget)
    if (Number.isFinite(b) && b >= 0) row.budget_samples.push(b)
  }
  return [...map.values()]
    .map((r) => ({
      business_type: r.business_type,
      lead_count: r.lead_count,
      conversions: r.converted,
      conversion_rate: r.lead_count ? (r.converted / r.lead_count) * 100 : 0,
      avg_budget:
        r.budget_samples.length > 0
          ? r.budget_samples.reduce((a, b) => a + b, 0) / r.budget_samples.length
          : 0,
    }))
    .sort((a, b) => b.lead_count - a.lead_count)
}

/** Day 0 = Monday … 6 = Sunday; hour bucket 0–3: night, morning, afternoon, evening */
export function buildActivityHeatmap(leads) {
  const buckets = [
    { id: 0, label: 'Night\n0–6' },
    { id: 1, label: 'Morning\n6–12' },
    { id: 2, label: 'Afternoon\n12–18' },
    { id: 3, label: 'Evening\n18–24' },
  ]
  const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const matrix = Array.from({ length: 7 }, () => [0, 0, 0, 0])
  for (const l of leads) {
    if (!l.created_at) continue
    const d = new Date(l.created_at)
    let dow = d.getDay()
    dow = dow === 0 ? 6 : dow - 1
    const h = d.getHours()
    const hb =
      h >= 18 && h < 24 ? 3 : h >= 12 && h < 18 ? 2 : h >= 6 && h < 12 ? 1 : 0
    matrix[dow][hb] += 1
  }
  let max = 0
  for (const row of matrix) for (const c of row) if (c > max) max = c
  return { matrix, max, dayLabels, buckets }
}

/**
 * @param {object} ctx
 * @returns {string[]}
 */
export function generateDashboardInsights(ctx) {
  const { leads, bySource, byRep, byIndustry } = ctx
  const lines = []

  const ref = bySource.find((s) => s.source === 'referral')
  const ads = bySource.find((s) => s.source === 'ads')
  if (ref && ads && ref.total_leads >= 2 && ads.total_leads >= 2) {
    const denom = Math.max(ads.conversion_rate, 0.25)
    const ratio = ref.conversion_rate / denom
    if (ratio >= 1.4) {
      lines.push(
        `Referral leads convert about ${ratio.toFixed(1)}× better than ads in this period (${ref.conversion_rate.toFixed(0)}% vs ${ads.conversion_rate.toFixed(0)}%).`,
      )
    }
  }

  const fastest = topPerformerByResponseSpeed(byRep)
  if (fastest) {
    lines.push(
      `${fastest.assigned_to} has the fastest average first response among reps with enough volume.`,
    )
  }

  const topConv = topPerformerByConversion(byRep)
  if (topConv && topConv.leads_assigned >= 2) {
    lines.push(
      `${topConv.assigned_to} leads the team on conversion rate (${topConv.conversion_rate.toFixed(1)}% on ${topConv.leads_assigned} leads).`,
    )
  }

  const indSorted = [...byIndustry].filter((i) => i.lead_count >= 2).sort((a, b) => b.avg_budget - a.avg_budget)
  if (indSorted.length && indSorted[0].avg_budget > 0) {
    const top = indSorted[0]
    lines.push(
      `${top.industry} shows the highest average budget (${Math.round(top.avg_budget).toLocaleString()}).`,
    )
  }

  const website = bySource.find((s) => s.source === 'website')
  if (website && ref && website.total_leads >= 3 && ref.total_leads >= 2) {
    if (ref.conversion_rate > website.conversion_rate + 5) {
      lines.push(
        'Referral traffic is outperforming website leads on conversion — consider doubling down on partner-driven pipeline.',
      )
    }
  }

  if (leads.length === 0) {
    lines.push('No leads in the selected date range — widen the window or capture more inbound.')
  }

  return [...new Set(lines)].slice(0, 6)
}

function csvEscape(v) {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function buildAnalyticsCsv({
  rangeLabel,
  funnel,
  bySource,
  byRep,
  byIndustry,
  byBusinessType,
}) {
  const lines = []
  lines.push(`AI Lead Scoring — Analytics export`)
  lines.push(`Period,${csvEscape(rangeLabel)}`)
  lines.push('')
  lines.push('FUNNEL')
  lines.push('Stage,Count,% of total')
  lines.push(`Total,${funnel.total},100`)
  lines.push(`Contacted (status),${funnel.contacted},${funnel.pct_contacted.toFixed(1)}`)
  lines.push(`Follow-up active (pending task),${funnel.followup_active},${funnel.pct_followup_active.toFixed(1)}`)
  lines.push(`Converted,${funnel.converted},${funnel.pct_converted.toFixed(1)}`)
  lines.push(`Lost,${funnel.lost},${funnel.pct_lost.toFixed(1)}`)
  lines.push('')
  lines.push('SOURCE')
  lines.push(
    'Source,Total leads,Converted,Conversion %,Avg response ms,Hot lead %',
  )
  for (const r of bySource) {
    lines.push(
      [
        csvEscape(r.source),
        r.total_leads,
        r.converted_leads,
        r.conversion_rate.toFixed(2),
        r.avg_response_time_ms != null ? Math.round(r.avg_response_time_ms) : '',
        r.hot_lead_pct.toFixed(2),
      ].join(','),
    )
  }
  lines.push('')
  lines.push('SALESPERSON')
  lines.push(
    'Assignee,Leads assigned,Converted,Conversion %,Avg response ms,Pending tasks,Overdue tasks',
  )
  for (const r of byRep) {
    lines.push(
      [
        csvEscape(r.assigned_to),
        r.leads_assigned,
        r.leads_converted,
        r.conversion_rate.toFixed(2),
        r.avg_response_time_ms != null ? Math.round(r.avg_response_time_ms) : '',
        r.pending_tasks,
        r.overdue_tasks,
      ].join(','),
    )
  }
  lines.push('')
  lines.push('INDUSTRY')
  lines.push('Industry,Lead count,Hot count,Hot %,Conversion %,Avg budget')
  for (const r of byIndustry) {
    lines.push(
      [
        csvEscape(r.industry),
        r.lead_count,
        r.hot_count,
        r.hot_pct.toFixed(2),
        r.conversion_rate.toFixed(2),
        Math.round(r.avg_budget || 0),
      ].join(','),
    )
  }
  lines.push('')
  lines.push('BUSINESS_TYPE')
  lines.push('Business type,Lead count,Conversions,Conversion %,Avg budget')
  for (const r of byBusinessType) {
    lines.push(
      [
        csvEscape(r.business_type),
        r.lead_count,
        r.conversions,
        r.conversion_rate.toFixed(2),
        Math.round(r.avg_budget || 0),
      ].join(','),
    )
  }
  return lines.join('\n')
}

export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
