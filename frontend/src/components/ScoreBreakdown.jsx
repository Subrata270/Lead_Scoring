import { useMemo } from 'react'
import { buildScoreBreakdown } from '../utils/scoreBreakdown'
import { SCORING_DEFAULT_BUDGETS } from '../utils/leadScoring'

export default function ScoreBreakdown({ lead, highBudget, mediumBudget }) {
  const breakdown = useMemo(
    () =>
      buildScoreBreakdown({
        source: lead.source,
        responded: lead.responded,
        budget: lead.budget,
        urgency: lead.urgency,
        highBudget: highBudget ?? SCORING_DEFAULT_BUDGETS.highBudget,
        mediumBudget: mediumBudget ?? SCORING_DEFAULT_BUDGETS.mediumBudget,
      }),
    [lead.source, lead.responded, lead.budget, lead.urgency, highBudget, mediumBudget],
  )

  const appliedItems = breakdown.items.filter((i) => i.applied && i.points !== 0)
  const skippedItems = breakdown.items.filter((i) => !i.applied && i.points > 0)

  return (
    <div className="score-breakdown">
      <h4 className="score-breakdown-title">Why this score?</h4>
      <ul className="score-breakdown-list">
        {appliedItems.map((item) => (
          <li key={item.label} className="score-breakdown-item score-breakdown-item--applied">
            <span className="score-breakdown-label">{item.label}</span>
            <span
              className={`score-breakdown-points ${
                item.points < 0 ? 'score-breakdown-points--neg' : ''
              }`}
            >
              {item.points > 0 ? '+' : ''}
              {item.points}
            </span>
          </li>
        ))}
        {skippedItems.map((item) => (
          <li key={item.label} className="score-breakdown-item score-breakdown-item--skipped">
            <span className="score-breakdown-label muted">{item.label}</span>
            <span className="score-breakdown-points muted">—</span>
          </li>
        ))}
      </ul>
      <div className="score-breakdown-total">
        <span>Total</span>
        <strong>
          {breakdown.total}
          <span className="score-breakdown-category"> ({breakdown.category})</span>
        </strong>
      </div>
    </div>
  )
}
