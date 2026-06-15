import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConversionFunnelCards, ConversionRateHero, IndustryHighlightCards } from '../components/AnalyticsCards.jsx'
import EmptyState, { EmptyInboxIcon } from '../components/EmptyState.jsx'
import {
  BusinessTypeBarChart,
  FunnelStageBarChart,
  IndustryPerformanceBarChart,
  LeadActivityHeatmap,
  LeadAgingBarChart,
  LeadsPerDayLineChart,
  SourceConversionBarChart,
  SourceVolumeConversionChart,
} from '../components/Charts.jsx'
import { useAnalyticsData } from '../hooks/useAnalyticsData.js'
import { useAuth } from '../hooks/useAuth.js'
import { formatDurationMs } from '../utils/responseTimeFormat'
import { isSalesperson } from '../utils/access.js'
import {
  DATE_PRESETS,
  aggregateByAssignee,
  aggregateByBusinessType,
  aggregateByIndustry,
  aggregateBySource,
  bestWorstSource,
  buildActivityHeatmap,
  buildAnalyticsCsv,
  computeConversionRate,
  computeFunnelMetrics,
  computeSourceTrends,
  downloadCsv,
  generateDashboardInsights,
  getDateRangeFromPreset,
  indexTasksByLeadId,
  leadsCreatedPerDay,
  topPerformerByConversion,
  topPerformerByResponseSpeed,
  trendIndicator,
} from '../utils/analyticsHelpers.js'
import { aggregateLeadAging } from '../utils/leadAging.js'
import { usePipelineHealthData } from '../hooks/usePipelineHealthData.js'
import ManagerRiskInsights from '../components/ManagerRiskInsights.jsx'

function rangeLabel(preset, customFrom, customTo) {
  if (preset === DATE_PRESETS.TODAY) return 'Today'
  if (preset === DATE_PRESETS.LAST_7) return 'Last 7 days'
  if (preset === DATE_PRESETS.LAST_30) return 'Last 30 days'
  if (preset === DATE_PRESETS.CUSTOM && customFrom && customTo) {
    return `${customFrom} → ${customTo}`
  }
  return 'Selected range'
}

