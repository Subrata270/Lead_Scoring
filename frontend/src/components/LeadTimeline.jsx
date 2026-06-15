import { useEffect, useState } from 'react'
import { fetchLeadActivities } from '../services/activityEngine'
import { activityTimelineMeta } from '../constants/activityTypes'

function formatAt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function LeadTimeline({ leadId, organizationId, refreshKey = 0 }) {
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!leadId || !organizationId) {
      setActivities([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void fetchLeadActivities(leadId, organizationId).then(({ data, error: err }) => {
      if (cancelled) return
      setLoading(false)
      if (err) {
        setError(err.message)
        setActivities([])
        return
      }
      setActivities(data)
    })

    return () => {
      cancelled = true
    }
  }, [leadId, organizationId, refreshKey])

  if (loading) {
    return <p className="muted subtle">Loading timeline…</p>
  }

  if (error) {
    return <p className="muted subtle">Could not load timeline: {error}</p>
  }

  if (activities.length === 0) {
    return <p className="muted">No timeline events yet.</p>
  }

  return (
    <div className="lead-timeline">
      <h4 className="lead-timeline-title">Timeline</h4>
      <ul className="lead-timeline-list">
        {activities.map((act) => {
          const meta = activityTimelineMeta(act.activity_type)
          return (
            <li
              key={act.id}
              className={`lead-timeline-item lead-timeline-item--${meta.kind}`}
            >
              <span className="lead-timeline-dot" aria-hidden />
              <div className="lead-timeline-body">
                <time className="lead-timeline-time">{formatAt(act.created_at)}</time>
                <div className="lead-timeline-label">
                  <span className="lead-timeline-icon" aria-hidden>
                    {meta.icon}
                  </span>{' '}
                  {act.description}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
