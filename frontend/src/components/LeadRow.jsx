import { Fragment, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { CRM_USERS, LEAD_STATUSES } from '../constants/crm'
import { ACTIVITY_TYPES } from '../constants/activityTypes'
import { countOverduePendingTasks } from '../utils/taskHelpers'
import { isHotNow } from '../utils/leadHot'
import { getPrimarySuggestion, getSuggestionsForLead } from '../utils/aiSuggestions.js'
import { useAuth } from '../hooks/useAuth.js'
import { useScoringConfig } from '../hooks/useScoringConfig.js'
import { recordActivity } from '../services/activityEngine'
import { rescoreLead } from '../services/rescoreLead'
import {
  createLeadAssignedNotification,
  createLeadConvertedNotification,
} from '../services/notificationService'
import LeadDetailTabs from './LeadDetailTabs.jsx'
import MessageModal from './MessageModal.jsx'

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

function digitsForTel(phone) {
  if (phone == null) return ''
  const s = String(phone).trim()
  if (!s) return ''
  return s.replace(/[^\d+]/g, '')
}

function IconBtn({ title, onClick, disabled, href, children, className = '' }) {
  if (href && !disabled) {
    return (
      <a
        href={href}
        className={`lead-icon-btn${className ? ` ${className}` : ''}`}
        title={title}
        aria-label={title}
      >
        {children}
      </a>
    )
  }
  return (
    <button
      type="button"
      className={`lead-icon-btn${disabled ? ' lead-icon-btn--disabled' : ''}${className ? ` ${className}` : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default function LeadRow({
  lead,
  tasks,
  assigneeOptions = CRM_USERS,
  expanded,
  pulseHot,
  onToggleExpand,
  onLeadPatch,
  onTaskPatch,
  onAddTask,
}) {
  const { user, organization } = useAuth()
  const orgId = lead.organization_id ?? organization?.id
  const userId = user?.id ?? null

  const [savingField, setSavingField] = useState(null)
  const [messageOpen, setMessageOpen] = useState(false)
  const [messageLogged, setMessageLogged] = useState(false)
  const [detailTab, setDetailTab] = useState('overview')

  const { config: scoringRow } = useScoringConfig(
    expanded ? lead.industry_id : null,
    expanded ? lead.business_type_id : null,
    expanded ? orgId : null,
  )

  const primary = useMemo(() => getPrimarySuggestion(lead, tasks), [lead, tasks])
  const suggestions = useMemo(() => getSuggestionsForLead(lead, tasks), [lead, tasks])
  const telDigits = useMemo(() => digitsForTel(lead.phone), [lead.phone])

  const overdueCount = countOverduePendingTasks(tasks)
  const statusValue = LEAD_STATUSES.includes(lead.status) ? lead.status : 'new'

  async function applyLeadUpdate(patch, activityContext) {
    const { error } = await supabase.from('leads').update(patch).eq('id', lead.id)
    if (error) throw error

    let updatedLead = { ...lead, ...patch }

    if (activityContext) {
      await recordActivity({
        leadId: lead.id,
        organizationId: orgId,
        userId,
        activityType: activityContext.type,
        description: activityContext.description,
        metadata: activityContext.metadata ?? {},
      })
    }

    const rescoreReason =
      activityContext?.rescoreReason ??
      (activityContext?.type === ACTIVITY_TYPES.STATUS_CHANGED
        ? `Status changed to ${patch.status ?? lead.status}`
        : 'Lead updated')

    const { lead: rescored } = await rescoreLead(updatedLead, {
      reason: rescoreReason,
      userId,
    })
    updatedLead = rescored
    onLeadPatch(lead.id, updatedLead)
    return updatedLead
  }

  async function updateLead(field, value) {
    setSavingField(field)
    try {
      const patch = { [field]: value }

      if (field === 'status') {
        const wasNew = statusValue === 'new' && value !== 'new'
        if (wasNew && !lead.first_status_changed_at) {
          patch.first_status_changed_at = new Date().toISOString()
        }
        if (value === 'contacted' || value === 'converted') {
          patch.responded = true
        }
      }

      const oldAssignee = lead.assigned_to
      let activityContext = null

      if (field === 'status') {
        activityContext = {
          type: ACTIVITY_TYPES.STATUS_CHANGED,
          description: `Status changed to ${value}`,
          metadata: { from: statusValue, to: value },
          rescoreReason: `Status changed to ${value}`,
        }
      } else if (field === 'assigned_to') {
        activityContext = {
          type: ACTIVITY_TYPES.LEAD_ASSIGNED,
          description: `Lead assigned to ${value || 'Unassigned'}`,
          metadata: { from: oldAssignee, to: value },
          rescoreReason: 'Lead assignment updated',
        }
      } else {
        activityContext = {
          type: ACTIVITY_TYPES.LEAD_UPDATED,
          description: `Lead ${field} updated`,
          metadata: { field, value },
          rescoreReason: `Lead ${field} updated`,
        }
      }

      const updatedLead = await applyLeadUpdate(patch, activityContext)

      if (field === 'assigned_to' && value && value !== oldAssignee) {
        await createLeadAssignedNotification(updatedLead, value)
      }

      if (field === 'status' && value === 'converted') {
        await recordActivity({
          leadId: lead.id,
          organizationId: orgId,
          userId,
          activityType: ACTIVITY_TYPES.LEAD_CONVERTED,
          description: `${lead.name} marked as converted`,
        })
        await createLeadConvertedNotification(updatedLead)
      }

      if (field === 'status' && value === 'lost') {
        await recordActivity({
          leadId: lead.id,
          organizationId: orgId,
          userId,
          activityType: ACTIVITY_TYPES.LEAD_LOST,
          description: `${lead.name} marked as lost`,
        })
      }
    } catch (err) {
      console.error('[LeadRow] updateLead failed:', err?.message ?? err)
    } finally {
      setSavingField(null)
    }
  }

  async function markTaskDone(taskId) {
    const task = tasks.find((t) => t.id === taskId)
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

    if (error) return

    await recordActivity({
      leadId: lead.id,
      organizationId: orgId,
      userId,
      activityType: ACTIVITY_TYPES.TASK_COMPLETED,
      description: `Task completed (${task?.task_type ?? 'task'})`,
      metadata: { task_id: taskId, task_type: task?.task_type },
    })

    const leadPatch = { responded: true }
    const { error: leadErr } = await supabase.from('leads').update(leadPatch).eq('id', lead.id)
    if (!leadErr) {
      const updatedLead = { ...lead, ...leadPatch }
      const { lead: rescored } = await rescoreLead(updatedLead, {
        reason: 'Task completed — engagement signal',
        userId,
      })
      onLeadPatch(lead.id, rescored)
    }
  }

  async function handleMessageGenerated(channel) {
    if (messageLogged) return
    setMessageLogged(true)
    await recordActivity({
      leadId: lead.id,
      organizationId: orgId,
      userId,
      activityType: ACTIVITY_TYPES.MESSAGE_GENERATED,
      description: `Sales message generated (${channel})`,
      metadata: { channel },
    })
  }

  const rowClass = [rowHeatClass(lead.category), pulseHot ? 'lead-row--hot-pulse' : '']
    .filter(Boolean)
    .join(' ')

  function handleExpandToggle() {
    if (!expanded) setDetailTab('overview')
    onToggleExpand()
  }

  function handleTimelineClick() {
    setDetailTab('timeline')
    if (!expanded) onToggleExpand()
  }

  return (
    <Fragment>
      <tr id={`lead-row-${lead.id}`} className={rowClass}>
        <td className="lead-name-cell">
          <button
            type="button"
            className="link-button expand-toggle"
            onClick={handleExpandToggle}
            aria-expanded={expanded}
          >
            {expanded ? '▼' : '▶'}
          </button>
          <span className="lead-name-text">{lead.name}</span>
          {isHotNow(lead) ? (
            <span className="badge badge-hot-now badge-hot-now--compact" title="Hot in last 5 min">
              🔥
            </span>
          ) : null}
        </td>
        <td className="num lead-score-cell">{lead.score}</td>
        <td>
          <span className={`${categoryPillClass(lead.category)} pill--compact`}>{lead.category}</span>
        </td>
        <td className="lead-cell-truncate">{lead.industries?.name ?? '—'}</td>
        <td className="lead-cell-truncate">{lead.business_types?.name ?? '—'}</td>
        <td className="lead-cell-truncate">{lead.source}</td>
        <td>
          <select
            className="table-select table-select--compact"
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
            className="table-select table-select--compact"
            value={lead.assigned_to || ''}
            disabled={savingField === 'assigned_to'}
            onChange={(e) => updateLead('assigned_to', e.target.value)}
          >
            <option value="">Unassigned</option>
            {assigneeOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </td>
        <td className="lead-suggestion-cell">
          {primary ? (
            <span
              className={`${suggestionToneClass(primary.tone)} suggestion-chip--compact suggestion-chip--mini`}
              title={primary.text}
            >
              {primary.text}
            </span>
          ) : (
            <span className="muted subtle">—</span>
          )}
        </td>
        <td>
          {overdueCount > 0 ? (
            <span className="badge badge-overdue badge-overdue--compact" title="Overdue tasks">
              {overdueCount}
            </span>
          ) : (
            <span className="muted subtle">—</span>
          )}
        </td>
        <td className="lead-actions-cell">
          <div className="lead-actions-cluster lead-actions-cluster--icons">
            <IconBtn
              title="Call"
              href={telDigits ? `tel:${telDigits}` : undefined}
              disabled={!telDigits}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </IconBtn>
            <IconBtn
              title="Message"
              disabled={!telDigits}
              onClick={() => setMessageOpen(true)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M21 15a2 2 0 0 1-2 2H8l-5 3V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </IconBtn>
            <IconBtn title="Add task" onClick={() => onAddTask(lead)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M9 11h6M12 8v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <rect x="4" y="4" width="16" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            </IconBtn>
            <IconBtn title="Timeline & details" onClick={handleTimelineClick}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.6" />
                <path d="M12 8v4l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </IconBtn>
            <IconBtn
              title="Mark contacted"
              disabled={
                savingField === 'status' ||
                statusValue === 'contacted' ||
                statusValue === 'converted' ||
                statusValue === 'lost'
              }
              onClick={() => updateLead('status', 'contacted')}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="m5 12 4 4L19 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </IconBtn>
          </div>
        </td>
      </tr>
      {suggestions.length > 0 && !expanded ? (
        <tr className="lead-suggestions-row lead-suggestions-row--compact">
          <td colSpan={11}>
            <div className="suggestion-row-inner suggestion-row-inner--compact" role="list">
              {suggestions.map((s) => (
                <span key={s.id} className={suggestionToneClass(s.tone)} role="listitem">
                  {s.text}
                </span>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
      {expanded ? (
        <tr className="lead-row-expanded">
          <td colSpan={11}>
            <div className="tasks-panel tasks-panel--tabs">
              <LeadDetailTabs
                lead={lead}
                tasks={tasks}
                organizationId={orgId}
                scoringRow={scoringRow}
                onMarkTaskDone={markTaskDone}
                onAddTask={onAddTask}
                initialTab={detailTab}
              />
            </div>
          </td>
        </tr>
      ) : null}
      {messageOpen ? (
        <MessageModal
          lead={lead}
          onClose={() => setMessageOpen(false)}
          onMessageGenerated={handleMessageGenerated}
        />
      ) : null}
    </Fragment>
  )
}
