import { Fragment, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { CRM_USERS, LEAD_STATUSES } from '../constants/crm'
import { countOverduePendingTasks, isTaskOverdue } from '../utils/taskHelpers'
import { formatTimeToFirstAction, isHotNow } from '../utils/leadHot'
import { getSuggestionsForLead } from '../utils/aiSuggestions.js'
import LeadTimeline from './LeadTimeline.jsx'

function categoryPillClass(category) {
  const c = (category || '').toLowerCase()
  if (c === 'hot') return 'pill pill-hot'
  if (c === 'warm') return 'pill pill-warm'
  if (c === 'cold') return 'pill pill-cold'
  return 'pill'
}

function rowHeatClass(category) {
  const c = (category || '').toLowerCase()
  if (c === 'hot') return 'lead-row lead-row--hot'
  if (c === 'warm') return 'lead-row lead-row--warm'
  if (c === 'cold') return 'lead-row lead-row--cold'
  return 'lead-row'
}

function suggestionToneClass(tone) {
  return `suggestion-chip suggestion-chip--${tone}`
}

export default function LeadRow({
  lead,
  tasks,
  expanded,
  pulseHot,
  onToggleExpand,
  onLeadPatch,
  onTaskPatch,
  onAddTask,
}) {
  const [savingField, setSavingField] = useState(null)

  const suggestions = useMemo(() => getSuggestionsForLead(lead, tasks), [lead, tasks])

  const overdueCount = countOverduePendingTasks(tasks)
  const statusValue = LEAD_STATUSES.includes(lead.status) ? lead.status : 'new'

  async function updateLead(field, value) {
    setSavingField(field)
    const patch = { [field]: value }
    if (field === 'status') {
      const wasNew = statusValue === 'new' && value !== 'new'
      if (wasNew && !lead.first_status_changed_at) {
        patch.first_status_changed_at = new Date().toISOString()
      }
    }
    const { error } = await supabase.from('leads').update(patch).eq('id', lead.id)
    setSavingField(null)
    if (!error) onLeadPatch(lead.id, patch)
  }

  async function markTaskDone(taskId) {
    const completed_at = new Date().toISOString()
    let { error } = await supabase
      .from('tasks')
      .update({ status: 'done', completed_at })
      .eq('id', taskId)
    if (error) {
      ;({ error } = await supabase.from('tasks').update({ status: 'done' }).eq('id', taskId))
      if (!error) onTaskPatch(taskId, { status: 'done' })
    } else {
      onTaskPatch(taskId, { status: 'done', completed_at })
    }
  }

  const ttf = formatTimeToFirstAction(lead.created_at, lead.first_status_changed_at)

  const rowClass = [
    rowHeatClass(lead.category),
    pulseHot ? 'lead-row--hot-pulse' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Fragment>
      <tr id={`lead-row-${lead.id}`} className={rowClass}>
        <td className="lead-name-cell">
          <button
            type="button"
            className="link-button expand-toggle"
            onClick={onToggleExpand}
            aria-expanded={expanded}
          >
            {expanded ? '▼' : '▶'}
          </button>
          {lead.name}
          {isHotNow(lead) ? (
            <span className="badge badge-hot-now" title="Created in the last 5 minutes">
              🔥 HOT NOW
            </span>
          ) : null}
        </td>
        <td className="num">{lead.score}</td>
        <td>
          <span className={categoryPillClass(lead.category)}>{lead.category}</span>
        </td>
        <td>{lead.industries?.name ?? '—'}</td>
        <td>{lead.business_types?.name ?? '—'}</td>
        <td>{lead.source}</td>
        <td>
          <select
            className="table-select"
            value={statusValue}
            disabled={savingField === 'status'}
            onChange={(e) => updateLead('status', e.target.value)}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </td>
        <td>
          <select
            className="table-select"
            value={lead.assigned_to || ''}
            disabled={savingField === 'assigned_to'}
            onChange={(e) => updateLead('assigned_to', e.target.value)}
          >
            <option value="">Unassigned</option>
            {CRM_USERS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </td>
        <td>
          {overdueCount > 0 ? (
            <span className="badge badge-overdue" title="Overdue pending tasks">
              {overdueCount} overdue
            </span>
          ) : (
            <span className="muted subtle">—</span>
          )}
        </td>
        <td>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddTask(lead)}>
            Add task
          </button>
        </td>
      </tr>
      {suggestions.length > 0 ? (
        <tr className="lead-suggestions-row">
          <td colSpan={10}>
            <div className="suggestion-row-inner" role="list" aria-label="AI suggestions">
              {suggestions.map((s) => (
                <span key={s.id} className={suggestionToneClass(s.tone)} role="listitem">
                  <span className="suggestion-icon" aria-hidden>
                    {s.icon}
                  </span>
                  <span>{s.text}</span>
                </span>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
      {expanded ? (
        <tr className="lead-row-expanded">
          <td colSpan={10}>
            <div className="tasks-panel">
              <LeadTimeline lead={lead} tasks={tasks} />
              <h3 className="tasks-panel-title">Tasks for {lead.name}</h3>
              {ttf ? (
                <p className="muted ttf-line">
                  Time to first status change: <strong>{ttf}</strong>
                </p>
              ) : null}
              {tasks.length === 0 ? (
                <p className="muted">No tasks yet.</p>
              ) : (
                <table className="nested-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Due</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.id}>
                        <td>{t.task_type}</td>
                        <td>
                          {new Date(t.due_date).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                          {isTaskOverdue(t.due_date, t.status) ? (
                            <span className="badge badge-overdue nested-overdue">overdue</span>
                          ) : null}
                        </td>
                        <td>{t.status}</td>
                        <td>
                          {t.status === 'pending' ? (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => markTaskDone(t.id)}
                            >
                              Mark done
                            </button>
                          ) : (
                            <span className="muted subtle">Done</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  )
}
