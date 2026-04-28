import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export function useIndustries() {
  const [industries, setIndustries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('industries')
      .select('id,name')
      .order('name', { ascending: true })
    setLoading(false)
    if (err) {
      setError(err.message)
      setIndustries([])
      return
    }
    setIndustries(data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { industries, loading, error, reload: load }
}
