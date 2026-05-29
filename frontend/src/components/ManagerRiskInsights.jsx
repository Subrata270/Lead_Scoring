import { Link } from 'react-router-dom'

export default function ManagerRiskInsights({ insights, loading }) {
  if (loading) {
    return (
      <section className="analytics-section card">
        <h2 className="analytics-section-title">AI manager insights</h2>
        <p className="muted">Loading pipeline health…</p>
      </section>
    )
  }

  if (!insights?.total) {
    return (
      <section className="analytics-section card">
        <h2 className="analytics-section-title">AI manager insights</h2>
        <p className="muted">No open pipeline leads to analyze.</p>
      </section>
    )
  }

  const cards = [
    {
      key: 'at_risk',
      label: 'Leads at risk',
      count: insights.atRisk,
      pct: insights.atRiskPct,
      tone: 'at_risk',
      hint: 'No activity in 7+ days',
    },
    {
      key: 'stale',
      label: 'Stale leads',
      count: insights.stale,
      pct: insights.stalePct,
      tone: 'stale',
      hint: 'Aging 15+ days',
    },
    {
      key: 'critical',
      label: 'Critical leads',
      count: insights.critical,
      pct: insights.criticalPct,
      tone: 'critical',
      hint: '30+ days, no recent activity',
    },
  ]

  return (
    <section className="analytics-section card copilot-manager-section">
      <h2 className="analytics-section-title">AI manager insights</h2>
      <p className="muted section-hint">
        Pipeline health across {insights.total} open leads — powered by activity and aging signals.
      </p>

      <div className="copilot-manager-grid">
        {cards.map((c) => (
          <div key={c.key} className={`copilot-manager-card copilot-manager-card--${c.tone}`}>
            <span className="copilot-manager-label">{c.label}</span>
            <strong className="copilot-manager-count">{c.count}</strong>
            <span className="copilot-manager-pct">{c.pct.toFixed(1)}% of pipeline</span>
            <span className="muted subtle copilot-manager-hint">{c.hint}</span>
          </div>
        ))}
        <div className="copilot-manager-card copilot-manager-card--healthy">
          <span className="copilot-manager-label">Healthy leads</span>
          <strong className="copilot-manager-count">{insights.healthy}</strong>
          <span className="copilot-manager-pct">{insights.healthyPct.toFixed(1)}% of pipeline</span>
          <span className="muted subtle copilot-manager-hint">Recent activity + strong score</span>
        </div>
      </div>

      {insights.critical > 0 || insights.stale > 0 ? (
        <p className="copilot-manager-cta">
          <Link to="/dashboard">Review leads on dashboard →</Link>
        </p>
      ) : null}
    </section>
  )
}
