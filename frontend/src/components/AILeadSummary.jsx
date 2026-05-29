function formatAt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function categoryPillClass(category) {
  const c = (category || '').toLowerCase()
  if (c === 'hot') return 'pill pill-hot'
  if (c === 'warm') return 'pill pill-warm'
  if (c === 'cold') return 'pill pill-cold'
  return 'pill'
}

export default function AILeadSummary({ summary }) {
  if (!summary) return null

  return (
    <div className="copilot-card copilot-summary">
      <h4 className="copilot-card-title">Lead overview</h4>
      <p className="copilot-summary-text">{summary.overview}</p>

      <dl className="copilot-summary-grid">
        <div>
          <dt>Budget</dt>
          <dd>{summary.budgetSummary}</dd>
        </div>
        <div>
          <dt>Industry</dt>
          <dd>{summary.industrySummary}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className="copilot-capitalize">{summary.status}</dd>
        </div>
        <div>
          <dt>Last activity</dt>
          <dd>
            {summary.lastActivity ? (
              <>
                {summary.lastActivity.description}
                <time className="copilot-time muted"> · {formatAt(summary.lastActivity.at)}</time>
              </>
            ) : (
              <span className="muted">No activities yet</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Score</dt>
          <dd>
            <strong>{summary.score}</strong>
            <span className="muted"> / 100</span>
            {summary.scoreTrend?.label ? (
              <span className={`copilot-trend copilot-trend--${summary.scoreTrend.direction}`}>
                {' '}
                · {summary.scoreTrend.label}
              </span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>
            <span className={categoryPillClass(summary.category)}>{summary.category}</span>
          </dd>
        </div>
      </dl>
    </div>
  )
}
