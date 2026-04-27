/**
 * Rule-based lead score (0–100) and category (hot | warm | cold).
 */
export function calculateLeadScore({ source, responded, budget, urgency }) {
  let score = 0

  if (source === 'referral') score += 30
  if (responded === true) score += 20
  if (Number(budget) > 50000) score += 25
  if (urgency === 'high') score += 15
  if (responded === false) score -= 10

  score = Math.max(0, Math.min(100, score))

  let category = 'cold'
  if (score >= 80) category = 'hot'
  else if (score >= 50) category = 'warm'

  return { score, category }
}
