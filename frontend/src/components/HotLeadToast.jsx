export default function HotLeadToast({ items, onDismiss }) {
  if (items.length === 0) return null

  return (
    <div className="hot-toast-host" aria-live="assertive">
      {items.map((item) => (
        <div key={item.toastId} className="hot-toast" role="status">
          <div className="hot-toast-title">🔥 New Hot Lead</div>
          <div className="hot-toast-name">{item.name}</div>
          <dl className="hot-toast-meta">
            <div>
              <dt>Source</dt>
              <dd>{item.source ?? '—'}</dd>
            </div>
            <div>
              <dt>Score</dt>
              <dd className="hot-toast-score">{item.score ?? '—'}</dd>
            </div>
          </dl>
          <button
            type="button"
            className="hot-toast-close"
            onClick={() => onDismiss(item.toastId)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
