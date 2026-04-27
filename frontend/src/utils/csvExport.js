function escapeCsv(value) {
  if (value == null) return ''
  const s = String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export function exportLeadsCsv(leads, filename = 'leads-export.csv') {
  const headers = ['name', 'score', 'category', 'source', 'status', 'assigned_to']
  const lines = [
    headers.join(','),
    ...leads.map((l) => headers.map((h) => escapeCsv(l[h])).join(',')),
  ]
  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
