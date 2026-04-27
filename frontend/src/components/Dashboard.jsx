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
import { CRM_USER_STORAGE_KEY, CRM_USERS, LEAD_STATUSES } from '../constants/crm'
import { useRealtimeLeads } from '../hooks/useRealtimeLeads.js'
import { isHotCategory, isNewHotLeadEvent, sortLeadsByScoreDesc } from '../utils/leadHot'
import { playHotLeadChime } from '../utils/hotLeadSound.js'
import { computeGlobalResponseStats } from '../utils/analyticsAggregates.js'
import { formatDurationMs } from '../utils/responseTimeFormat.js'
import { exportLeadsCsv } from '../utils/csvExport.js'
import LeadRow from './LeadRow.jsx'
import TaskModal from './TaskModal.jsx'
import HotLeadToast from './HotLeadToast.jsx'

function readStoredUser() {
  try {
    const v = localStorage.getItem(CRM_USER_STORAGE_KEY)
    if (v && CRM_USERS.includes(v)) return v
  } catch {
    /* ignore */
  }
  return CRM_USERS[0]
}

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
  const [currentUser, setCurrentUser] = useState(readStoredUser)
  const [hotToasts, setHotToasts] = useState([])
  const [pulseLeadIds, setPulseLeadIds] = useState(() => new Set())

  const [filterSource, setFilterSource] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [, bumpHotNow] = useReducer((x) => x + 1, 0)
  useEffect(() => {
    const id = window.setInterval(bumpHotNow, 15000)
    return () => window.clearInterval(id)
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: leadRows, error: leadsError } = await supabase
      .from('leads')
      .select(
        'id,name,score,category,source,status,assigned_to,created_at,first_status_changed_at,responded',
      )
      .order('score', { ascending: false })

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
        .in('lead_id', ids)
        .order('due_date', { ascending: true })

      if (tasksError) {
        setLoading(false)
        setError(tasksError.message)
        return
      }
      taskRows = tdata ?? []
    }

    setLeads(list)
    setTasks(taskRows)
    setLoading(false)
  }, [])

  useEffect(() => {
    startTransition(() => {
      void loadData()
    })
  }, [loadData])

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

  useEffect(() => {
    try {
      localStorage.setItem(CRM_USER_STORAGE_KEY, currentUser)
    } catch {
      /* ignore */
    }
  }, [currentUser])

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
      if (!payload?.new?.id) return
      setLeads((prev) => mergeRealtimeLead(prev, payload.new))
      if (isNewHotLeadEvent(payload)) enqueueHotLeadAlert(payload.new)
    },
    [enqueueHotLeadAlert],
  )

  useRealtimeLeads({ onEvent: onRealtimeChange, enabled: !loading })

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

  const filteredLeads = useMemo(() => {
    let list = leads

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
    if (myLeadsOnly) list = list.filter((l) => (l.assigned_to || '') === currentUser)
    return list
  }, [
    leads,
    filterSource,
    filterStatus,
    filterAssignee,
    dateFrom,
    dateTo,
    hotOnly,
    myLeadsOnly,
    currentUser,
  ])

  const responseStats = useMemo(() => computeGlobalResponseStats(leads), [leads])

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
    setMyLeadsOnly(false)
    setHotOnly(false)
    setFilterSource('')
    setFilterStatus('')
    setFilterAssignee('')
    setDateFrom('')
    setDateTo('')
  }

  const hasAdvancedFilters =
    filterSource || filterStatus || filterAssignee || dateFrom || dateTo || hotOnly || myLeadsOnly

  function handleExportCsv() {
    exportLeadsCsv(filteredLeads, 'leads-filtered.csv')
  }

  return (
    <div className="page page-wide page-dashboard">
      <header className="page-header page-header-row dashboard-page-header">
        <div className="dashboard-header-main">
          <h1>Dashboard</h1>
          <p className="page-subtitle">Leads sorted by score. Realtime enabled.</p>
          <div className="response-metrics" aria-label="Global response time">
            <div className="response-metric card">
              <span className="response-metric-label">Avg response</span>
              <strong className="response-metric-value">
                {responseStats.count ? formatDurationMs(responseStats.avg) : '—'}
              </strong>
              <span className="response-metric-hint">
                {responseStats.count ? `${responseStats.count} with first action` : 'No samples yet'}
              </span>
            </div>
            <div className="response-metric card">
              <span className="response-metric-label">Fastest</span>
              <strong className="response-metric-value">
                {responseStats.fastest != null ? formatDurationMs(responseStats.fastest) : '—'}
              </strong>
            </div>
            <div className="response-metric card">
              <span className="response-metric-label">Slowest</span>
              <strong className="response-metric-value">
                {responseStats.slowest != null ? formatDurationMs(responseStats.slowest) : '—'}
              </strong>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <Link className="btn btn-secondary" to="/follow-ups">
            Follow-Ups
          </Link>
          <Link className="btn btn-secondary" to="/analytics">
            Analytics
          </Link>
          <button type="button" className="btn btn-secondary" onClick={loadData}>
            Refresh
          </button>
          <Link className="btn btn-primary" to="/add-lead">
            Add lead
          </Link>
        </div>
      </header>

      <div className="crm-toolbar card">
        <div className="crm-toolbar-row">
          <label className="inline-field">
            <span>I am (dev)</span>
            <select
              value={currentUser}
              onChange={(e) => setCurrentUser(e.target.value)}
              className="table-select"
            >
              {CRM_USERS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={myLeadsOnly}
              onChange={(e) => setMyLeadsOnly(e.target.checked)}
            />
            <span>My leads only</span>
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={hotOnly}
              onChange={(e) => setHotOnly(e.target.checked)}
            />
            <span>Only hot leads</span>
          </label>
          <button type="button" className="btn btn-secondary" onClick={handleExportCsv}>
            Export CSV
          </button>
        </div>
        <div className="filters-advanced">
          <label className="inline-field">
            <span>Source</span>
            <select
              className="table-select"
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
          <label className="inline-field">
            <span>Status</span>
            <select
              className="table-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            <span>Assigned</span>
            <select
              className="table-select"
              value={filterAssignee}
              onChange={(e) => setFilterAssignee(e.target.value)}
            >
              <option value="">Everyone</option>
              <option value="__unassigned__">Unassigned</option>
              {CRM_USERS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-field">
            <span>From</span>
            <input
              type="date"
              className="table-select filter-date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="inline-field">
            <span>To</span>
            <input
              type="date"
              className="table-select filter-date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
        </div>
        <div className="stats-row" aria-live="polite">
          <span>
            <strong>{stats.total}</strong> leads (filtered)
          </span>
          <span className="stats-hot">
            <strong>{stats.hot}</strong> hot
          </span>
          <span>
            <strong>{stats.pending}</strong> tasks pending
          </span>
          {hasAdvancedFilters ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="banner banner-error">{error}</div> : null}

      {loading ? (
        <p className="muted">Loading leads…</p>
      ) : leads.length === 0 ? (
        <div className="card empty-state">
          <p>No leads yet.</p>
          <Link className="btn btn-primary" to="/add-lead">
            Add your first lead
          </Link>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="card empty-state">
          <p>No leads match this filter.</p>
          <button type="button" className="btn btn-secondary" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="table-wrap card table-scroll">
          <table className="data-table data-table-crm data-table-sticky">
            <thead>
              <tr>
                <th>Name</th>
                <th>Score</th>
                <th>Category</th>
                <th>Source</th>
                <th>Status</th>
                <th>Assign to</th>
                <th>Follow-up</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredLeads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  tasks={tasksByLeadId[lead.id] ?? []}
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
