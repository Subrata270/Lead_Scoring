import { useCallback, useEffect, useState, startTransition } from 'react'
import { supabase } from '../lib/supabaseClient'
import { getDateRangeFromPreset, getPreviousPeriodRange } from '../utils/analyticsHelpers.js'

const LEAD_SELECT = [
  'id',
  'name',
  'score',
  'category',
  'source',
  'status',
  'assigned_to',
  'created_at',
  'first_status_changed_at',
  'responded',
  'budget',
  'urgency',
  'industry_id',
  'business_type_id',
  'industries(name)',
  'business_types(name)',
].join(',')

/**
 * @param {{ preset: string, customFrom?: string, customTo?: string }} range
 * @param {{ organizationId?: string | null, assignedToFilter?: string | null }} scope
 */
export function useAnalyticsData(range, scope = {}) {
  const { organizationId = null, assignedToFilter = null } = scope
  const [leads, setLeads] = useState([])
  const [previousLeads, setPreviousLeads] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchLeadsForRange(startIso, endIso) {
    let leadsQuery = supabase
      .from('leads')
      .select(LEAD_SELECT)
      .eq('organization_id', organizationId)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: false })

    if (assignedToFilter) {
      leadsQuery = leadsQuery.eq('assigned_to', assignedToFilter)
    }

    const { data, error: leadsError } = await leadsQuery
    return { data: data ?? [], error: leadsError }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (!organizationId) {
      setLeads([])
      setPreviousLeads([])
      setTasks([])
      setLoading(false)
      return
    }

    const { startIso, endIso } = getDateRangeFromPreset(
      range.preset,
      range.customFrom,
      range.customTo,
    )
    const prevRange = getPreviousPeriodRange(range.preset, range.customFrom, range.customTo)

    const [currentResult, prevResult] = await Promise.all([
      fetchLeadsForRange(startIso, endIso),
      fetchLeadsForRange(prevRange.startIso, prevRange.endIso),
    ])

    if (currentResult.error) {
      setLoading(false)
      setError(currentResult.error.message)
      setLeads([])
      setPreviousLeads([])
      setTasks([])
      return
    }

    const list = currentResult.data
    setPreviousLeads(prevResult.error ? [] : prevResult.data)
    let taskRows = []

    if (list.length > 0) {
      const ids = list.map((l) => l.id)
      const { data: tdata, error: tasksError } = await supabase
        .from('tasks')
        .select('id,lead_id,due_date,status')
        .eq('organization_id', organizationId)
        .in('lead_id', ids)

      if (tasksError) {
        setLoading(false)
        setError(tasksError.message)
        setLeads([])
        setTasks([])
        return
      }
      taskRows = tdata ?? []
    }

    setLeads(list)
    setTasks(taskRows)
    setLoading(false)
  }, [range.preset, range.customFrom, range.customTo, organizationId, assignedToFilter])

  useEffect(() => {
    startTransition(() => {
      void load()
    })
  }, [load])

  return {
    leads,
    previousLeads,
    tasks,
    loading,
    error,
    reload: load,
    rangeKey: `${range.preset}-${range.customFrom}-${range.customTo}`,
  }
}
