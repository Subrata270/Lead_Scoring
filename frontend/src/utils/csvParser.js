/**
 * Parse CSV text into { headers, rows }.
 * Handles quoted fields and commas inside quotes.
 */
export function parseCsvText(text) {
  const lines = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1
      if (cur.trim() !== '') lines.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  if (cur.trim() !== '') lines.push(cur)

  if (lines.length === 0) return { headers: [], rows: [] }

  const parsed = lines.map(parseCsvLine)
  const headers = parsed[0].map((h) => h.trim())
  const rows = parsed.slice(1).map((cells) => {
    const obj = {}
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? '').trim()
    })
    return obj
  })

  return { headers, rows }
}

function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    const next = line[i + 1]
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells
}

export function normalizeHeader(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Guess column mapping from CSV headers → CRM field keys */
export function guessColumnMapping(headers, fieldAliases) {
  const mapping = {}
  const normalizedHeaders = headers.map((h) => ({ raw: h, norm: normalizeHeader(h) }))

  for (const [fieldKey, aliases] of Object.entries(fieldAliases)) {
    const match = normalizedHeaders.find(({ norm }) =>
      aliases.some((a) => norm === a || norm.includes(a)),
    )
    if (match) mapping[fieldKey] = match.raw
  }

  return mapping
}

/** Apply mapping to a raw CSV row → CRM-shaped object */
export function mapCsvRow(rawRow, mapping) {
  const out = {}
  for (const [field, csvCol] of Object.entries(mapping)) {
    if (csvCol && rawRow[csvCol] != null) {
      out[field] = String(rawRow[csvCol]).trim()
    }
  }
  return out
}
