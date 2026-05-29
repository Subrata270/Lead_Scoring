import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useNotifications } from '../hooks/useNotifications.js'
import {
  notificationTypeIcon,
  notificationTypeLabel,
} from '../constants/notificationTypes.js'

function formatAt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export default function Notifications({ onRead }) {
  const { organization, user } = useAuth()
  const orgId = organization?.id
  const userId = user?.id

  const { items, loading, error, markRead, markAllRead, reload } = useNotifications(
    orgId,
    userId,
  )

  const unreadCount = items.filter((n) => !n.is_read).length

  async function handleMarkAll() {
    await markAllRead()
    onRead?.()
  }

  async function handleMarkRead(id) {
    await markRead(id)
    onRead?.()
  }

  return (
    <div className="page page-wide">
      <header className="page-header">
        <div className="notifications-header">
          <div>
            <h1>Notifications</h1>
            <p className="page-subtitle">
              Hot leads, assignments, overdue tasks, and conversions
            </p>
          </div>
          <div className="notifications-header-actions">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reload()}>
              Refresh
            </button>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void handleMarkAll()}
              >
                Mark all read
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <div className="banner banner-error">{error}</div> : null}

      {loading ? (
        <p className="muted">Loading notifications…</p>
      ) : items.length === 0 ? (
        <div className="card empty-state">
          <p>No notifications yet.</p>
          <p className="muted subtle">
            You will see alerts when hot leads arrive, leads are assigned, tasks go overdue, or
            leads convert.
          </p>
        </div>
      ) : (
        <ul className="notification-list card">
          {items.map((n) => (
            <li
              key={n.id}
              className={`notification-item ${n.is_read ? 'notification-item--read' : 'notification-item--unread'}`}
            >
              <div className="notification-icon" aria-hidden>
                {notificationTypeIcon(n.notification_type)}
              </div>
              <div className="notification-body">
                <div className="notification-top">
                  <strong className="notification-title">{n.title}</strong>
                  <span className="notification-type muted">
                    {notificationTypeLabel(n.notification_type)}
                  </span>
                </div>
                <p className="notification-message">{n.message}</p>
                <time className="notification-time muted">{formatAt(n.created_at)}</time>
                <div className="notification-actions">
                  {n.lead_id ? (
                    <Link
                      className="btn btn-secondary btn-sm"
                      to={`/dashboard?focusLead=${n.lead_id}`}
                    >
                      View lead
                    </Link>
                  ) : null}
                  {!n.is_read ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => void handleMarkRead(n.id)}
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
