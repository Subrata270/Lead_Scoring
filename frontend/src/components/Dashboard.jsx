import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  startTransition,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { CRM_USERS, LEAD_STATUSES } from '../constants/crm'
import { useAuth } from '../hooks/useAuth.js'
import { useRealtimeLeads } from '../hooks/useRealtimeLeads.js'
import { syncOverdueTaskNotifications, syncAgingLeadNotifications } from '../services/notificationService.js'
import { isSalesperson, seesAllOrgLeads } from '../utils/access.js'
import { isHotCategory, isNewHotLeadEvent, sortLeadsByScoreDesc } from '../utils/leadHot'
import { playHotLeadChime } from '../utils/hotLeadSound.js'
import { computeGlobalResponseStats } from '../utils/analyticsAggregates.js'
import { computeConversionRate } from '../utils/analyticsHelpers.js'
import { formatDurationMs } from '../utils/responseTimeFormat.js'
import { exportLeadsCsv } from '../utils/csvExport.js'
import { importFromHubSpot } from '../services/hubspotImportService.js'
import { computeDashboardHealth, countHealthBuckets } from '../utils/leadHealth.js'
import { isTaskOverdue } from '../utils/taskHelpers.js'
import LeadRow from './LeadRow.jsx'
import TaskModal from './TaskModal.jsx'
import HotLeadToast from './HotLeadToast.jsx'
import EmptyState, { EmptyInboxIcon, EmptySearchIcon } from './EmptyState.jsx'
import {
  KpiConversionIcon,
  KpiHotIcon,
  KpiLeadsIcon,
  KpiResponseIcon,
  KpiTasksIcon,
} from './KpiIcons.jsx'

function mergeRealtimeLead(prevList, row) {
  const idx = prevList.findIndex((l) => l.id === row.id)
  const merged = { ...(idx === -1 ? {} : prevList[idx]), ...row }
  const next =
    idx === -1 ? [...prevList, merged] : prevList.map((l) => (l.id === row.id ? merged : l))
  return sortLeadsByScoreDesc(next)
}

function startOfDay(isoDate) {
  const d = new Date(isoDate)
  d.setHours(0, 0, 0, 0)
  return d
}

function endOfDay(isoDate) {
  const d = new Date(isoDate)
  d.setHours(23, 59, 59, 999)
  return d
}

