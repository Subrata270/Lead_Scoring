import { SCORING_DEFAULT_BUDGETS } from './leadScoring'

/**
 * Explain how a lead score was calculated (transparent rule breakdown).
 * @returns {{ items: Array<{ label: string, points: number, applied: boolean }>, total: number, category: string }}
 */
export function buildScoreBreakdown({
  source,
  responded,
  budget,
  urgency,
  highBudget = SCORING_DEFAULT_BUDGETS.highBudget,
  mediumBudget = SCORING_DEFAULT_BUDGETS.mediumBudget,
}) {
  const high = Number(highBudget)
  const medium = Number(mediumBudget)
  const highThresh = Number.isFinite(high) ? high : SCORING_DEFAULT_BUDGETS.highBudget
  const mediumThresh = Number.isFinite(medium) ? medium : SCORING_DEFAULT_BUDGETS.mediumBudget

  const items = []

  const isReferral = source === 'referral'
  items.push({ label: 'Referral source', points: 30, applied: isReferral })

  const b = Number(budget)
  let budgetPoints = 0
  let budgetLabel = 'Budget tier'
  if (Number.isFinite(b)) {
    if (b >= highThresh) {
      budgetPoints = 25
      budgetLabel = `High budget (≥ ${highThresh.toLocaleString()})`
    } else if (b >= mediumThresh) {
      budgetPoints = 15
      budgetLabel = `Medium budget (≥ ${mediumThresh.toLocaleString()})`
    } else {
      budgetPoints = 5
      budgetLabel = 'Low budget'
    }
  }
  items.push({ label: budgetLabel, points: budgetPoints, applied: budgetPoints > 0 })

  const isHighUrgency = urgency === 'high'
  items.push({ label: 'High urgency', points: 15, applied: isHighUrgency })

  const hasResponded = responded === true
  items.push({ label: 'Lead responded', points: 20, applied: hasResponded })

  if (responded === false) {
    items.push({ label: 'No response yet', points: -10, applied: true })
  }

  let total = 0
  for (const item of items) {
    if (item.applied) total += item.points
  }
  total = Math.max(0, Math.min(100, total))

  let category = 'cold'
  if (total >= 80) category = 'hot'
  else if (total >= 50) category = 'warm'

  return { items, total, category }
}
