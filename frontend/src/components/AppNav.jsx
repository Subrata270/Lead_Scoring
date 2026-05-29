import { useEffect, useRef, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { normalizeRole } from '../utils/access.js'
import { useUnreadNotificationCount } from '../hooks/useNotifications.js'

function NavBellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2a5 5 0 0 0-5 5v2.5c0 .55-.22 1.08-.61 1.47L5.5 13.5A1.5 1.5 0 0 0 6.75 16h10.5a1.5 1.5 0 0 0 1.25-2.5l-.89-.53A2.08 2.08 0 0 1 17 9.5V7a5 5 0 0 0-5-5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10 18a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function useClickOutside(ref, handler) {
  useEffect(() => {
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) handler()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [ref, handler])
}

export default function AppNav() {
  const { profile, organization, signOut, user } = useAuth()
  const isAdmin = normalizeRole(profile?.role) === 'admin'
  const { count: unreadNotifications } = useUnreadNotificationCount(
    organization?.id,
    user?.id,
  )

  const [userOpen, setUserOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const userRef = useRef(null)
  const settingsRef = useRef(null)

  useClickOutside(userRef, () => setUserOpen(false))
  useClickOutside(settingsRef, () => setSettingsOpen(false))

  const displayName = profile?.full_name?.trim() || 'Team member'
  const orgName = organization?.name || 'Organization'
  const roleLabel = profile?.role ? String(profile.role) : '—'
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  const centerLinks = [
    { to: '/dashboard', label: 'Dashboard', end: true },
    { to: '/dashboard', label: 'Leads', end: false },
    { to: '/analytics', label: 'Analytics' },
    ...(isAdmin ? [{ to: '/team', label: 'Team' }] : []),
  ]

  const settingsLinks = [
    { to: '/assignment-rules', label: 'Assignment Rules' },
    { to: '/config', label: 'Scoring Config' },
    { to: '/import-leads', label: 'Import Leads' },
    { to: '/follow-ups', label: 'Follow-Ups' },
    { to: '/add-lead', label: 'Add Lead' },
  ]

  return (
    <nav className="app-nav app-nav--crm">
      <div className="app-nav-left">
        <Link to="/dashboard" className="app-brand app-brand--crm">
          <span className="app-brand-mark" aria-hidden />
          AI Lead Scoring
        </Link>
      </div>

      <div className="app-nav-center">
        {centerLinks.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `app-nav-link${isActive ? ' app-nav-link--active' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="app-nav-right">
        <Link
          to="/notifications"
          className="app-nav-icon-btn"
          title="Notifications"
          aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ''}`}
        >
          <NavBellIcon />
          {unreadNotifications > 0 ? (
            <span className="app-nav-bell-badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>
          ) : null}
        </Link>

        <div className="app-nav-dropdown-wrap" ref={settingsRef}>
          <button
            type="button"
            className="app-nav-icon-btn app-nav-settings-btn"
            onClick={() => {
              setSettingsOpen((v) => !v)
              setUserOpen(false)
            }}
            aria-expanded={settingsOpen}
            aria-haspopup="true"
            title="Settings"
          >
            <GearIcon />
          </button>
          {settingsOpen ? (
            <div className="app-nav-dropdown app-nav-dropdown--settings" role="menu">
              <div className="app-nav-dropdown-label">Settings</div>
              {settingsLinks.map((item) => (
                <Link
                  key={item.to + item.label}
                  to={item.to}
                  className="app-nav-dropdown-item"
                  role="menuitem"
                  onClick={() => setSettingsOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <div className="app-nav-dropdown-wrap" ref={userRef}>
          <button
            type="button"
            className="app-nav-user-btn"
            onClick={() => {
              setUserOpen((v) => !v)
              setSettingsOpen(false)
            }}
            aria-expanded={userOpen}
            aria-haspopup="true"
          >
            <span className="app-nav-avatar" aria-hidden>
              {initials}
            </span>
            <span className="app-nav-user-name">{displayName}</span>
            <ChevronIcon />
          </button>
          {userOpen ? (
            <div className="app-nav-dropdown app-nav-dropdown--user" role="menu">
              <div className="app-nav-user-meta">
                <strong>{displayName}</strong>
                <span className="muted">{orgName}</span>
                <span className="app-nav-role-pill">{roleLabel}</span>
              </div>
              <button
                type="button"
                className="app-nav-dropdown-item app-nav-dropdown-item--danger"
                role="menuitem"
                onClick={() => void signOut()}
              >
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  )
}
