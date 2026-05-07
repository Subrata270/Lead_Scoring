import { calculateLeadScore, SCORING_DEFAULT_BUDGETS } from '../utils/leadScoring.js'
import { CRM_USERS } from '../constants/crm.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_SOURCES = new Set(['website', 'referral', 'ads', 'event', 'other', 'api', 'public_form'])

function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v.trim())
}

function startOfTomorrowUtc() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCHours(9, 0, 0, 0)
  return d.toISOString()
}

async function pickRotatedAssignee(adminClient, organizationId = null) {
  let q = adminClient.from('leads').select('*', { count: 'exact', head: true })
  if (organizationId) q = q.eq('organization_id', organizationId)
  const { count, error } = await q
  if (error) throw error
  const n = Number(count) || 0
  return CRM_USERS[n % CRM_USERS.length]
}

/**
 * Validates and creates a lead (score, assignee, optional auto-task). Uses a service-role Supabase client.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminClient
 * @param {Record<string, unknown>} body
 * @param {{ defaultSource?: string }} [opts]
 */
export async function createPublicLead(adminClient, body, opts = {}) {
  const defaultSource = opts.defaultSource ?? 'api'
  const messages = []

  const name = body.name != null ? String(body.name).trim() : ''
  const phone = body.phone != null ? String(body.phone).trim() : ''
  const email = body.email != null ? String(body.email).trim() : ''
  const industry_id = body.industry_id != null ? String(body.industry_id).trim() : ''
  const business_type_id = body.business_type_id != null ? String(body.business_type_id).trim() : ''

  if (!name) messages.push('name is required')
  if (!phone) messages.push('phone is required')
  if (!industry_id) messages.push('industry_id is required')
  else if (!isUuid(industry_id)) messages.push('industry_id must be a valid UUID')
  if (!business_type_id) messages.push('business_type_id is required')
  else if (!isUuid(business_type_id)) messages.push('business_type_id must be a valid UUID')
  if (name.length > 500) messages.push('name is too long')
  if (phone.length > 80) messages.push('phone is too long')
  if (email.length > 320) messages.push('email is too long')

  let budget = 0
  if (body.budget !== undefined && body.budget !== null && body.budget !== '') {
    const b = Number(body.budget)
    if (!Number.isFinite(b) || b < 0) messages.push('budget must be a non-negative number')
    else budget = b
  }

  let urgency = 'medium'
  if (body.urgency !== undefined && body.urgency !== null && body.urgency !== '') {
    const u = String(body.urgency).toLowerCase().trim()
    if (!['low', 'medium', 'high'].includes(u)) messages.push('urgency must be low, medium, or high')
    else urgency = u
  }

  let source =
    typeof body.source === 'string' && body.source.trim()
      ? body.source.trim()
      : defaultSource
  if (!ALLOWED_SOURCES.has(source)) {
    source = defaultSource
  }

  let organization_id = null
  if (body.organization_id != null && String(body.organization_id).trim()) {
    const oid = String(body.organization_id).trim()
    if (!isUuid(oid)) messages.push('organization_id must be a valid UUID')
    else organization_id = oid
  }

  if (messages.length) {
    return { ok: false, status: 400, error: 'Validation failed', details: messages }
  }

  const { data: btRow, error: btErr } = await adminClient
    .from('business_types')
    .select('id, industry_id')
    .eq('id', business_type_id)
    .maybeSingle()

  if (btErr) {
    return { ok: false, status: 500, error: btErr.message }
  }
  if (!btRow || btRow.industry_id !== industry_id) {
    return {
      ok: false,
      status: 400,
      error: 'business_type_id does not belong to the given industry_id',
    }
  }

  const { data: configRow, error: cfgErr } = await adminClient
    .from('scoring_configs')
    .select('high_budget, medium_budget')
    .eq('industry_id', industry_id)
    .eq('business_type_id', business_type_id)
    .maybeSingle()

  if (cfgErr) {
    return { ok: false, status: 500, error: cfgErr.message }
  }

  const highBudget = configRow?.high_budget ?? SCORING_DEFAULT_BUDGETS.highBudget
  const mediumBudget = configRow?.medium_budget ?? SCORING_DEFAULT_BUDGETS.mediumBudget

  const { score, category } = calculateLeadScore({
    source,
    responded: undefined,
    budget,
    urgency,
    highBudget,
    mediumBudget,
  })

  let assigned_to
  try {
    assigned_to = await pickRotatedAssignee(adminClient, organization_id)
  } catch (e) {
    return { ok: false, status: 500, error: e?.message ?? 'Failed to pick assignee' }
  }

  const leadRow = {
    name,
    phone,
    email: email || null,
    source,
    budget,
    urgency,
    responded: false,
    industry_id,
    business_type_id,
    score,
    category,
    status: 'new',
    assigned_to,
    organization_id,
    created_by: null,
  }

  const { data: inserted, error: insErr } = await adminClient.from('leads').insert(leadRow).select().single()

  if (insErr) {
    return { ok: false, status: 500, error: insErr.message }
  }

  const leadId = inserted.id
  let task = null
  let taskWarning = null

  if (category === 'hot') {
    const due = new Date().toISOString()
    const { data: taskRow, error: taskErr } = await adminClient
      .from('tasks')
      .insert({
        lead_id: leadId,
        organization_id,
        created_by: null,
        task_type: 'call',
        due_date: due,
        status: 'pending',
      })
      .select()
      .single()
    if (taskErr) taskWarning = taskErr.message
    else task = taskRow
  } else if (category === 'warm') {
    const due = startOfTomorrowUtc()
    const { data: taskRow, error: taskErr } = await adminClient
      .from('tasks')
      .insert({
        lead_id: leadId,
        organization_id,
        created_by: null,
        task_type: 'follow-up',
        due_date: due,
        status: 'pending',
      })
      .select()
      .single()
    if (taskErr) taskWarning = taskErr.message
    else task = taskRow
  }

  return {
    ok: true,
    status: 201,
    data: {
      lead: inserted,
      score,
      category,
      assigned_to,
      task,
      ...(taskWarning ? { taskWarning } : {}),
    },
  }
}