export default function Dashboard() {
  const { organization, profile, session } = useAuth()
  const orgId = organization?.id
  const profileName = profile?.full_name?.trim() || ''
  const salesRestricted = isSalesperson(profile?.role)

  const [searchParams, setSearchParams] = useSearchParams()
  const focusLeadId = searchParams.get('focusLead')

  const [leads, setLeads] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [taskModalLead, setTaskModalLead] = useState(null)
  const [myLeadsOnly, setMyLeadsOnly] = useState(false)
  const [hotOnly, setHotOnly] = useState(false)
  const [teamAssignees, setTeamAssignees] = useState([])
  const [hotToasts, setHotToasts] = useState([])
  const [pulseLeadIds, setPulseLeadIds] = useState(() => new Set())

  const [filterSource, setFilterSource] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [filterHealth, setFilterHealth] = useState('')
  const [hubspotImporting, setHubspotImporting] = useState(false)
  const [hubspotMessage, setHubspotMessage] = useState(null)

  const [, bumpHotNow] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    const id = window.setInterval(bumpHotNow, 15000)
    return () => window.clearInterval(id)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (!orgId) {
      setLoading(false)
      setLeads([])
      setTasks([])
      return
    }

    let leadsQuery = supabase
      .from('leads')
      .select(
        'id,name,score,category,source,status,assigned_to,created_at,first_status_changed_at,responded,budget,urgency,phone,email,industry_id,business_type_id,organization_id,created_by,industries(name),business_types(name)',
      )
      .eq('organization_id', orgId)
      .order('score', { ascending: false })

    if (salesRestricted && profileName) {
      leadsQuery = leadsQuery.eq('assigned_to', profileName)
    }

    const { data: leadRows, error: leadsError } = await leadsQuery

    if (leadsError) {
      setLoading(false)
      setError(leadsError.message)
      return
    }

    const list = leadRows ?? []
    let taskRows = []

    if (list.length > 0) {
      const ids = list.map((l) => l.id)
      const { data: tdata, error: tasksError } = await supabase
        .from('tasks')
        .select('id,lead_id,task_type,due_date,status,created_at,completed_at')
        .eq('organization_id', orgId)
        .in('lead_id', ids)
        .order('due_date', { ascending: true })

      if (tasksError) {
        setLoading(false)
        setError(tasksError.message)
        return
      }
      taskRows = tdata ?? []
    }

    let teamNames = []
    if (orgId && seesAllOrgLeads(profile?.role)) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('organization_id', orgId)
        .order('full_name', { ascending: true })
      teamNames = [...new Set((profs ?? []).map((p) => p.full_name).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      )
    }
    setTeamAssignees(teamNames)

    setLeads(list)
    setTasks(taskRows)
    setLoading(false)
  }, [orgId, salesRestricted, profileName, profile?.role])

  useEffect(() => {
    startTransition(() => {
      void loadData()
    })
  }, [loadData])

  useEffect(() => {
    if (!orgId || loading) return
    void syncOverdueTaskNotifications(orgId)
    void syncAgingLeadNotifications(orgId)
  }, [orgId, loading])

  useEffect(() => {
    if (!focusLeadId || loading) return
    if (!leads.some((l) => l.id === focusLeadId)) return

    startTransition(() => {
      setMyLeadsOnly(false)
      setHotOnly(false)
      setFilterSource('')
      setFilterStatus('')
      setFilterAssignee('')
      setDateFrom('')
      setDateTo('')
      setSearchQuery('')
      setExpandedId(focusLeadId)
    })

    const t = window.setTimeout(() => {
      document.getElementById(`lead-row-${focusLeadId}`)?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('focusLead')
          return next
        },
        { replace: true },
      )
    }, 200)

    return () => window.clearTimeout(t)
  }, [focusLeadId, loading, leads, setSearchParams])

  const enqueueHotLeadAlert = useCallback((row) => {
    playHotLeadChime()
    const toastId = crypto.randomUUID()
    setHotToasts((prev) => [
      ...prev,
      { toastId, name: row.name, source: row.source, score: row.score },
    ])
    window.setTimeout(() => {
      setHotToasts((prev) => prev.filter((t) => t.toastId !== toastId))
    }, 7000)

    setPulseLeadIds((prev) => {
      const n = new Set(prev)
      n.add(row.id)
      return n
    })
    window.setTimeout(() => {
      setPulseLeadIds((prev) => {
        const n = new Set(prev)
        n.delete(row.id)
        return n
      })
    }, 8000)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(`lead-row-${row.id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      })
    })
  }, [])

  const onRealtimeChange = useCallback(
    (payload) => {
      const row = payload?.new
      if (!row?.id) return
      if (orgId && row.organization_id && row.organization_id !== orgId) return
      if (salesRestricted && profileName && row.assigned_to?.trim() !== profileName) {
        if (payload.eventType === 'UPDATE') {
          setLeads((prev) => prev.filter((l) => l.id !== row.id))
        }
        return
      }
      setLeads((prev) => mergeRealtimeLead(prev, row))
      if (isNewHotLeadEvent(payload)) enqueueHotLeadAlert(row)
    },
    [enqueueHotLeadAlert, orgId, salesRestricted, profileName],
  )

  useRealtimeLeads({ onEvent: onRealtimeChange, enabled: !loading, organizationId: orgId })

  const dismissToast = useCallback((toastId) => {
    setHotToasts((prev) => prev.filter((t) => t.toastId !== toastId))
  }, [])

  const tasksByLeadId = useMemo(() => {
    const map = {}
    for (const t of tasks) {
      if (!map[t.lead_id]) map[t.lead_id] = []
      map[t.lead_id].push(t)
    }
    return map
  }, [tasks])

  const uniqueSources = useMemo(() => {
    const s = new Set()
    for (const l of leads) {
      if (l.source) s.add(l.source)
    }
    return [...s].sort()
  }, [leads])

  const assigneeFilterOptions = useMemo(() => {
    const set = new Set(teamAssignees)
    for (const l of leads) {
      if (l.assigned_to?.trim()) set.add(l.assigned_to.trim())
    }
    const arr = [...set].sort((a, b) => a.localeCompare(b))
    return arr.length ? arr : CRM_USERS
  }, [teamAssignees, leads])

  const filteredLeads = useMemo(() => {
    let list = leads

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((l) => {
        const hay = [l.name, l.phone, l.email, l.source, l.assigned_to]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return hay.includes(q)
      })
    }

    if (filterSource) list = list.filter((l) => (l.source || '') === filterSource)
    if (filterStatus) list = list.filter((l) => (l.status || 'new') === filterStatus)
    if (filterAssignee === '__unassigned__') {
      list = list.filter((l) => !(l.assigned_to && String(l.assigned_to).trim()))
    } else if (filterAssignee) {
      list = list.filter((l) => (l.assigned_to || '') === filterAssignee)
    }
    if (dateFrom) {
      const start = startOfDay(dateFrom)
      list = list.filter((l) => l.created_at && new Date(l.created_at) >= start)
    }
    if (dateTo) {
      const end = endOfDay(dateTo)
      list = list.filter((l) => l.created_at && new Date(l.created_at) <= end)
    }
    if (hotOnly) list = list.filter((l) => isHotCategory(l.category))
    if (filterHealth === 'overdue') {
      list = list.filter((l) =>
        (tasksByLeadId[l.id] ?? []).some((t) => isTaskOverdue(t.due_date, t.status)),
      )
    } else if (filterHealth) {
      list = list.filter((l) => computeDashboardHealth(l, tasksByLeadId[l.id] ?? []) === filterHealth)
    }
    const mineOnly = salesRestricted || myLeadsOnly
    if (mineOnly && profileName) {
      list = list.filter((l) => (l.assigned_to || '').trim() === profileName)
    }
    return list
  }, [
    leads,
    searchQuery,
    filterSource,
    filterStatus,
    filterAssignee,
    dateFrom,
    dateTo,
    hotOnly,
    filterHealth,
    tasksByLeadId,
    myLeadsOnly,
    profileName,
    salesRestricted,
  ])

  const responseStats = useMemo(() => computeGlobalResponseStats(leads), [leads])
  const conversionStats = useMemo(() => computeConversionRate(leads), [leads])
  const healthCounts = useMemo(() => countHealthBuckets(leads, tasksByLeadId), [leads, tasksByLeadId])

  const stats = useMemo(() => {
    const total = filteredLeads.length
    const hot = filteredLeads.filter((l) => isHotCategory(l.category)).length
    const visibleIds = new Set(filteredLeads.map((l) => l.id))
    const pending = tasks.filter((t) => t.status === 'pending' && visibleIds.has(t.lead_id)).length
    return { total, hot, pending }
  }, [filteredLeads, tasks])

  function handleLeadPatch(id, patch) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  }

  function handleTaskPatch(taskId, patch) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...patch } : t)))
  }

  function handleTaskCreated(row) {
    setTasks((prev) => [...prev, row])
  }

  const clearFilters = () => {
    setSearchQuery('')
    setMyLeadsOnly(false)
    setHotOnly(false)
    setFilterHealth('')
    setFilterSource('')
    setFilterStatus('')
    setFilterAssignee('')
    setDateFrom('')
    setDateTo('')
  }

  const hasActiveFilters =
    searchQuery ||
    filterSource ||
    filterStatus ||
    filterAssignee ||
    dateFrom ||
    dateTo ||
    hotOnly ||
    filterHealth ||
    (!salesRestricted && myLeadsOnly)

  const hasAdvancedFilters =
    filterSource || dateFrom || dateTo || hotOnly || (!salesRestricted && myLeadsOnly)

  function handleExportCsv() {
    exportLeadsCsv(filteredLeads, 'leads-filtered.csv')
  }

  async function handleHubSpotImport() {
    setHubspotMessage(null)
    const token = session?.access_token
    if (!token) {
      setHubspotMessage({ type: 'error', text: 'Sign in again to import from HubSpot.' })
      return
    }

    setHubspotImporting(true)
    try {
      const result = await importFromHubSpot(token)
      if (!result.ok) {
        setHubspotMessage({ type: 'error', text: result.error || 'HubSpot import failed.' })
        return
      }

      setHubspotMessage({
        type: 'success',
        text: `Imported ${result.imported} lead${result.imported === 1 ? '' : 's'} (${result.skipped} skipped, ${result.total} total from HubSpot).`,
      })
      await loadData()
    } catch (err) {
      setHubspotMessage({ type: 'error', text: err?.message || 'HubSpot import failed.' })
    } finally {
      setHubspotImporting(false)
    }
  }

  return (
    <div className="page page-wide page-dashboard dashboard-root dashboard-layout dashboard-layout--crm">
      <header className="dashboard-crm-header">
        <div className="dashboard-crm-header-text">
          <h1 className="dashboard-crm-title">Dashboard</h1>
          <p className="dashboard-crm-subtitle">Monitor leads, assignments and conversions</p>
        </div>
        <div className="dashboard-crm-header-actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleHubSpotImport}
            disabled={hubspotImporting || loading}
          >
            {hubspotImporting ? 'Importing…' : 'Import from HubSpot'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
            Export
          </button>
          <Link className="btn btn-primary btn-sm dashboard-add-lead" to="/add-lead">
            + Add Lead
          </Link>
        </div>
      </header>

      <div className="dashboard-kpi-row" aria-label="Key metrics">
        <div className="kpi-card kpi-card--leads">
          <div className="kpi-card-icon" aria-hidden>
            <KpiLeadsIcon />
          </div>
          <div className="kpi-card-body">
            <span className="kpi-card-label">Total Leads</span>
            <strong className="kpi-card-value">{stats.total}</strong>
          </div>
        </div>
        <div className="kpi-card kpi-card--conv">
          <div className="kpi-card-icon" aria-hidden>
            <KpiConversionIcon />
          </div>
          <div className="kpi-card-body">
            <span className="kpi-card-label">Conversion Rate</span>
            <strong className="kpi-card-value">
              {conversionStats.total ? `${conversionStats.rate.toFixed(1)}%` : '—'}
            </strong>
            <span className="kpi-card-sub">
              {conversionStats.converted}/{conversionStats.total}
            </span>
          </div>
        </div>
        <div className="kpi-card kpi-card--hot">
          <div className="kpi-card-icon" aria-hidden>
            <KpiHotIcon />
          </div>
          <div className="kpi-card-body">
            <span className="kpi-card-label">Hot Leads</span>
            <strong className="kpi-card-value">{stats.hot}</strong>
          </div>
        </div>
        <div className="kpi-card kpi-card--tasks">
          <div className="kpi-card-icon" aria-hidden>
            <KpiTasksIcon />
          </div>
          <div className="kpi-card-body">
            <span className="kpi-card-label">Pending Tasks</span>
            <strong className="kpi-card-value">{stats.pending}</strong>
          </div>
        </div>
        <div className="kpi-card kpi-card--response">
          <div className="kpi-card-icon" aria-hidden>
            <KpiResponseIcon />
          </div>
          <div className="kpi-card-body">
            <span className="kpi-card-label">Avg Response</span>
            <strong className="kpi-card-value">
              {responseStats.count ? formatDurationMs(responseStats.avg) : '—'}
            </strong>
          </div>
        </div>
      </div>

      <div className="dashboard-health-filters" role="group" aria-label="Lead health filters">
        {[
          { id: 'critical', label: 'Critical', count: healthCounts.critical },
          { id: 'stale', label: 'Stale', count: healthCounts.stale },
          { id: 'overdue', label: 'Overdue tasks', count: healthCounts.overdue },
        ].map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`dashboard-health-chip dashboard-health-chip--${chip.id}${filterHealth === chip.id ? ' is-active' : ''}`}
            onClick={() => setFilterHealth((v) => (v === chip.id ? '' : chip.id))}
          >
            {chip.label}
            {chip.count > 0 ? <span className="dashboard-health-chip-count">{chip.count}</span> : null}
          </button>
        ))}
      </div>

      <div className="dashboard-filter-bar">
        <div className="dashboard-filter-primary">
          <label className="dashboard-search">
            <span className="sr-only">Search leads</span>
            <input
              type="search"
              className="dashboard-search-input"
              placeholder="Search name, phone, email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </label>
          <label className="dashboard-filter-field">
            <span className="dashboard-filter-label">Status</span>
            <select
              className="table-select table-select--compact"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="dashboard-filter-field">
            <span className="dashboard-filter-label">Assigned</span>
            <select
              className="table-select table-select--compact"
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
            >
              <option value="">Everyone</option>
              <option value="__unassigned__">Unassigned</option>
              {assigneeFilterOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`btn btn-secondary btn-sm dashboard-advanced-toggle${advancedOpen ? ' is-active' : ''}`}
            onClick={() => setAdvancedOpen((v) => !v)}
          >
            Advanced Filters
            {hasAdvancedFilters ? <span className="dashboard-filter-dot" aria-hidden /> : null}
          </button>
          {hasActiveFilters ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
              Clear
            </button>
          ) : null}
        </div>
        {advancedOpen ? (
          <div className="dashboard-filter-advanced">
            <label className="dashboard-filter-field">
              <span className="dashboard-filter-label">Source</span>
              <select
                className="table-select table-select--compact"
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
              >
                <option value="">All sources</option>
                {uniqueSources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="dashboard-filter-field">
              <span className="dashboard-filter-label">From</span>
              <input
                type="date"
                className="table-select filter-date table-select--compact"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="dashboard-filter-field">
              <span className="dashboard-filter-label">To</span>
              <input
                type="date"
                className="table-select filter-date table-select--compact"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <label className="dashboard-filter-check">
              <input
                type="checkbox"
                checked={hotOnly}
                onChange={(e) => setHotOnly(e.target.checked)}
              />
              <span>Hot leads only</span>
            </label>
            <label className="dashboard-filter-check">
              <input
                type="checkbox"
                checked={salesRestricted ? true : myLeadsOnly}
                onChange={(e) => setMyLeadsOnly(e.target.checked)}
                disabled={salesRestricted}
              />
              <span>My leads only</span>
            </label>
          </div>
        ) : null}
        {salesRestricted ? (
          <span className="dashboard-filter-hint muted">
            Salesperson view · {profileName || '—'}
          </span>
        ) : null}
      </div>

      {error ? <div className="banner banner-error">{error}</div> : null}
      {hubspotMessage ? (
        <div
          className={`banner ${hubspotMessage.type === 'error' ? 'banner-error' : 'banner-success'}`}
        >
          {hubspotMessage.text}
        </div>
      ) : null}

      {loading ? (
        <div className="card dashboard-loading-state" aria-busy="true">
          <div className="loading-spinner" aria-hidden />
          <p className="muted">Loading leads…</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="card dashboard-empty">
          <EmptyState
            icon={<EmptyInboxIcon />}
            title="No leads yet"
            description="Add your first lead or import from HubSpot to start scoring and assigning."
          >
            <Link className="btn btn-primary btn-sm" to="/add-lead">
              + Add Lead
            </Link>
          </EmptyState>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="card dashboard-empty">
          <EmptyState
            icon={<EmptySearchIcon />}
            title="No leads match this filter"
            description="Try adjusting your search or clearing filters to see more results."
          >
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap card table-scroll dashboard-table-wrap dashboard-table-wrap--crm">
          <table className="data-table data-table-crm data-table-sticky data-table-crm--compact">
            <thead>
              <tr>
                <th>Name</th>
                <th>Score</th>
                <th>Category</th>
                <th>Industry</th>
                <th>Type</th>
                <th>Source</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Next action</th>
                <th>Due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  tasks={tasksByLeadId[lead.id] ?? []}
                  healthFlag={computeDashboardHealth(lead, tasksByLeadId[lead.id] ?? [])}
                  assigneeOptions={
                    salesRestricted && profileName ? [profileName] : assigneeFilterOptions
                  }
                  expanded={expandedId === lead.id}
                  pulseHot={pulseLeadIds.has(lead.id)}
                  onToggleExpand={() =>
                    setExpandedId((id) => (id === lead.id ? null : lead.id))
                  }
                  onLeadPatch={handleLeadPatch}
                  onTaskPatch={handleTaskPatch}
                  onAddTask={setTaskModalLead}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <HotLeadToast items={hotToasts} onDismiss={dismissToast} />

      {taskModalLead ? (
        <TaskModal
          lead={taskModalLead}
          onClose={() => setTaskModalLead(null)}
          onCreated={handleTaskCreated}
        />
      ) : null}
    </div>
  )
}
