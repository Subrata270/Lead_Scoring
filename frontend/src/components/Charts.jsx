import {
  Bar,
  BarChart,
  CartesianGrid,
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
