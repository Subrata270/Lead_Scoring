import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useBusinessTypes(industryId) {
  const [businessTypes, setBusinessTypes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchForIndustry = useCallback(async (id, signal) => {
    if (!id) {
      setBusinessTypes([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('business_types')
      .select('id,name,industry_id')
      .eq('industry_id', id)
      .order('name', { ascending: true })
    if (signal?.aborted) return
    setLoading(false)
    if (err) {
      setError(err.message)
      setBusinessTypes([])
      return
    }
    setBusinessTypes(data ?? [])
  }, [])

  useEffect(() => {
    const ac = new AbortController()
    void fetchForIndustry(industryId || null, ac.signal)
    return () => ac.abort()
  }, [industryId, fetchForIndustry])

  const reload = useCallback(() => {
    void fetchForIndustry(industryId || null)
  }, [industryId, fetchForIndustry])

  return { businessTypes, loading, error, reload }
}
