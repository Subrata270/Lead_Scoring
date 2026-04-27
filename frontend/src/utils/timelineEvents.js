/**
 * Build chronological timeline events from lead + tasks.
 * @param {Record<string, unknown>} lead
 * @param {Array<Record<string, unknown>>} tasks
 */
export function buildLeadTimelineEvents(lead, tasks = []) {
  const events = []

  if (lead.created_at) {
    events.push({
      id: `created-${lead.id}`,
      at: lead.created_at,
      label: 'Lead created',
      detail: null,
      kind: 'created',
    })
  }

  if (lead.first_status_changed_at) {
    events.push({
      id: `first-status-${lead.id}`,
      at: lead.first_status_changed_at,
      label: 'First status change',
      detail: lead.status ? `Now: ${lead.status}` : null,
      kind: 'status',
    })
  }

  const sortedTasks = [...tasks].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  )

  for (const t of sortedTasks) {
    if (t.created_at) {
      events.push({
        id: `task-add-${t.id}`,
        at: t.created_at,
        label: `Task added (${t.task_type})`,
        detail: t.due_date ? `Due ${new Date(t.due_date).toLocaleString()}` : null,
        kind: 'task',
      })
    }
    if ((t.status || '').toLowerCase() === 'done') {
      const at = t.completed_at || t.created_at
      events.push({
        id: `task-done-${t.id}`,
        at,
        label: `Task completed (${t.task_type})`,
        detail: t.completed_at ? null : 'Completion time approximate',
        kind: 'task_done',
      })
    }
  }

  const kindOrder = { created: 0, status: 1, task: 2, task_done: 3 }
  events.sort((a, b) => {
    const ta = new Date(a.at).getTime()
    const tb = new Date(b.at).getTime()
    if (ta !== tb) return ta - tb
    return (kindOrder[a.kind] ?? 9) - (kindOrder[b.kind] ?? 9)
  })
  return events
}
