import { supabase } from '../lib/supabaseClient'

/**
 * Persist an activity record. Accepts optional Supabase client (service-role on public API).
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 */
export async function recordActivity(
  {
    leadId,
    organizationId,
    userId = null,
    activityType,
    description,
    metadata = {},
  },
  client,
) {
  if (!leadId || !organizationId || !activityType) {
    return { data: null, error: new Error('Missing required activity fields') }
  }

  const db = client ?? supabase
  const { data, error } = await db
    .from('activities')
    .insert({
      lead_id: leadId,
      organization_id: organizationId,
      user_id: userId,
      activity_type: activityType,
      description,
      metadata,
    })
    .select()
    .single()

  if (error) {
    console.error('[activityEngine] recordActivity failed:', error.message)
  }
  return { data, error }
}

/**
 * Fetch activities for a lead (newest first).
 */
export async function fetchLeadActivities(leadId, organizationId, client) {
  const db = client ?? supabase
  const { data, error } = await db
    .from('activities')
    .select('id, activity_type, description, metadata, created_at, user_id')
    .eq('lead_id', leadId)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  return { data: data ?? [], error }
}
