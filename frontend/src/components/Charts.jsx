import { Fragment } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

function pctTick(v) {
  return `${Math.round(v)}%`
}

/** Bar chart: conversion % by source */
export function SourceConversionBarChart({ data }) {
  if (!data?.length) return <p className="muted chart-empty">No source data yet.</p>

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="source" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
          <YAxis tickFormatter={pctTick} width={44} tick={{ fontSize: 11 }} domain={[0, 100]} />
          <Tooltip
            formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Conversion']}
            labelFormatter={(label) => `Source: ${label}`}
          />
          <Bar dataKey="conversion_rate" name="conversion_rate" fill="#7c3aed" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Bonus: leads created per calendar day */
export function LeadsPerDayLineChart({ data }) {
  if (!data?.length) return <p className="muted chart-empty">Not enough history for a trend.</p>

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={64} />
          <YAxis allowDecimals={false} width={36} tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="leads_count" name="Leads" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const FUNNEL_COLORS = ['#64748b', '#3b82f6', '#f59e0b', '#22c55e', '#94a3b8']

/** Horizontal bars: funnel stage vs % of total pipeline */
export function FunnelStageBarChart({ funnel }) {
  if (!funnel?.total) return <p className="muted chart-empty">No funnel data for this range.</p>

  const data = [
    { stage: 'Contacted', pct: funnel.pct_contacted },
    { stage: 'Follow-up active', pct: funnel.pct_followup_active },
    { stage: 'Converted', pct: funnel.pct_converted },
    { stage: 'Lost', pct: funnel.pct_lost },
  ]

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="stage" width={120} tick={{ fontSize: 11 }} />
          <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, 'Share of leads']} />
          <Bar dataKey="pct" name="pct" radius={[0, 4, 4, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={FUNNEL_COLORS[(i + 1) % FUNNEL_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Volume (bars) + conversion % (line) by source */
export function SourceVolumeConversionChart({ data }) {
  const rows = (data || []).filter((r) => r.total_leads > 0)
  if (!rows.length) return <p className="muted chart-empty">No source breakdown yet.</p>

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="source" tick={{ fontSize: 11 }} interval={0} angle={-16} textAnchor="end" height={72} />
          <YAxis
            yAxisId="left"
            allowDecimals={false}
            width={40}
            tick={{ fontSize: 11 }}
            label={{ value: 'Leads', angle: -90, position: 'insideLeft', offset: 4, style: { fontSize: 10 } }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tickFormatter={pctTick}
            width={44}
            tick={{ fontSize: 11 }}
            domain={[0, 100]}
            label={{ value: 'Conv. %', angle: 90, position: 'insideRight', offset: 4, style: { fontSize: 10 } }}
          />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="total_leads" name="Total leads" fill="#94a3b8" radius={[4, 4, 0, 0]} />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="conversion_rate"
            name="Conversion %"
            stroke="#7c3aed"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function IndustryPerformanceBarChart({ data }) {
  const rows = (data || []).filter((r) => r.lead_count > 0).slice(0, 12)
  if (!rows.length) return <p className="muted chart-empty">No industry data.</p>

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={Math.max(220, rows.length * 28)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="industry" width={140} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey="lead_count" name="Leads" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function BusinessTypeBarChart({ data }) {
  const rows = (data || []).filter((r) => r.lead_count > 0).slice(0, 14)
  if (!rows.length) return <p className="muted chart-empty">No business type data.</p>

  return (
    <div className="chart-block">
      <ResponsiveContainer width="100%" height={Math.max(200, rows.length * 26)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis type="category" dataKey="business_type" width={150} tick={{ fontSize: 10 }} />
          <Tooltip />
          <Bar dataKey="lead_count" name="Leads" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Lead creations by weekday × time-of-day bucket (intensity = count) */
export function LeadActivityHeatmap({ heatmap }) {
  if (!heatmap?.matrix) return <p className="muted chart-empty">Not enough timestamps for activity heat.</p>

  const { matrix, max, dayLabels, buckets } = heatmap
  const safeMax = max > 0 ? max : 1

  return (
    <div className="heatmap-wrap" aria-label="Lead activity by weekday and time band">
      <div className="heatmap-grid" style={{ gridTemplateColumns: `7rem repeat(${buckets.length}, minmax(0, 1fr))` }}>
        <div className="heatmap-corner" />
        {buckets.map((b) => (
          <div key={b.id} className="heatmap-col-head">
            {b.label.split('\n').map((line, i) => (
              <span key={i}>
                {i > 0 ? <br /> : null}
                {line}
              </span>
            ))}
          </div>
        ))}
        {dayLabels.map((day, di) => (
          <Fragment key={day}>
            <div className="heatmap-row-label">{day}</div>
            {buckets.map((b, bi) => {
              const v = matrix[di][bi]
              const intensity = v / safeMax
              return (
                <div
                  key={`${di}-${bi}`}
                  className="heatmap-cell"
                  style={{
                    background: `color-mix(in srgb, var(--accent) ${Math.round(intensity * 85 + 8)}%, transparent)`,
                  }}
                  title={`${day} · ${v} leads`}
                >
                  {v > 0 ? <span className="heatmap-cell-val">{v}</span> : null}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

