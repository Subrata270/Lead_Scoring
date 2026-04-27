import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import {
  aggregateByAssignee,
  aggregateBySource,
  bestWorstSource,
  leadsCreatedPerDay,
  topPerformerByConversion,
} from '../utils/analyticsAggregates'
import { formatDurationMs } from '../utils/responseTimeFormat'
import { LeadsPerDayLineChart, SourceConversionBarChart } from '../components/Charts.jsx'

export default function Analytics() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('leads')
      .select(
        'id,name,score,category,source,status,assigned_to,created_at,first_status_changed_at,responded',
      )
    setLoading(false)
    if (err) {
      setError(err.message)
      return
    }
    setLeads(data ?? [])
  }, [])

  useEffect(() => {
    startTransition(() => {
      void load()
    })
  }, [load])

  const bySource = useMemo(() => aggregateBySource(leads), [leads])
  const { best, worst } = useMemo(() => bestWorstSource(bySource), [bySource])
  const byRep = useMemo(() => aggregateByAssignee(leads), [leads])
  const topRep = useMemo(() => topPerformerByConversion(byRep), [byRep])
  const perDay = useMemo(() => leadsCreatedPerDay(leads), [leads])

  return (
    <div className="page page-wide page-analytics">
      <header className="page-header page-header-row">
        <div>
          <h1>Analytics</h1>
          <p className="page-subtitle">Source performance, rep leaderboard, and pipeline trends.</p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={load}>
            Refresh
          </button>
          <Link className="btn btn-primary" to="/dashboard">
            Dashboard
          </Link>
        </div>
      </header>

      {error ? <div className="banner banner-error">{error}</div> : null}

      {loading ? (
        <p className="muted">Loading analytics…</p>
      ) : (
        <>
          <div className="insight-banners">
            {best ? (
              <div className="insight-card insight-card--good">
                <div className="insight-label">Best performing source</div>
                <div className="insight-value">
                  {best.source}{' '}
                  <span className="insight-meta">
                    ({best.converted_leads}/{best.total_leads} · {best.conversion_rate.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ) : null}
            {worst &&
            best &&
            bySource.length > 1 &&
            (worst.source !== best.source ||
              Math.abs(worst.conversion_rate - best.conversion_rate) > 1e-6) ? (
              <div className="insight-card insight-card--muted">
                <div className="insight-label">Worst performing source</div>
                <div className="insight-value">
                  {worst.source}{' '}
                  <span className="insight-meta">
                    ({worst.converted_leads}/{worst.total_leads} · {worst.conversion_rate.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <section className="analytics-section card">
            <h2 className="analytics-section-title">Source performance</h2>
            <SourceConversionBarChart data={bySource} />
            <div className="table-wrap analytics-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Leads</th>
                    <th>Converted</th>
                    <th>Conversion %</th>
                  </tr>
                </thead>
                <tbody>
                  {bySource.map((r) => (
                    <tr key={r.source}>
                      <td>{r.source}</td>
                      <td className="num">{r.total_leads}</td>
                      <td className="num">{r.converted_leads}</td>
                      <td className="num">{r.conversion_rate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section-title">Sales performance</h2>
            <div className="rep-grid">
              {byRep.map((r) => {
                const isTop = topRep && r.assigned_to === topRep.assigned_to && r.leads_assigned > 0
                return (
                  <div
                    key={r.assigned_to}
                    className={`rep-card card${isTop ? ' rep-card--top' : ''}`}
                  >
                    {isTop ? <div className="rep-card-ribbon">Top conversion</div> : null}
                    <h3 className="rep-card-name">{r.assigned_to}</h3>
                    <dl className="rep-card-stats">
                      <div>
                        <dt>Assigned</dt>
                        <dd>{r.leads_assigned}</dd>
                      </div>
                      <div>
                        <dt>Converted</dt>
                        <dd>{r.leads_converted}</dd>
                      </div>
                      <div>
                        <dt>Conversion</dt>
                        <dd>{r.conversion_rate.toFixed(1)}%</dd>
                      </div>
                      <div>
                        <dt>Avg response</dt>
                        <dd>
                          {r.avg_response_time_ms != null
                            ? formatDurationMs(r.avg_response_time_ms)
                            : '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="analytics-section card">
            <h2 className="analytics-section-title">Leads per day</h2>
            <LeadsPerDayLineChart data={perDay} />
          </section>
        </>
      )}
    </div>
  )
}
