import { useCallback, useEffect, useState, startTransition } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * All open pipeline leads for aging metrics (not date-filtered).
 */
export function useOpenPipelineLeads(organizationId, assignedToFilter = null) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!organizationId) {
      setLeads([])
      setLoading(false)
      return
    }

    setLoading(true)
    let q = supabase
      .from('leads')
      .select('id, status, created_at')
      .eq('organization_id', organizationId)
      .in('status', ['new', 'contacted'])

    if (assignedToFilter) {
      q = q.eq('assigned_to', assignedToFilter)
    }

    const { data } = await q
    setLeads(data ?? [])
    setLoading(false)
  }, [organizationId, assignedToFilter])

  useEffect(() => {
    startTransition(() => {
      void load()
    })
  }, [load])

  return { leads, loading, reload: load }
}
