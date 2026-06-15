import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { supabase } from '../lib/supabaseClient'

const CHECKLIST = [
  { id: 'add-lead', label: 'Add lead', path: '/add-lead', verify: 'manual' },
  { id: 'assign-lead', label: 'Assign lead', path: '/dashboard', verify: 'manual' },
  { id: 'change-status', label: 'Change status', path: '/dashboard', verify: 'manual' },
  { id: 'create-task', label: 'Create task', path: '/dashboard', verify: 'manual' },
  { id: 'complete-task', label: 'Complete task', path: '/dashboard', verify: 'manual' },
  { id: 'whatsapp', label: 'WhatsApp send', path: '/dashboard', verify: 'manual' },
  { id: 'hubspot', label: 'HubSpot import', path: '/dashboard', verify: 'manual' },
  { id: 'invite', label: 'Invite user', path: '/team', verify: 'manual' },
  { id: 'analytics', label: 'Analytics load', path: '/analytics', verify: 'auto' },
  { id: 'notifications', label: 'Notifications', path: '/notifications', verify: 'auto' },
  { id: 'timeline', label: 'Timeline', path: '/dashboard', verify: 'manual' },
  { id: 'followups', label: 'Follow-ups', path: '/follow-ups', verify: 'auto' },
  { id: 'hot-lead', label: 'Realtime hot lead alerts', path: '/dashboard', verify: 'manual' },
]

export default function QA() {
  const { organization } = useAuth()
  const orgId = organization?.id
  const [checked, setChecked] = useState(() => {
    try {
      const raw = localStorage.getItem('qa-checklist-v1')
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })
  const [autoStatus, setAutoStatus] = useState({})
  const [autoLoading, setAutoLoading] = useState(false)

  useEffect(() => {
    localStorage.setItem('qa-checklist-v1', JSON.stringify(checked))
  }, [checked])

  const runAutoChecks = useCallback(async () => {
    if (!orgId) return
    setAutoLoading(true)
    const status = {}

    try {
      const { count: leadCount } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
      status.analytics = leadCount != null ? 'pass' : 'fail'

      const { count: notifCount, error: notifErr } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
      status.notifications = notifErr ? 'fail' : 'pass'

      const { count: taskCount, error: taskErr } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'pending')
      status.followups = taskErr ? 'fail' : 'pass'

      void notifCount
      void taskCount
    } catch {
      status.analytics = 'fail'
    }

    setAutoStatus(status)
    setAutoLoading(false)
  }, [orgId])

  useEffect(() => {
    void runAutoChecks()
  }, [runAutoChecks])

  function toggle(id) {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const doneCount = CHECKLIST.filter((item) => checked[item.id]).length

  return (
    <div className="page page-wide">
      <header className="page-header page-header-row">
        <div>
          <h1>QA checklist</h1>
          <p className="page-subtitle">
            Manual verification checklist for MVP release. {doneCount}/{CHECKLIST.length} marked complete.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void runAutoChecks()} disabled={autoLoading}>
            {autoLoading ? 'Running checks…' : 'Re-run auto checks'}
          </button>
          <Link className="btn btn-primary" to="/dashboard">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="card qa-checklist">
        <ul className="qa-list">
          {CHECKLIST.map((item) => {
            const auto = item.verify === 'auto' ? autoStatus[item.id.replace('-', '').split('-')[0]] : null
            const autoKey =
              item.id === 'analytics'
                ? autoStatus.analytics
                : item.id === 'notifications'
                  ? autoStatus.notifications
                  : item.id === 'followups'
                    ? autoStatus.followups
                    : null
            return (
              <li key={item.id} className={`qa-item${checked[item.id] ? ' qa-item--done' : ''}`}>
                <label className="qa-item-label">
                  <input
                    type="checkbox"
                    checked={Boolean(checked[item.id])}
                    onChange={() => toggle(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
                <div className="qa-item-meta">
                  {item.verify === 'auto' && autoKey ? (
                    <span className={`qa-auto-badge qa-auto-badge--${autoKey}`}>
                      Auto: {autoKey === 'pass' ? 'OK' : 'Check'}
                    </span>
                  ) : (
                    <span className="muted subtle">Manual</span>
                  )}
                  <Link to={item.path} className="btn btn-secondary btn-sm">
                    Open
                  </Link>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
