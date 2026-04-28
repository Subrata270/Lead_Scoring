import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

/** Fetch a single scoring_configs row for industry + business type (or null). */
export async function fetchScoringConfigRow(industryId, businessTypeId) {
  if (!industryId || !businessTypeId) {
    return { row: null, error: null }
  }
  const { data, error } = await supabase
    .from('scoring_configs')
    .select('id,high_budget,medium_budget,industry_id,business_type_id')
    .eq('industry_id', industryId)
    .eq('business_type_id', businessTypeId)
    .maybeSingle()
  if (error) return { row: null, error }
  return { row: data, error: null }
}

export function useScoringConfig(industryId, businessTypeId) {
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
      if (!industryId || !businessTypeId) {
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
      const { row: r, error: err } = await fetchScoringConfigRow(industryId, businessTypeId)
      if (cancelled) return
      applyResult(r, err)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [industryId, businessTypeId, applyResult])

  const reload = useCallback(async () => {
    if (!industryId || !businessTypeId) {
      setRow(null)
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const { row: r, error: err } = await fetchScoringConfigRow(industryId, businessTypeId)
    applyResult(r, err)
  }, [industryId, businessTypeId, applyResult])

  const usingDefault = Boolean(
    industryId && businessTypeId && !loading && !error && !row,
  )

  return {
    config: row,
    loading,
    error,
    usingDefault,
    reload,
  }
}
