function escapeCsv(value) {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function pickIndustryName(l) {
  return l.industries?.name ?? ''
}

function pickBusinessTypeName(l) {
  return l.business_types?.name ?? ''
}

export function exportLeadsCsv(leads, filename = 'leads-export.csv') {
  const headers = [
    'name',
    'score',
    'category',
    'industry',
    'business_type',
    'source',
    'status',
    'assigned_to',
  ]
  const lines = [
    headers.join(','),
    ...leads.map((l) =>
      [
        escapeCsv(l.name),
        escapeCsv(l.score),
        escapeCsv(l.category),
        escapeCsv(pickIndustryName(l)),
        escapeCsv(pickBusinessTypeName(l)),
        escapeCsv(l.source),
        escapeCsv(l.status),
        escapeCsv(l.assigned_to),
      ].join(','),
    ),
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
