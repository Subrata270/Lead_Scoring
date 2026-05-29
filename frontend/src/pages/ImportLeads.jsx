import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { FIELD_ALIASES, CRM_FIELDS } from '../constants/assignmentRules.js'
import {
  parseCsvText,
  guessColumnMapping,
  mapCsvRow,
} from '../utils/csvParser.js'
import {
  bulkImportLeads,
  fetchCsvImportHistory,
  loadIndustryCatalog,
  validateMappedRow,
} from '../services/csvImportService.js'
import { fetchAssignmentRules } from '../services/assignmentEngine.js'

const PREVIEW_ROWS = 10

function formatAt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ImportLeads() {
  const { organization, user } = useAuth()
  const orgId = organization?.id

  const [step, setStep] = useState('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState([])
  const [rawRows, setRawRows] = useState([])
  const [mapping, setMapping] = useState({})
  const [catalog, setCatalog] = useState(null)
  const [rules, setRules] = useState([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)

  const loadHistory = useCallback(async () => {
    if (!orgId) return
    setHistoryLoading(true)
    const { data } = await fetchCsvImportHistory(orgId)
    setHistory(data)
    setHistoryLoading(false)
  }, [orgId])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  useEffect(() => {
    if (!orgId) return
    void loadIndustryCatalog().then(setCatalog)
    void fetchAssignmentRules(orgId).then(({ rules: r }) => setRules(r))
  }, [orgId])

  async function processFile(file) {
    setError(null)
    setImportResult(null)
    if (!file?.name?.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file.')
      return
    }
    const text = await file.text()
    const { headers: h, rows } = parseCsvText(text)
    if (!h.length || !rows.length) {
      setError('CSV appears empty or has no data rows.')
      return
    }
    setFileName(file.name)
    setHeaders(h)
    setRawRows(rows)
    setMapping(guessColumnMapping(h, FIELD_ALIASES))
    setStep('map')
  }

  function onFileInput(e) {
    const file = e.target.files?.[0]
    if (file) void processFile(file)
    e.target.value = ''
  }

  function onDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void processFile(file)
  }

  const mappedRows = useMemo(
    () => rawRows.map((r) => mapCsvRow(r, mapping)),
    [rawRows, mapping],
  )

  const validationSummary = useMemo(() => {
    if (!catalog) return { total: 0, valid: 0, invalid: 0, rowResults: [] }
    const rowResults = mappedRows.map((row, idx) => {
      const { valid, errors } = validateMappedRow(row, catalog)
      return { idx, row, valid, errors }
    })
    const valid = rowResults.filter((r) => r.valid).length
    return {
      total: rowResults.length,
      valid,
      invalid: rowResults.length - valid,
      rowResults,
    }
  }, [mappedRows, catalog])

  const previewRows = validationSummary.rowResults.slice(0, PREVIEW_ROWS)

  async function handleImport() {
    if (!orgId || !catalog) return
    setError(null)
    setImporting(true)

    const validRows = validationSummary.rowResults.filter((r) => r.valid).map((r) => r.row)

    if (validRows.length === 0) {
      setError('No valid rows to import. Fix validation errors first.')
      setImporting(false)
      return
    }

    try {
      const result = await bulkImportLeads({
        organizationId: orgId,
        userId: user?.id ?? null,
        fileName,
        rows: validRows,
        catalog,
        rules,
      })
      setImportResult(result)
      setStep('done')
      void loadHistory()
    } catch (err) {
      setError(err?.message ?? 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  function resetUpload() {
    setStep('upload')
    setFileName('')
    setHeaders([])
    setRawRows([])
    setMapping({})
    setImportResult(null)
    setError(null)
  }

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1>Import leads</h1>
        <p className="page-subtitle">
          Upload a CSV, map columns, preview validation, and bulk-import with scoring and auto-assignment.
        </p>
      </header>

      {error ? <div className="banner banner-error">{error}</div> : null}

      {step === 'upload' ? (
        <div
          className={`card csv-dropzone${dragOver ? ' csv-dropzone--active' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="csv-dropzone-inner">
            <p className="csv-dropzone-title">Drop CSV here</p>
            <p className="muted">or choose a file from your computer</p>
            <label className="btn btn-primary btn-sm csv-file-label">
              Choose file
              <input type="file" accept=".csv,text/csv" className="csv-file-input" onChange={onFileInput} />
            </label>
            <p className="muted subtle csv-hint">
              Expected columns: name, phone, email, budget, urgency, source, industry, business_type
            </p>
          </div>
        </div>
      ) : null}

      {step === 'map' || step === 'preview' ? (
        <>
          <div className="card csv-meta-bar">
            <span>
              File: <strong>{fileName}</strong>
            </span>
            <span className="muted">
              {validationSummary.total} rows · {validationSummary.valid} valid ·{' '}
              {validationSummary.invalid} invalid
            </span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetUpload}>
              Upload different file
            </button>
          </div>

          <section className="card csv-section">
            <h2 className="analytics-section-title">Column mapping</h2>
            <p className="muted section-hint">Map each CSV column to a CRM field.</p>
            <div className="csv-mapping-grid">
              {CRM_FIELDS.map((field) => (
                <label key={field.key} className="field csv-mapping-field">
                  <span>
                    {field.label}
                    {field.required ? ' *' : ''}
                  </span>
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(e) =>
                      setMapping((prev) => ({ ...prev, [field.key]: e.target.value || undefined }))
                    }
                  >
                    <option value="">— Not mapped —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="card csv-section">
            <h2 className="analytics-section-title">Preview (first {PREVIEW_ROWS} rows)</h2>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Status</th>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Industry</th>
                    <th>Business type</th>
                    <th>Budget</th>
                    <th>Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map(({ idx, row, valid, errors }) => (
                    <tr key={idx} className={valid ? '' : 'csv-row-invalid'}>
                      <td>{idx + 1}</td>
                      <td>{valid ? <span className="pill pill-warm">Valid</span> : <span className="pill pill-cold">Invalid</span>}</td>
                      <td>{row.name || '—'}</td>
                      <td>{row.phone || '—'}</td>
                      <td>{row.industry || '—'}</td>
                      <td>{row.business_type || '—'}</td>
                      <td>{row.budget || '—'}</td>
                      <td className="csv-errors-cell">{errors.join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="csv-import-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={importing || validationSummary.valid === 0 || !catalog}
              onClick={() => void handleImport()}
            >
              {importing
                ? 'Importing…'
                : `Import ${validationSummary.valid} valid lead${validationSummary.valid === 1 ? '' : 's'}`}
            </button>
            {validationSummary.invalid > 0 ? (
              <span className="muted subtle">
                {validationSummary.invalid} invalid row(s) will be skipped.
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {step === 'done' && importResult ? (
        <div className="card csv-result-banner">
          <h2 className="analytics-section-title">Import complete</h2>
          <p>
            <strong>{importResult.imported.length}</strong> leads imported,{' '}
            <strong>{importResult.failed.length}</strong> failed.
          </p>
          <div className="form-actions">
            <Link className="btn btn-primary" to="/dashboard">
              View dashboard
            </Link>
            <button type="button" className="btn btn-secondary" onClick={resetUpload}>
              Import another file
            </button>
          </div>
        </div>
      ) : null}

      <section className="card csv-section csv-history">
        <h2 className="analytics-section-title">Import history</h2>
        {historyLoading ? (
          <p className="muted">Loading history…</p>
        ) : history.length === 0 ? (
          <p className="muted">No imports yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th className="num">Imported</th>
                  <th className="num">Failed</th>
                  <th className="num">Total</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.file_name}</td>
                    <td className="num">{h.imported_rows}</td>
                    <td className="num">{h.failed_rows}</td>
                    <td className="num">{h.total_rows}</td>
                    <td>{formatAt(h.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
