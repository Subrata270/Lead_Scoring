import { supabase } from '../lib/supabaseClient'

export async function recordScoreHistory(
  { leadId, organizationId, oldScore, newScore, reason, userId = null },
  client,
) {
  if (oldScore === newScore) return { data: null, error: null }

  const db = client ?? supabase
  const { data, error } = await db
    .from('score_history')
    .insert({
      lead_id: leadId,
      organization_id: organizationId,
      old_score: oldScore,
      new_score: newScore,
      reason,
      user_id: userId,
    })
    .select()
    .single()

  if (error) {
    console.error('[scoreHistory] record failed:', error.message)
  }
  return { data, error }
}

export async function fetchScoreHistory(leadId, organizationId, client) {
  const db = client ?? supabase
  const { data, error } = await db
    .from('score_history')
    .select('id, old_score, new_score, reason, created_at')
    .eq('lead_id', leadId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  return { data: data ?? [], error }
}
