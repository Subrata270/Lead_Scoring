import { useEffect, useState } from 'react'
import { fetchLeadActivities } from '../services/activityEngine'
import { fetchScoreHistory } from '../services/scoreHistoryService'

export function useLeadCopilotData(leadId, organizationId, enabled = true) {
  const [activities, setActivities] = useState([])
  const [scoreHistory, setScoreHistory] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled || !leadId || !organizationId) {
      setActivities([])
      setScoreHistory([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void Promise.all([
      fetchLeadActivities(leadId, organizationId),
      fetchScoreHistory(leadId, organizationId),
    ]).then(([actRes, histRes]) => {
      if (cancelled) return
      setLoading(false)
      if (actRes.error || histRes.error) {
        setError(actRes.error?.message || histRes.error?.message || 'Failed to load copilot data')
      }
      setActivities(actRes.data ?? [])
      setScoreHistory(histRes.data ?? [])
    })

    return () => {
      cancelled = true
    }
  }, [leadId, organizationId, enabled])

  return { activities, scoreHistory, loading, error }
}
