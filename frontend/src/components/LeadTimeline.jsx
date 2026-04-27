import { buildLeadTimelineEvents } from '../utils/timelineEvents'

function formatAt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function LeadTimeline({ lead, tasks }) {
  const events = buildLeadTimelineEvents(lead, tasks)

  if (events.length === 0) {
    return <p className="muted">No timeline events yet.</p>
  }

  return (
    <div className="lead-timeline">
      <h4 className="lead-timeline-title">Timeline</h4>
      <ul className="lead-timeline-list">
        {events.map((ev) => (
          <li key={ev.id} className={`lead-timeline-item lead-timeline-item--${ev.kind}`}>
            <span className="lead-timeline-dot" aria-hidden />
            <div className="lead-timeline-body">
              <time className="lead-timeline-time">{formatAt(ev.at)}</time>
              <div className="lead-timeline-label">{ev.label}</div>
              {ev.detail ? <div className="lead-timeline-detail muted">{ev.detail}</div> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
