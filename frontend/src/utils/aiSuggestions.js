import { isTaskOverdue } from './taskHelpers'

/**
 * Rule-based v1 suggestions for a lead (UI: icon + text + tone).
 * @param {Record<string, unknown>} lead
 * @param {Array<Record<string, unknown>>} tasks
 */
export function getSuggestionsForLead(lead, tasks = []) {
  const list = tasks ?? []
  const cat = (lead.category || '').toLowerCase()
  const status = (lead.status || 'new').toLowerCase()
  const responded = lead.responded === true
  const out = []

  if (cat === 'hot' && status === 'new') {
    out.push({
      id: 'hot-call',
      icon: '🔥',
      text: 'Call immediately',
      tone: 'urgent',
    })
  }

  if (cat === 'hot' && responded === false) {
    out.push({
      id: 'hot-wa',
      icon: '⚡',
      text: 'Send WhatsApp message now',
      tone: 'action',
    })
  }

  if (cat === 'warm' && list.length === 0) {
    out.push({
      id: 'warm-followup',
      icon: '📅',
      text: 'Schedule follow-up',
      tone: 'schedule',
    })
  }

  const hasOverdue = list.some((t) => isTaskOverdue(t.due_date, t.status))
  if (hasOverdue) {
    out.push({
      id: 'overdue',
      icon: '⚠️',
      text: 'Complete pending task',
      tone: 'warn',
    })
  }

  if (cat === 'cold') {
    out.push({
      id: 'cold-nurture',
      icon: '📩',
      text: 'Add to nurturing campaign',
      tone: 'nurture',
    })
  }

  const seen = new Set()
  return out.filter((s) => {
    if (seen.has(s.id)) return false
    seen.add(s.id)
    return true
  })
}
