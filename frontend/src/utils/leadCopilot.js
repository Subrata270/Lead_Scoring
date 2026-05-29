import { leadAgeDays } from './leadAging'
import { countPendingTasks } from './taskHelpers'

export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  AT_RISK: 'at_risk',
  STALE: 'stale',
  CRITICAL: 'critical',
}

export const HEALTH_LABELS = {
  [HEALTH_STATUS.HEALTHY]: 'Healthy',
  [HEALTH_STATUS.AT_RISK]: 'At Risk',
  [HEALTH_STATUS.STALE]: 'Stale',
  [HEALTH_STATUS.CRITICAL]: 'Critical',
}

const MS_PER_DAY = 86400000

function daysSince(iso, now = Date.now()) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((now - t) / MS_PER_DAY)
}

/** Days since most recent activity (falls back to lead created_at). */
export function daysSinceLastActivity(activities, leadCreatedAt) {
  if (activities?.length) {
    const latest = activities.reduce((max, a) => {
      const t = new Date(a.created_at).getTime()
      return t > max ? t : max
    }, 0)
    if (latest) return daysSince(new Date(latest).toISOString())
  }
  return daysSince(leadCreatedAt)
}

export function computeScoreTrend(scoreHistory) {
  if (!scoreHistory?.length) return { direction: 'stable', delta: 0, label: 'No score changes yet' }
  const sorted = [...scoreHistory].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )
  const latest = sorted[0]
  const prev = sorted[1]
  if (!prev) {
    return {
      direction: 'stable',
      delta: latest.new_score - latest.old_score,
      label: `Initial score set to ${latest.new_score}`,
    }
  }
  const delta = latest.new_score - prev.new_score
  if (delta > 0) return { direction: 'improving', delta, label: `Score improving (+${delta} recently)` }
  if (delta < 0) return { direction: 'declining', delta, label: `Score declining (${delta} recently)` }
  return { direction: 'stable', delta: 0, label: 'Score stable' }
}

/**
 * @returns {{ status: string, label: string, reason: string, tone: string }}
 */
export function computeLeadHealth(lead, activities = []) {
  const status = (lead.status || 'new').toLowerCase()
  if (status === 'converted') {
    return { status: HEALTH_STATUS.HEALTHY, label: 'Healthy', reason: 'Lead converted', tone: 'healthy' }
  }
  if (status === 'lost') {
    return { status: HEALTH_STATUS.AT_RISK, label: 'At Risk', reason: 'Lead marked lost', tone: 'at_risk' }
  }

  const age = leadAgeDays(lead) ?? 0
  const sinceAct = daysSinceLastActivity(activities, lead.created_at) ?? age
  const score = lead.score ?? 0
  const recentActivity = sinceAct < 7
  const noRecentActivity = sinceAct >= 7

  if (age > 30 && noRecentActivity) {
    return {
      status: HEALTH_STATUS.CRITICAL,
      label: HEALTH_LABELS[HEALTH_STATUS.CRITICAL],
      reason: `${age} days old with no activity in ${sinceAct}+ days`,
      tone: 'critical',
    }
  }
  if (age > 15) {
    return {
      status: HEALTH_STATUS.STALE,
      label: HEALTH_LABELS.stale,
      reason: `Lead aging ${age} days in pipeline`,
      tone: 'stale',
    }
  }
  if (noRecentActivity) {
    return {
      status: HEALTH_STATUS.AT_RISK,
      label: HEALTH_LABELS.at_risk,
      reason: `No activity in ${sinceAct} days`,
      tone: 'at_risk',
    }
  }
  if (recentActivity && score >= 50) {
    return {
      status: HEALTH_STATUS.HEALTHY,
      label: HEALTH_LABELS.healthy,
      reason: `Active engagement with score ${score}`,
      tone: 'healthy',
    }
  }

  return {
    status: HEALTH_STATUS.AT_RISK,
    label: HEALTH_LABELS.at_risk,
    reason: 'Needs more engagement to stay on track',
    tone: 'at_risk',
  }
}

/**
 * @returns {{ level: 'high'|'medium'|'low', label: string, confidence: number, factors: string[] }}
 */
export function computeConversionLikelihood(lead, activities = []) {
  const score = lead.score ?? 0
  const urgency = (lead.urgency || 'medium').toLowerCase()
  const source = (lead.source || '').toLowerCase()
  const activityCount = activities?.length ?? 0
  const factors = []
  let points = 0

  if (score >= 80) {
    points += 40
    factors.push('Hot lead score')
  } else if (score >= 50) {
    points += 25
    factors.push('Warm lead score')
  } else {
    points += 10
    factors.push('Cold lead score')
  }

  if (activityCount >= 3) {
    points += 25
    factors.push(`${activityCount} activities logged`)
  } else if (activityCount >= 1) {
    points += 15
    factors.push('Some engagement history')
  } else {
    factors.push('Limited activity history')
  }

  if (urgency === 'high') {
    points += 20
    factors.push('High urgency')
  } else if (urgency === 'medium') {
    points += 10
  }

  if (source === 'referral') {
    points += 15
    factors.push('Referral source')
  } else if (source === 'website' || source === 'ads') {
    points += 5
  }

  if (lead.responded === true) {
    points += 10
    factors.push('Lead has responded')
  }

  points = Math.min(100, points)
  let level = 'low'
  if (points >= 65) level = 'high'
  else if (points >= 40) level = 'medium'

  return {
    level,
    label: level.charAt(0).toUpperCase() + level.slice(1),
    confidence: points,
    factors,
  }
}

/**
 * @returns {{ title: string, description: string, icon: string, tone: string }}
 */