export default function Analytics() {
  const { organization, profile } = useAuth()
  const [preset, setPreset] = useState(DATE_PRESETS.LAST_30)
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [sourceSort, setSourceSort] = useState({ key: 'total_leads', dir: 'desc' })

  const range = useMemo(
    () => ({ preset, customFrom, customTo }),
    [preset, customFrom, customTo],
  )

  const analyticsScope = useMemo(
    () => ({
      organizationId: organization?.id ?? null,
      assignedToFilter:
        isSalesperson(profile?.role) && profile?.full_name?.trim()
          ? profile.full_name.trim()
          : null,
    }),
    [organization, profile],
  )

  const { leads, previousLeads, tasks, loading, error, reload } = useAnalyticsData(range, analyticsScope)
  const {
    leads: pipelineLeads,
    managerInsights,
    loading: pipelineLoading,
  } = usePipelineHealthData(organization?.id ?? null, analyticsScope.assignedToFilter)

  const tasksByLead = useMemo(() => indexTasksByLeadId(tasks), [tasks])
  const funnel = useMemo(() => computeFunnelMetrics(leads, tasksByLead), [leads, tasksByLead])
  const conversionKpi = useMemo(() => computeConversionRate(leads), [leads])
  const bySource = useMemo(() => aggregateBySource(leads), [leads])
  const prevBySource = useMemo(() => aggregateBySource(previousLeads), [previousLeads])
  const sourceTrends = useMemo(
    () => computeSourceTrends(bySource, prevBySource),
    [bySource, prevBySource],
  )
  const { best, worst } = useMemo(() => bestWorstSource(bySource), [bySource])
  const byRep = useMemo(() => aggregateByAssignee(leads, tasksByLead), [leads, tasksByLead])
  const topRepConv = useMemo(() => topPerformerByConversion(byRep), [byRep])
  const topRepSpeed = useMemo(() => topPerformerByResponseSpeed(byRep), [byRep])
  const byIndustry = useMemo(() => aggregateByIndustry(leads), [leads])
  const byBusinessType = useMemo(() => aggregateByBusinessType(leads), [leads])
  const perDay = useMemo(() => leadsCreatedPerDay(leads), [leads])
  const heatmap = useMemo(() => buildActivityHeatmap(leads), [leads])
  const agingBuckets = useMemo(
    () => aggregateLeadAging(pipelineLeads, { excludeClosed: false }),
    [pipelineLeads],
  )

  const insights = useMemo(
    () => generateDashboardInsights({ leads, bySource, byRep, byIndustry }),
    [leads, bySource, byRep, byIndustry],
  )

  const sortedSources = useMemo(() => {
    const arr = [...bySource]
    const { key, dir } = sourceSort
    const mul = dir === 'desc' ? -1 : 1
    arr.sort((a, b) => {
      const va = a[key]
      const vb = b[key]
      if (key === 'source') {
        return va.localeCompare(vb) * (dir === 'asc' ? 1 : -1)
      }
      const na = va == null ? null : Number(va)
      const nb = vb == null ? null : Number(vb)
      if (na == null && nb == null) return 0
      if (na == null) return 1
      if (nb == null) return -1
      if (!Number.isFinite(na) || !Number.isFinite(nb)) return 0
      return (na - nb) * mul
    })
    return arr
  }, [bySource, sourceSort])

  const toggleSourceSort = useCallback((key) => {
    setSourceSort((prev) => {
      if (prev.key === key) return { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' }
      return { key, dir: 'desc' }
    })
  }, [])

  const exportReport = useCallback(() => {
    const label = rangeLabel(preset, customFrom, customTo)
    const csv = buildAnalyticsCsv({
      rangeLabel: label,
      funnel,
      bySource,
      byRep,
      byIndustry,
      byBusinessType,
    })
    const safe = label.replace(/[^\w\d]+/g, '-').slice(0, 40)
    downloadCsv(`analytics-${safe}.csv`, csv)
  }, [preset, customFrom, customTo, funnel, bySource, byRep, byIndustry, byBusinessType])

  const rangeMeta = useMemo(
    () => getDateRangeFromPreset(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  )

  return (
    <div className="page page-wide page-analytics">
      <header className="page-header page-header-row">
        <div>
          <h1>Analytics</h1>
          <p className="page-subtitle">
            Conversion intelligence, source quality, rep performance, and industry mix — filtered in Supabase by
            created date.
          </p>
        </div>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={reload}>
            Refresh
          </button>
          <button type="button" className="btn btn-secondary" onClick={exportReport} disabled={loading || !leads.length}>
            Export CSV
          </button>
          <Link className="btn btn-primary" to="/dashboard">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="card analytics-date-toolbar">
        <div className="analytics-date-presets">
          {[
            { id: DATE_PRESETS.TODAY, label: 'Today' },
            { id: DATE_PRESETS.LAST_7, label: 'Last 7 days' },
            { id: DATE_PRESETS.LAST_30, label: 'Last 30 days' },
            { id: DATE_PRESETS.CUSTOM, label: 'Custom' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              className={`analytics-preset-btn ${preset === p.id ? 'is-active' : ''}`}
              onClick={() => setPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
        {preset === DATE_PRESETS.CUSTOM ? (
          <div className="analytics-custom-range">
            <label className="inline-field">
              <span>From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="inline-field">
              <span>To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        ) : null}
        <p className="muted analytics-range-hint">
          Showing leads created between{' '}
          <strong>{new Date(rangeMeta.startIso).toLocaleString()}</strong> and{' '}
          <strong>{new Date(rangeMeta.endIso).toLocaleString()}</strong>
        </p>
      </div>

      {error ? <div className="banner banner-error">{error}</div> : null}

      {analyticsScope.assignedToFilter ? (
        <div className="banner" role="status">
          Showing analytics for leads assigned to <strong>{analyticsScope.assignedToFilter}</strong> only.
        </div>
      ) : null}

      {loading ? (
        <div className="card dashboard-loading-state" aria-busy="true">
          <div className="loading-spinner" aria-hidden />
          <p className="muted">Loading analytics…</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="card empty-state">
          <EmptyState
            icon={<EmptyInboxIcon />}
            title="No leads in this date range"
            description="Widen the date filter or capture more inbound leads to see analytics."
          />
        </div>
      ) : (
        <>
          <ConversionRateHero conversion={conversionKpi} />

          {insights.length ? (
            <section className="analytics-insights card">
              <h2 className="analytics-section-title">Insights</h2>
              <ul className="analytics-insight-list">
                {insights.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <ManagerRiskInsights insights={managerInsights} loading={pipelineLoading} />

          <section className="analytics-section card">
            <h2 className="analytics-section-title">Conversion by assignee</h2>
            <div className="table-wrap analytics-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Assignee</th>
                    <th className="num">Leads</th>
                    <th className="num">Converted</th>
                    <th className="num">Rate %</th>
                  </tr>
                </thead>
                <tbody>
                  {byRep.map((r) => (
                    <tr key={r.assigned_to}>
                      <td>{r.assigned_to}</td>
                      <td className="num">{r.leads_assigned}</td>
                      <td className="num">{r.leads_converted}</td>
                      <td className="num">{r.conversion_rate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="analytics-section card">
            <h2 className="analytics-section-title">Conversion by industry</h2>
            <div className="table-wrap analytics-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Industry</th>
                    <th className="num">Leads</th>
                    <th className="num">Converted</th>
                    <th className="num">Rate %</th>
                  </tr>
                </thead>
                <tbody>
                  {byIndustry.map((r) => (
                    <tr key={r.industry}>
                      <td>{r.industry}</td>
                      <td className="num">{r.lead_count}</td>
                      <td className="num">{r.converted}</td>
                      <td className="num">{r.conversion_rate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section-title">Conversion funnel</h2>
            <p className="muted section-hint">
              Percentages are share of <strong>all leads</strong> in range (stages can overlap — e.g. contacted lead
              with a pending task).
            </p>
            <ConversionFunnelCards funnel={funnel} />
            <div className="card analytics-subchart">
              <h3 className="analytics-subtitle">Funnel distribution</h3>
              <FunnelStageBarChart funnel={funnel} />
            </div>
          </section>

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
            bySource.filter((s) => s.total_leads > 0).length > 1 &&
            (worst.source !== best.source ||
              Math.abs(worst.conversion_rate - best.conversion_rate) > 1e-6) ? (
              <div className="insight-card insight-card--muted">
                <div className="insight-label">Lowest conversion source (with volume)</div>
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
            <SourceVolumeConversionChart data={bySource} />
            <SourceConversionBarChart data={bySource} />
            <div className="table-wrap analytics-table-wrap">
              <table className="data-table data-table-sortable">
                <thead>
                  <tr>
                    <th>
                      <button type="button" className="th-sort" onClick={() => toggleSourceSort('source')}>
                        Source {sourceSort.key === 'source' ? (sourceSort.dir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="th-sort" onClick={() => toggleSourceSort('total_leads')}>
                        Leads {sourceSort.key === 'total_leads' ? (sourceSort.dir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="th-sort" onClick={() => toggleSourceSort('converted_leads')}>
                        Conv. {sourceSort.key === 'converted_leads' ? (sourceSort.dir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="th-sort" onClick={() => toggleSourceSort('conversion_rate')}>
                        Rate % {sourceSort.key === 'conversion_rate' ? (sourceSort.dir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                    </th>
                    <th className="num">
                      <button
                        type="button"
                        className="th-sort"
                        onClick={() => toggleSourceSort('avg_response_time_ms')}
                      >
                        Avg response{' '}
                        {sourceSort.key === 'avg_response_time_ms' ? (sourceSort.dir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="th-sort" onClick={() => toggleSourceSort('hot_lead_pct')}>
                        Hot % {sourceSort.key === 'hot_lead_pct' ? (sourceSort.dir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                    </th>
                    <th className="num">
                      <button type="button" className="th-sort" onClick={() => toggleSourceSort('avg_score')}>
                        Avg score {sourceSort.key === 'avg_score' ? (sourceSort.dir === 'desc' ? '↓' : '↑') : ''}
                      </button>
                    </th>
                    <th className="num">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSources.map((r) => {
                    const trend = sourceTrends.get(r.source)
                    const convTrend = trendIndicator(trend?.conversion_trend ?? 'neutral')
                    const leadsTrend = trendIndicator(trend?.leads_trend ?? 'neutral')
                    return (
                    <tr key={r.source}>
                      <td>{r.source}</td>
                      <td className="num">
                        {r.total_leads}
                        <span className={`trend-badge ${leadsTrend.className}`} title="Lead volume vs prior period">
                          {leadsTrend.symbol}
                        </span>
                      </td>
                      <td className="num">{r.converted_leads}</td>
                      <td className="num">
                        {r.conversion_rate.toFixed(1)}%
                        <span className={`trend-badge ${convTrend.className}`} title="Conversion vs prior period">
                          {convTrend.symbol}
                        </span>
                      </td>
                      <td className="num">
                        {r.avg_response_time_ms != null ? formatDurationMs(r.avg_response_time_ms) : '—'}
                      </td>
                      <td className="num">{r.hot_lead_pct.toFixed(1)}%</td>
                      <td className="num">{r.avg_score != null ? r.avg_score.toFixed(0) : '—'}</td>
                      <td className="num muted subtle" title="Conversion trend vs prior period">
                        {convTrend.symbol}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="analytics-section">
            <h2 className="analytics-section-title">Salesperson leaderboard</h2>
            <div className="rep-grid analytics-rep-grid">
              {byRep.map((r) => {
                const topConv =
                  topRepConv &&
                  r.assigned_to === topRepConv.assigned_to &&
                  r.leads_assigned >= 2 &&
                  r.assigned_to !== 'Unassigned'
                const topSpeed =
                  topRepSpeed &&
                  r.assigned_to === topRepSpeed.assigned_to &&
                  r.leads_assigned >= 2 &&
                  r.assigned_to !== 'Unassigned'
                const both = topConv && topSpeed
                return (
                  <div
                    key={r.assigned_to}
                    className={`rep-card card${topConv ? ' rep-card--top' : ''}${topSpeed && !topConv ? ' rep-card--speed' : ''}`}
                  >
                    {both ? (
                      <div className="rep-card-ribbon rep-card-ribbon--dual">Top conversion · Fastest response</div>
                    ) : null}
                    {topConv && !both ? <div className="rep-card-ribbon">Top conversion</div> : null}
                    {topSpeed && !both ? (
                      <div className="rep-card-ribbon rep-card-ribbon--speed">Fastest response</div>
                    ) : null}
                    <h3 className="rep-card-name">{r.assigned_to}</h3>
                    <dl className="rep-card-stats rep-card-stats--wide">
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
                      <div>
                        <dt>Pending tasks</dt>
                        <dd>{r.pending_tasks}</dd>
                      </div>
                      <div>
                        <dt>Overdue</dt>
                        <dd>{r.overdue_tasks}</dd>
                      </div>
                    </dl>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="analytics-section card">
            <h2 className="analytics-section-title">Industry performance</h2>
            <IndustryHighlightCards byIndustry={byIndustry} />
            <IndustryPerformanceBarChart data={byIndustry} />
          </section>

          <section className="analytics-section card">
            <h2 className="analytics-section-title">Business type</h2>
            <BusinessTypeBarChart data={byBusinessType} />
            <div className="table-wrap analytics-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Business type</th>
                    <th className="num">Leads</th>
                    <th className="num">Conversions</th>
                    <th className="num">Conv. %</th>
                    <th className="num">Avg budget</th>
                  </tr>
                </thead>
                <tbody>
                  {byBusinessType.map((r) => (
                    <tr key={r.business_type}>
                      <td>{r.business_type}</td>
                      <td className="num">{r.lead_count}</td>
                      <td className="num">{r.conversions}</td>
                      <td className="num">{r.conversion_rate.toFixed(1)}%</td>
                      <td className="num">{Math.round(r.avg_budget || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="analytics-section card">
            <h2 className="analytics-section-title">Lead aging</h2>
            <p className="muted section-hint">
              Open pipeline leads (excluding converted/lost) grouped by days since creation.
            </p>
            <LeadAgingBarChart data={agingBuckets} />
            {pipelineLoading ? <p className="muted subtle">Refreshing aging data…</p> : null}
            <div className="table-wrap analytics-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th className="num">Count</th>
                    <th className="num">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {agingBuckets.map((b) => (
                    <tr key={b.bucket}>
                      <td>{b.label}</td>
                      <td className="num">{b.count}</td>
                      <td className="num">{b.percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="analytics-section card">
            <h2 className="analytics-section-title">Trend — leads per day</h2>
            <LeadsPerDayLineChart data={perDay} />
          </section>

          <section className="analytics-section card">
            <h2 className="analytics-section-title">Lead activity heatmap</h2>
            <p className="muted section-hint">Created-at timestamps in your local timezone · weekday × time band.</p>
            <LeadActivityHeatmap heatmap={heatmap} />
          </section>
        </>
      )}
    </div>
  )
}
