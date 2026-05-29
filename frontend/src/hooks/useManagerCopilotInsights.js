import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import { supabase } from '../lib/supabaseClient'
import { aggregateManagerRiskInsights } from '../utils/leadCopilot.js'

function indexActivitiesByLead(activities) {
  const map = {}
  for (const a of activities ?? []) {
    if (!map[a.lead_id]) map[a.lead_id] = []
    map[a.lead_id].push(a)
  }
  return map
}

export function useManagerCopilotInsights(organizationId, assignedToFilter = null) {
  const [leads, setLeads] = useState([])
  const [activitiesByLeadId, setActivitiesByLeadId] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!organizationId) {
      setLeads([])
      setActivitiesByLeadId({})
      setLoading(false)
      return
    }

    setLoading(true)

    let q = supabase
      .from('leads')
      .select(
        'id, name, score, category, status, created_at, urgency, source, responded, assigned_to',
      )
      .eq('organization_id', organizationId)
      .in('status', ['new', 'contacted'])

    if (assignedToFilter) {
      q = q.eq('assigned_to', assignedToFilter)
    }

    const { data: leadRows } = await q
    const list = leadRows ?? []
    setLeads(list)

    if (list.length === 0) {
      setActivitiesByLeadId({})
      setLoading(false)
      return
    }

    const ids = list.map((l) => l.id)
    const { data: acts } = await supabase
      .from('activities')
      .select('lead_id, description, created_at, activity_type')
      .eq('organization_id', organizationId)
      .in('lead_id', ids)
      .order('created_at', { ascending: false })

    setActivitiesByLeadId(indexActivitiesByLead(acts))
    setLoading(false)
  }, [organizationId, assignedToFilter])

  useEffect(() => {
    startTransition(() => {
      void load()
    })
  }, [load])

  const insights = useMemo(
    () => aggregateManagerRiskInsights(leads, activitiesByLeadId),
    [leads, activitiesByLeadId],
  )

  return { insights, loading, reload: load }
}