export function getNextBestAction(lead, tasks = []) {
  const cat = (lead.category || 'cold').toLowerCase()
  const status = (lead.status || 'new').toLowerCase()
  const pending = countPendingTasks(tasks)

  if (cat === 'hot' && status === 'new') {
    return {
      title: 'Call immediately',
      description: 'Hot lead with no outreach yet — prioritize a phone call within the hour.',
      icon: '📞',
      tone: 'urgent',
    }
  }
  if (cat === 'hot' && status === 'contacted') {
    return {
      title: 'Schedule demo',
      description: 'Lead is engaged and hot — book a demo or discovery meeting while interest is high.',
      icon: '📅',
      tone: 'action',
    }
  }
  if (cat === 'warm' && pending === 0) {
    return {
      title: 'Create follow-up',
      description: 'Warm lead with no pending tasks — schedule a follow-up call or message.',
      icon: '📋',
      tone: 'schedule',
    }
  }
  if (cat === 'cold') {
    return {
      title: 'Nurture campaign',
      description: 'Cold lead — add to a nurture sequence with value content before pushing for a call.',
      icon: '📩',
      tone: 'nurture',
    }
  }
  if (pending > 0) {
    return {
      title: 'Complete pending task',
      description: `${pending} task(s) due — clear follow-ups to keep momentum.`,
      icon: '✅',
      tone: 'warn',
    }
  }
  return {
    title: 'Review and update status',
    description: 'Log the latest interaction and confirm next steps with the lead.',
    icon: '🔄',
    tone: 'action',
  }
}

export function generateLeadSummary(lead, activities = [], scoreHistory = []) {
  const industry = lead.industries?.name ?? 'Unknown industry'
  const businessType = lead.business_types?.name ?? 'Unknown type'
  const budget = Number(lead.budget)
  const budgetLabel = Number.isFinite(budget) ? `$${budget.toLocaleString()}` : 'Not specified'
  const lastActivity = activities[0]
  const scoreTrend = computeScoreTrend(scoreHistory)

  const overview = `${lead.name} is a ${(lead.category || 'unscored').toLowerCase()} lead from ${lead.source || 'unknown source'}, currently ${lead.status || 'new'}. Assigned to ${lead.assigned_to || 'no one yet'}.`

  const budgetSummary =
    Number.isFinite(budget) && budget > 0
      ? `Budget of ${budgetLabel} in ${industry} (${businessType}).`
      : `No budget on file — qualify budget early in ${industry}.`

  const industrySummary = `Operating in ${industry} · ${businessType} segment.`

  return {
    overview,
    budgetSummary,
    industrySummary,
    status: lead.status || 'new',
    lastActivity: lastActivity
      ? { description: lastActivity.description, at: lastActivity.created_at }
      : null,
    score: lead.score ?? 0,
    category: lead.category || 'cold',
    scoreTrend,
    urgency: lead.urgency || 'medium',
  }
}

export function generateCallPrep(lead, activities = [], scoreHistory = []) {
  const points = []
  const budget = Number(lead.budget)
  const urgency = (lead.urgency || 'medium').toLowerCase()
  const cat = (lead.category || 'cold').toLowerCase()

  points.push(`Open with ${lead.name} — ${cat} priority, score ${lead.score ?? 0}/100.`)

  if (Number.isFinite(budget) && budget > 0) {
    points.push(`Budget discussion: ${budget.toLocaleString()} — confirm timeline and decision-makers.`)
  } else {
    points.push('Budget discussion: qualify expected spend and payment timeline.')
  }

  if (urgency === 'high') {
    points.push('Urgency is HIGH — ask about their deadline and blockers today.')
  } else if (urgency === 'medium') {
    points.push('Moderate urgency — explore timeline without pressure.')
  } else {
    points.push('Low urgency — focus on value and long-term fit.')
  }

  if (lead.source === 'referral') {
    points.push('Referral lead — acknowledge who referred them and build trust early.')
  }

  const recentActs = activities.slice(0, 3)
  const activitySummary =
    recentActs.length > 0
      ? recentActs.map((a) => `• ${a.description}`).join('\n')
      : 'No prior activities — this may be the first meaningful touchpoint.'

  const trend = computeScoreTrend(scoreHistory)
  if (trend.direction === 'improving') {
    points.push('Score trending up — momentum is on your side.')
  } else if (trend.direction === 'declining') {
    points.push('Score dipped recently — address objections or re-engage quickly.')
  }

  return {
    talkingPoints: points,
    activitySummary,
    urgencyReminder:
      urgency === 'high'
        ? 'Respond within 24 hours — lead flagged as high urgency.'
        : 'Standard follow-up cadence applies.',
  }
}

/** Manager dashboard: risk counts across open pipeline */
export function aggregateManagerRiskInsights(leads, activitiesByLeadId = {}) {
  const open = (leads ?? []).filter((l) => {
    const s = (l.status || 'new').toLowerCase()
    return s !== 'converted' && s !== 'lost'
  })

  const total = open.length
  let atRisk = 0
  let stale = 0
  let critical = 0
  let healthy = 0

  for (const lead of open) {
    const acts = activitiesByLeadId[lead.id] ?? []
    const health = computeLeadHealth(lead, acts)
    if (health.status === HEALTH_STATUS.CRITICAL) critical += 1
    else if (health.status === HEALTH_STATUS.STALE) stale += 1
    else if (health.status === HEALTH_STATUS.AT_RISK) atRisk += 1
    else healthy += 1
  }

  const pct = (n) => (total ? (n / total) * 100 : 0)

  return {
    total,
    atRisk,
    stale,
    critical,
    healthy,
    atRiskPct: pct(atRisk),
    stalePct: pct(stale),
    criticalPct: pct(critical),
    healthyPct: pct(healthy),
  }
}
