import { useEffect, useState } from 'react'
import { fetchScoreHistory } from '../services/scoreHistoryService'

function formatAt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function scoreDelta(oldScore, newScore) {
  const delta = newScore - oldScore
  if (delta > 0) return `+${delta}`
  if (delta < 0) return String(delta)
  return '0'
}

export default function ScoreHistory({ leadId, organizationId }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!leadId || !organizationId) {
      setEntries([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    void fetchScoreHistory(leadId, organizationId).then(({ data, error: err }) => {
      if (cancelled) return
      setLoading(false)
      if (err) {
        setError(err.message)
        return
      }
      setEntries(data)
    })

    return () => {
      cancelled = true
    }
  }, [leadId, organizationId])

  if (loading) {
    return <p className="muted subtle">Loading score history…</p>
  }

  if (error) {
    return <p className="muted subtle">Could not load score history: {error}</p>
  }

  if (entries.length === 0) {
    return (
      <div className="score-history">
        <h4 className="score-history-title">Score history</h4>
        <p className="muted">No score changes recorded yet.</p>
      </div>
    )
  }

  return (
    <div className="score-history">
      <h4 className="score-history-title">Score history</h4>
      <ul className="score-history-list">
        {entries.map((entry) => (
          <li key={entry.id} className="score-history-item">
            <div className="score-history-scores">
              <span className="score-history-old">{entry.old_score}</span>
              <span className="score-history-arrow" aria-hidden>
                →
              </span>
              <span className="score-history-new">{entry.new_score}</span>
              <span
                className={`score-history-delta ${
                  entry.new_score > entry.old_score
                    ? 'score-history-delta--up'
                    : entry.new_score < entry.old_score
                      ? 'score-history-delta--down'
                      : ''
                }`}
              >
                ({scoreDelta(entry.old_score, entry.new_score)})
              </span>
            </div>
            <div className="score-history-reason">{entry.reason}</div>
            <time className="score-history-time muted">{formatAt(entry.created_at)}</time>
          </li>
        ))}
      </ul>
    </div>
  )
}
