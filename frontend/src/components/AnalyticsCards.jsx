/**
 * Management-style funnel and industry highlight cards for Analytics.
 */

function pctBar(pct) {
  return (
    <div className="funnel-pct-track" aria-hidden>
      <div className="funnel-pct-fill" style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

export function ConversionFunnelCards({ funnel }) {
  if (!funnel || funnel.total === 0) {
    return (
      <div className="analytics-cards-grid">
        <div className="card funnel-empty-card">
          <p className="muted">No leads in this period — funnel metrics will appear once data exists.</p>
        </div>
      </div>
    )
  }

  const items = [
    { key: 'total', label: 'Total leads', count: funnel.total, pct: 100, tone: 'neutral' },
    {
      key: 'contacted',
      label: 'Contacted',
      subtitle: 'Status = contacted',
      count: funnel.contacted,
      pct: funnel.pct_contacted,
      tone: 'blue',
    },
    {
      key: 'followup',
      label: 'Follow-up active',
      subtitle: 'Has pending task',
      count: funnel.followup_active,
      pct: funnel.pct_followup_active,
      tone: 'amber',
    },
    {
      key: 'converted',
      label: 'Converted',
      count: funnel.converted,
      pct: funnel.pct_converted,
      tone: 'green',
    },
    {
      key: 'lost',
      label: 'Lost',
      count: funnel.lost,
      pct: funnel.pct_lost,
      tone: 'slate',
    },
  ]

  return (
    <div className="analytics-cards-grid funnel-cards-grid">
      {items.map((item) => (
        <div key={item.key} className={`card funnel-metric-card funnel-metric-card--${item.tone}`}>
          <div className="funnel-metric-label">{item.label}</div>
          {item.subtitle ? <div className="funnel-metric-sub muted">{item.subtitle}</div> : null}
          <div className="funnel-metric-count">{item.count.toLocaleString()}</div>
          <div className="funnel-metric-pct-row">
            <span className="funnel-metric-pct">{item.pct.toFixed(1)}%</span>
            <span className="muted subtle">of total</span>
          </div>
          {pctBar(item.pct)}
        </div>
      ))}
    </div>
  )
}

export function IndustryHighlightCards({ byIndustry }) {
  const top = (byIndustry || []).slice(0, 4)
  if (!top.length) {
    return null
  }

  return (
    <div className="analytics-cards-grid industry-cards-grid">
      {top.map((row) => (
        <div key={row.industry} className="card industry-metric-card">
          <div className="industry-metric-name">{row.industry}</div>
          <dl className="industry-metric-dl">
            <div>
              <dt>Leads</dt>
              <dd>{row.lead_count}</dd>
            </div>
            <div>
              <dt>Hot</dt>
              <dd>{row.hot_count}</dd>
            </div>
            <div>
              <dt>Conv. %</dt>
              <dd>{row.conversion_rate.toFixed(1)}%</dd>
            </div>
            <div>
              <dt>Avg budget</dt>
              <dd>{Math.round(row.avg_budget || 0).toLocaleString()}</dd>
            </div>
          </dl>
        </div>
      ))}
    </div>
  )
}
