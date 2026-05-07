import { useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Subscribes to INSERT/UPDATE on public.leads (optional organization filter).
 * Enable Realtime for `leads` in Supabase Dashboard (Database → Replication).
 */
export function useRealtimeLeads({ onEvent, enabled = true, organizationId = null }) {
  useEffect(() => {
    if (!enabled) return undefined

    const topic =
      organizationId != null ? `leads-realtime-org-${organizationId}` : 'leads-realtime-global'

    const base = {
      schema: 'public',
      table: 'leads',
      ...(organizationId ? { filter: `organization_id=eq.${organizationId}` } : {}),
    }

    const channel = supabase
      .channel(topic)
      .on('postgres_changes', { ...base, event: 'INSERT' }, (payload) => onEvent(payload))
      .on('postgres_changes', { ...base, event: 'UPDATE' }, (payload) => onEvent(payload))
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, onEvent, organizationId])
}
