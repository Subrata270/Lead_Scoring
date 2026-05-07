import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/** Fetch scoring_configs for industry + business type scoped to an organization. */
export async function fetchScoringConfigRow(industryId, businessTypeId, organizationId) {
  if (!industryId || !businessTypeId || !organizationId) {
    return { row: null, error: null }
  }
  const { data, error } = await supabase
    .from('scoring_configs')
    .select('id,high_budget,medium_budget,industry_id,business_type_id,organization_id')
    .eq('organization_id', organizationId)
    .eq('industry_id', industryId)
    .eq('business_type_id', businessTypeId)
    .maybeSingle()
  if (error) return { row: null, error }
  return { row: data, error: null }
}

export function useScoringConfig(industryId, businessTypeId, organizationId) {
  const [row, setRow] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const applyResult = useCallback((r, err) => {
    setLoading(false)
    if (err) {
      setError(err.message)
      setRow(null)
      return
    }
    setError(null)
    setRow(r)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function run() {
      if (!industryId || !businessTypeId || !organizationId) {
        if (!cancelled) {
          setRow(null)
          setLoading(false)
          setError(null)
        }
        return
      }
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
      const { row: r, error: err } = await fetchScoringConfigRow(industryId, businessTypeId, organizationId)
      if (cancelled) return
      applyResult(r, err)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [industryId, businessTypeId, organizationId, applyResult])

  const reload = useCallback(async () => {
    if (!industryId || !businessTypeId || !organizationId) {
      setRow(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const { row: r, error: err } = await fetchScoringConfigRow(industryId, businessTypeId, organizationId)
    applyResult(r, err)
  }, [industryId, businessTypeId, organizationId, applyResult])

  const usingDefault = Boolean(
    industryId && businessTypeId && organizationId && !loading && !error && !row,
  )

  return {
    config: row,
    loading,
    error,
    usingDefault,
    reload,
  }
}
