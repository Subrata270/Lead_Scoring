import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { isDueTodayFollowUp, isOverdueFollowUp, sortByDueAsc } from '../utils/followUpBuckets'

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
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingId, setSavingId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('tasks')
      .select(
        `
        id,
        lead_id,
        task_type,
        due_date,
        status,
        leads (
          id,
          name,
          phone,
          category,
          assigned_to
        )
      `,
      )
      .eq('status', 'pending')

    setLoading(false)

    if (fetchError) {
      setError(fetchError.message)
      return
    }

    const list = (data ?? [])
      .map((row) => {
        const lead = normalizeLead(row.leads)
        return { ...row, lead }
      })
      .filter((row) => row.lead)

    setRows(list)
  }, [])

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
