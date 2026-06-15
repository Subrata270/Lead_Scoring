export default function EmptyState({ icon, title, description, children }) {
  return (
    <div className="empty-state-ui">
      {icon ? <div className="empty-state-ui-icon" aria-hidden>{icon}</div> : null}
      <h3 className="empty-state-ui-title">{title}</h3>
      {description ? <p className="empty-state-ui-desc muted">{description}</p> : null}
      {children ? <div className="empty-state-ui-actions">{children}</div> : null}
    </div>
  )
}

export function EmptyInboxIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
      <rect x="8" y="12" width="32" height="28" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 18h32" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="24" cy="28" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
    </svg>
  )
}

export function EmptySearchIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden>
      <circle cx="22" cy="22" r="10" stroke="currentColor" strokeWidth="1.5" />
      <path d="M30 30l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
