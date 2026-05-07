import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth.js'
import { isDueTodayFollowUp, isOverdueFollowUp, sortByDueAsc } from '../utils/followUpBuckets'
import { isSalesperson } from '../utils/access.js'

function normalizeLead(embed) {
  if (!embed) return null
  return Array.isArray(embed) ? embed[0] ?? null : embed
}

function categoryPillClass(category) {
  const c = (category || '').toLowerCase()
  if (c === 'hot') return 'pill pill-hot'
  if (c === 'warm') return 'pill pill-warm'
  if (c === 'cold') return 'pill pill-cold'
  return 'pill'
}

export default function FollowUps() {
  const { organization, profile } = useAuth()
  const orgId = organization?.id
  const profileName = profile?.full_name?.trim() || ''
  const salesRestricted = isSalesperson(profile?.role)

  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingId, setSavingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (!orgId) {
      setLoading(false)
      setRows([])
      return
    }

    const { data, error: fetchError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        lead_id,
        task_type,
        due_date,
        status,
        organization_id,
        leads (
          id,
          name,
          phone,
          category,
          assigned_to,
          organization_id
        )
      `,
      )
      .eq('status', 'pending')
      .eq('organization_id', orgId)

    setLoading(false)

    if (fetchError) {
      setError(fetchError.message)
      return
    }

    let list = (data ?? [])
      .map((row) => {
        const lead = normalizeLead(row.leads)
        return { ...row, lead }
      })
      .filter((row) => row.lead && row.lead.organization_id === orgId)

    if (salesRestricted && profileName) {
      list = list.filter((row) => (row.lead.assigned_to || '').trim() === profileName)
    }

    setRows(list)
  }, [orgId, salesRestricted, profileName])

  useEffect(() => {
    startTransition(() => {
      void load()
    })
  }, [load])

  useEffect(() => {
    const id = window.setInterval(() => {
      void load()
    }, 60_000)
    return () => window.clearInterval(id)
  }, [load])

  const { overdue, today } = useMemo(() => {
    const od = rows.filter((r) => isOverdueFollowUp(r.due_date)).sort(sortByDueAsc)
    const td = rows.filter((r) => isDueTodayFollowUp(r.due_date)).sort(sortByDueAsc)
    return { overdue: od, today: td }
  }, [rows])

  async function markDone(taskId) {
    setSavingId(taskId)
    const completed_at = new Date().toISOString()
    let { error: upErr } = await supabase
      .from('tasks')
      .update({ status: 'done', completed_at })
      .eq('id', taskId)
      .eq('organization_id', orgId)
    if (upErr) {
      ;({ error: upErr } = await supabase.from('tasks').update({ status: 'done' }).eq('id', taskId))
    }
    setSavingId(null)
    if (!upErr) setRows((prev) => prev.filter((r) => r.id !== taskId))
  }

  function openLead(leadId) {
    navigate(`/dashboard?focusLead=${encodeURIComponent(leadId)}`)
  }

  function formatDue(dueIso) {
    return new Date(dueIso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }

  return (
    <div className="page page-wide page-follow-ups">
      <header className="page-header page-header-row">
        <div>
          <h1>Follow-ups</h1>
          <p className="page-subtitle">
            Pending tasks due today or overdue. Refreshes every minute.
            {salesRestricted ? ' Showing tasks for leads assigned to you.' : null}
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void load()}>
            Refresh
          </button>
          <Link className="btn btn-primary" to="/dashboard">
            Dashboard
          </Link>
        </div>
      </header>

      {error ? <div className="banner banner-error">{error}</div> : null}

      {loading ? (
        <p className="muted">Loading tasks…</p>
      ) : (
        <>
          <section className="follow-ups-section follow-ups-section--overdue card">
            <h2 className="follow-ups-heading follow-ups-heading--overdue">
              <span className="follow-ups-heading-icon" aria-hidden>
                🔴
              </span>
              Overdue tasks
              <span className="follow-ups-count follow-ups-count--overdue">{overdue.length}</span>
            </h2>
            {overdue.length === 0 ? (
              <p className="muted follow-ups-empty">No overdue pending tasks.</p>
            ) : (
              <ul className="follow-ups-list">
                {overdue.map((row) => (
                  <li key={row.id} className="follow-ups-item follow-ups-item--overdue">
                    <div className="follow-ups-item-grid">
                      <div>
                        <div className="follow-ups-lead-name">{row.lead.name}</div>
                        <div className="muted follow-ups-phone">{row.lead.phone || '—'}</div>
                      </div>
                      <div className="follow-ups-meta">
                        <span className="follow-ups-type">{row.task_type}</span>
                        <span className="muted follow-ups-due">{formatDue(row.due_date)}</span>
                      </div>
                      <div>
                        <span className={categoryPillClass(row.lead.category)}>
                          {row.lead.category}
                        </span>
                      </div>
                      <div className="muted follow-ups-assign">
                        {row.lead.assigned_to || 'Unassigned'}
                      </div>
                      <div className="follow-ups-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={savingId === row.id}
                          onClick={() => markDone(row.id)}
                        >
                          {savingId === row.id ? 'Saving…' : 'Mark done'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => openLead(row.lead_id)}
                        >
                          Open lead
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="follow-ups-section follow-ups-section--today card">
            <h2 className="follow-ups-heading follow-ups-heading--today">
              <span className="follow-ups-heading-icon" aria-hidden>
                📅
              </span>
              Today&apos;s tasks
              <span className="follow-ups-count follow-ups-count--today">{today.length}</span>
            </h2>
            {today.length === 0 ? (
              <p className="follow-ups-celebrate">No tasks for today 🎉</p>
            ) : (
              <ul className="follow-ups-list">
                {today.map((row) => (
                  <li key={row.id} className="follow-ups-item follow-ups-item--today">
                    <div className="follow-ups-item-grid">
                      <div>
                        <div className="follow-ups-lead-name">{row.lead.name}</div>
                        <div className="muted follow-ups-phone">{row.lead.phone || '—'}</div>
                      </div>
                      <div className="follow-ups-meta">
                        <span className="follow-ups-type">{row.task_type}</span>
                        <span className="muted follow-ups-due">{formatDue(row.due_date)}</span>
                      </div>
                      <div>
                        <span className={categoryPillClass(row.lead.category)}>
                          {row.lead.category}
                        </span>
                      </div>
                      <div className="muted follow-ups-assign">
                        {row.lead.assigned_to || 'Unassigned'}
                      </div>
                      <div className="follow-ups-actions">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={savingId === row.id}
                          onClick={() => markDone(row.id)}
                        >
                          {savingId === row.id ? 'Saving…' : 'Mark done'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => openLead(row.lead_id)}
                        >
                          Open lead
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
