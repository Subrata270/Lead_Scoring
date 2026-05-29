import { supabase } from '../lib/supabaseClient'
import { calculateLeadScore, SCORING_DEFAULT_BUDGETS } from '../utils/leadScoring'
import { fetchScoringConfigRow } from '../hooks/useScoringConfig'
import { recordScoreHistory } from './scoreHistoryService'
import { createHotLeadNotification } from './notificationService'
import { isHotCategory } from '../utils/leadHot'

/**
 * Recalculate lead score from current fields, persist if changed, log history.
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 */
export async function rescoreLead(lead, { reason = 'Score recalculated', userId = null } = {}, client) {
  const db = client ?? supabase

  const { row: configRow } = await fetchScoringConfigRow(
    lead.industry_id,
    lead.business_type_id,
    lead.organization_id,
  )

  const highBudget = configRow?.high_budget ?? SCORING_DEFAULT_BUDGETS.highBudget
  const mediumBudget = configRow?.medium_budget ?? SCORING_DEFAULT_BUDGETS.mediumBudget

  const oldScore = lead.score ?? 0
  const oldCategory = lead.category ?? 'cold'

  const { score, category } = calculateLeadScore({
    source: lead.source,
    responded: lead.responded,
    budget: lead.budget,
    urgency: lead.urgency,
    highBudget,
    mediumBudget,
  })

  const patch = {}
  if (score !== oldScore) patch.score = score
  if (category !== oldCategory) patch.category = category

  if (Object.keys(patch).length === 0) {
    return {
      lead,
      changed: false,
      oldScore,
      newScore: score,
      highBudget,
      mediumBudget,
    }
  }

  const { error } = await db.from('leads').update(patch).eq('id', lead.id)
  if (error) {
    console.error('[rescoreLead] update failed:', error.message)
    return { lead, changed: false, oldScore, newScore: score, error, highBudget, mediumBudget }
  }

  await recordScoreHistory(
    {
      leadId: lead.id,
      organizationId: lead.organization_id,
      oldScore,
      newScore: score,
      reason,
      userId,
    },
    db,
  )

  const updatedLead = { ...lead, ...patch }

  if (isHotCategory(category) && !isHotCategory(oldCategory)) {
    await createHotLeadNotification(updatedLead, db)
  }

  return {
    lead: updatedLead,
    changed: true,
    oldScore,
    newScore: score,
    highBudget,
    mediumBudget,
  }
}

/**
 * Score + history on brand-new lead (initial entry).
 */
export async function recordInitialScore(lead, userId = null, client) {
  return recordScoreHistory(
    {
      leadId: lead.id,
      organizationId: lead.organization_id,
      oldScore: 0,
      newScore: lead.score ?? 0,
      reason: 'Initial score on lead creation',
      userId,
    },
    client,
  )
}
