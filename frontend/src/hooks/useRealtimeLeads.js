import { useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'

/**
 * Subscribes to INSERT/UPDATE on public.leads. Cleans up on unmount.
 * Enable Realtime for `leads` in Supabase Dashboard (Database → Replication).
 */
export function useRealtimeLeads({ onEvent, enabled = true }) {
  useEffect(() => {
    if (!enabled) return undefined

    const channel = supabase
      .channel('leads-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => onEvent(payload),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads' },
        (payload) => onEvent(payload),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [enabled, onEvent])
}
