import { countPendingTasks, isTaskOverdue } from './taskHelpers'

/** @typedef {{ id: string, icon: string, text: string, tone: string }} LeadSuggestion */

const PRIORITY = {
  overdue: 0,
  hot_call: 1,
  hot_wa: 2,
  warm_schedule: 3,
  cold_nurture: 4,
}

/**
 * Rule-based suggestions for a lead (icon + text + tone for UI chips).
 * @param {Record<string, unknown>} lead
 * @param {Array<Record<string, unknown>>} tasks
 * @returns {LeadSuggestion[]}
 */
export function getSuggestionsForLead(lead, tasks = []) {
  const list = tasks ?? []
  const cat = (lead.category || '').toLowerCase()
  const status = (lead.status || 'new').toLowerCase()
  /** Treat missing/false as “not responded” for outreach prompts */
  const notResponded = lead.responded !== true
  const out = []

  if (cat === 'hot' && status === 'new') {
    out.push({
      id: 'hot-call',
      icon: '',
      text: '🔥 Call immediately',
      tone: 'urgent',
    })
  }

  if (cat === 'hot' && notResponded) {
    out.push({
      id: 'hot-wa',
      icon: '',
      text: '⚡ Send WhatsApp message now',
      tone: 'action',
    })
  }

  if (cat === 'warm' && countPendingTasks(list) === 0) {
    out.push({
      id: 'warm-followup',
      icon: '',
      text: '📅 Schedule follow-up',
      tone: 'schedule',
    })
  }

  const hasOverdue = list.some((t) => isTaskOverdue(t.due_date, t.status))
  if (hasOverdue) {
    out.push({
      id: 'overdue',
      icon: '',
      text: '⚠️ Complete pending task',
      tone: 'warn',
    })
  }

  if (cat === 'cold') {
    out.push({
      id: 'cold-nurture',
      icon: '',
      text: '📩 Add to nurturing campaign',
      tone: 'nurture',
    })
  }

  const seen = new Set()
  const unique = out.filter((s) => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })

  return sortSuggestionsByPriority(unique)
}

function sortSuggestionsByPriority(list) {
  const rank = (s) => PRIORITY[s.id] ?? 99
  return [...list].sort((a, b) => rank(a) - rank(b))
}

/**
 * Single highest-priority suggestion for compact table cells.
 * @param {Record<string, unknown>} lead
 * @param {Array<Record<string, unknown>>} tasks
 * @returns {LeadSuggestion | null}
 */
export function getPrimarySuggestion(lead, tasks = []) {
  const list = getSuggestionsForLead(lead, tasks)
  return list[0] ?? null
}
