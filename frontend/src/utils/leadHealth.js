import { leadAgeDays } from './leadAging'
import { countOverduePendingTasks } from './taskHelpers'
import { HEALTH_STATUS } from './leadCopilot'

const OPEN_STATUSES = new Set(['new', 'contacted'])

/**
 * Lightweight health for dashboard rows (no activity fetch).
 * @returns {'healthy'|'at_risk'|'stale'|'critical'|'overdue'|null}
 */
export function computeDashboardHealth(lead, tasks = []) {
  const status = (lead.status || 'new').toLowerCase()
  if (status === 'converted' || status === 'lost') return null

  const overdue = countOverduePendingTasks(tasks)
  if (overdue > 0) return 'overdue'

  const age = leadAgeDays(lead) ?? 0
  if (age > 30) return HEALTH_STATUS.CRITICAL
  if (age > 15) return HEALTH_STATUS.STALE

  const score = lead.score ?? 0
  if (score < 50 && age > 7) return HEALTH_STATUS.AT_RISK

  return null
}

export function isOpenLead(lead) {
  return OPEN_STATUSES.has((lead.status || 'new').toLowerCase())
}

export function countHealthBuckets(leads, tasksByLeadId = {}) {
  const counts = { stale: 0, critical: 0, overdue: 0 }
  for (const lead of leads) {
    if (!isOpenLead(lead)) continue
    const health = computeDashboardHealth(lead, tasksByLeadId[lead.id] ?? [])
    if (health === HEALTH_STATUS.STALE) counts.stale += 1
    else if (health === HEALTH_STATUS.CRITICAL) counts.critical += 1
    else if (health === 'overdue') counts.overdue += 1
  }
  return counts
}
