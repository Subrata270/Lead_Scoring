const DEFAULT_HIGH_BUDGET = 50000
const DEFAULT_MEDIUM_BUDGET = 20000

/**
 * Rule-based lead score (0–100) and category (hot | warm | cold).
 * Budget tiers use high_budget / medium_budget from scoring config when provided.
 */
export function calculateLeadScore({
  source,
  responded,
  budget,
  urgency,
  highBudget = DEFAULT_HIGH_BUDGET,
  mediumBudget = DEFAULT_MEDIUM_BUDGET,
}) {
  const high = Number(highBudget)
  const medium = Number(mediumBudget)
  const highThresh = Number.isFinite(high) ? high : DEFAULT_HIGH_BUDGET
  const mediumThresh = Number.isFinite(medium) ? medium : DEFAULT_MEDIUM_BUDGET

  let score = 0

  if (source === 'referral') score += 30
  if (responded === true) score += 20

  const b = Number(budget)
  if (Number.isFinite(b)) {
    if (b >= highThresh) score += 25
    else if (b >= mediumThresh) score += 15
    else score += 5
  }

  if (urgency === 'high') score += 15
  if (responded === false) score -= 10

  score = Math.max(0, Math.min(100, score))

  let category = 'cold'
  if (score >= 80) category = 'hot'
  else if (score >= 50) category = 'warm'

  return { score, category }
}

export const SCORING_DEFAULT_BUDGETS = {
  highBudget: DEFAULT_HIGH_BUDGET,
  mediumBudget: DEFAULT_MEDIUM_BUDGET,
}
