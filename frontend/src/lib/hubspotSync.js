import { calculateLeadScore, SCORING_DEFAULT_BUDGETS } from '../utils/leadScoring.js'
import { isHotCategory } from '../utils/leadHot.js'
import { CRM_USERS } from '../constants/crm.js'
import { RULE_TYPES } from '../constants/assignmentRules.js'
import { ACTIVITY_TYPES } from '../constants/activityTypes.js'
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js'

const HUBSPOT_CONTACTS_URL = 'https://api.hubapi.com/crm/v3/objects/contacts'
const HUBSPOT_PAGE_LIMIT = 100
const HUBSPOT_PROPERTIES = ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'company']
const SOURCE = 'hubspot'

function normalizeEmail(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

/**
 * Map HubSpot contact properties to our lead fields.
 * @param {{ properties?: Record<string, string | null> }} contact
 */
export function mapHubSpotContact(contact) {
  const props = contact?.properties ?? {}
  const firstName = String(props.firstname ?? '').trim()
  const lastName = String(props.lastname ?? '').trim()
  const email = String(props.email ?? '').trim()
  const phone = String(props.phone ?? props.mobilephone ?? '').trim()
  const company = String(props.company ?? '').trim()

  let name = [firstName, lastName].filter(Boolean).join(' ')
  if (!name && company) name = company
  if (!name && email) name = email.split('@')[0] || 'Unknown Contact'
  if (!name) name = 'Unknown Contact'
  if (company && !name.includes(company)) {
    name = `${name} (${company})`
  }

  return { firstName, lastName, email, phone, company, name }
}

async function fetchHubSpotContactsPage(accessToken, after) {
  const params = new URLSearchParams({
    limit: String(HUBSPOT_PAGE_LIMIT),
    properties: HUBSPOT_PROPERTIES.join(','),
  })
  if (after) params.set('after', after)

  const res = await fetch(`${HUBSPOT_CONTACTS_URL}?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  })

  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      body?.message ||
      body?.error ||
      body?.status ||
      `HubSpot API request failed (${res.status})`
    throw new Error(message)
  }

  return {
    results: body?.results ?? [],
    nextAfter: body?.paging?.next?.after ?? null,
  }
}

/** Fetch all HubSpot contacts (paginated). */
export async function fetchAllHubSpotContacts(accessToken) {
  const token = String(accessToken || '').trim()
  if (!token) {
    throw new Error('HubSpot access token is not configured.')
  }

  const contacts = []
  let after = null

  do {
    const page = await fetchHubSpotContactsPage(token, after)
    contacts.push(...page.results)
    after = page.nextAfter
  } while (after)

  return contacts
}

async function resolveDefaultCatalog(adminClient) {
  const { data: industries, error: indErr } = await adminClient
    .from('industries')
    .select('id, name')
    .order('name', { ascending: true })
    .limit(1)

  if (indErr) throw new Error(indErr.message)
  if (!industries?.length) {
    throw new Error('No industries configured. Add catalog data before importing HubSpot contacts.')
  }

  const industry = industries[0]
  const { data: businessTypes, error: btErr } = await adminClient
    .from('business_types')
    .select('id, name')
    .eq('industry_id', industry.id)
    .order('name', { ascending: true })
    .limit(1)

  if (btErr) throw new Error(btErr.message)
  if (!businessTypes?.length) {
    throw new Error('No business types configured for the default industry.')
  }

  return {
    industryId: industry.id,
    industryName: industry.name,
    businessTypeId: businessTypes[0].id,
  }
}

async function loadExistingEmails(adminClient, organizationId) {
  const { data, error } = await adminClient
    .from('leads')
    .select('email')
    .eq('organization_id', organizationId)
    .not('email', 'is', null)

  if (error) throw new Error(error.message)

  const set = new Set()
  for (const row of data ?? []) {
    const key = normalizeEmail(row.email)
    if (key) set.add(key)
  }
  return set
}

async function fetchScoringConfig(adminClient, industryId, businessTypeId, organizationId) {
  const { data, error } = await adminClient
    .from('scoring_configs')
    .select('high_budget, medium_budget')
    .eq('organization_id', organizationId)
    .eq('industry_id', industryId)
    .eq('business_type_id', businessTypeId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

async function fetchAssignmentRules(adminClient, organizationId) {
  const { data, error } = await adminClient
    .from('assignment_rules')
    .select('id, rule_type, condition_field, condition_value, assigned_user, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

function parseBudgetCondition(value) {
  const s = String(value || '').trim()
  const m = s.match(/^([><=]+)\s*(\d+(?:\.\d+)?)$/)
  if (!m) {
    const n = Number(s.replace(/[^\d.]/g, ''))
    if (Number.isFinite(n)) return { op: '>=', num: n }
    return null
  }
  return { op: m[1], num: Number(m[2]) }
}

function budgetMatches(budget, conditionValue) {
  const parsed = parseBudgetCondition(conditionValue)
  if (!parsed) return false
  const b = Number(budget)
  if (!Number.isFinite(b)) return false
  const { op, num } = parsed
  if (op === '>' || op === '>>') return b > num
  if (op === '>=' || op === '=>') return b >= num
  if (op === '<') return b < num
  if (op === '<=' || op === '=<') return b <= num
  if (op === '=' || op === '==') return b === num
  return b >= num
}

function ruleMatches(rule, ctx) {
  const { lead, industryName } = ctx
  const type = rule.rule_type

  if (type === RULE_TYPES.INDUSTRY) {
    const target = String(rule.condition_value || '').trim().toLowerCase()
    const name = String(industryName || '').trim().toLowerCase()
    return target && name && (name === target || name.includes(target) || target.includes(name))
  }

  if (type === RULE_TYPES.SOURCE) {
    const target = String(rule.condition_value || '').trim().toLowerCase()
    const src = String(lead.source || '').trim().toLowerCase()
    return target && src === target
  }

  if (type === RULE_TYPES.BUDGET) {
    return budgetMatches(lead.budget, rule.condition_value)
  }

  return false
}

async function pickRoundRobinAssignee(adminClient, organizationId) {
  const { data: profs } = await adminClient
    .from('profiles')
    .select('full_name')
    .eq('organization_id', organizationId)
    .order('full_name', { ascending: true })

  const team = [...new Set((profs ?? []).map((p) => p.full_name).filter(Boolean))]
  const pool = team.length ? team : CRM_USERS

  const { count, error } = await adminClient
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)

  if (error) throw error

  const n = Number(count) || 0
  return pool[n % pool.length]
}

async function resolveLeadAssignee(adminClient, { lead, industryName, organizationId, rules }) {
  for (const rule of rules) {
    if (ruleMatches(rule, { lead, industryName })) {
      return { assignee: rule.assigned_user, matchedRule: rule, method: 'rule' }
    }
  }

  const assignee = await pickRoundRobinAssignee(adminClient, organizationId)
  return { assignee, matchedRule: null, method: 'round_robin' }
}

async function insertActivity(adminClient, payload) {
  const { error } = await adminClient.from('activities').insert({
    lead_id: payload.leadId,
    organization_id: payload.organizationId,
    user_id: payload.userId,
    activity_type: payload.activityType,
    description: payload.description,
    metadata: payload.metadata ?? {},
  })

  if (error) {
    console.error('[hubspotSync] activity insert failed:', error.message)
  }
}

async function insertScoreHistory(adminClient, payload) {
  const { error } = await adminClient.from('score_history').insert({
    lead_id: payload.leadId,
    organization_id: payload.organizationId,
    old_score: payload.oldScore,
    new_score: payload.newScore,
    reason: payload.reason,
    user_id: payload.userId,
  })

  if (error) {
    console.error('[hubspotSync] score history insert failed:', error.message)
  }
}

async function findProfileIdByName(adminClient, organizationId, fullName) {
  if (!fullName?.trim() || !organizationId) return null
  const { data } = await adminClient
    .from('profiles')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('full_name', fullName.trim())
    .maybeSingle()
  return data?.id ?? null
}

async function insertNotification(adminClient, payload) {
  const { error } = await adminClient.from('notifications').insert({
    organization_id: payload.organizationId,
    user_id: payload.userId,
    notification_type: payload.notificationType,
    title: payload.title,
    message: payload.message,
    lead_id: payload.leadId,
    is_read: false,
    metadata: payload.metadata ?? {},
  })

  if (error) {
    console.error('[hubspotSync] notification insert failed:', error.message)
  }
}

async function importHubSpotLead({
  adminClient,
  mapped,
  organizationId,
  userId,
  catalog,
  rules,
}) {
  const { industryId, industryName, businessTypeId } = catalog

  const configRow = await fetchScoringConfig(adminClient, industryId, businessTypeId, organizationId)
  const highBudget = configRow?.high_budget ?? SCORING_DEFAULT_BUDGETS.highBudget
  const mediumBudget = configRow?.medium_budget ?? SCORING_DEFAULT_BUDGETS.mediumBudget

  const budget = 0
  const urgency = 'medium'
  const phone = mapped.phone || 'N/A'

  const { score, category } = calculateLeadScore({
    source: SOURCE,
    responded: false,
    budget,
    urgency,
    highBudget,
    mediumBudget,
  })

  const draftLead = {
    source: SOURCE,
    budget,
    urgency,
    industry_id: industryId,
    business_type_id: businessTypeId,
  }

  const { assignee, matchedRule, method } = await resolveLeadAssignee(adminClient, {
    lead: draftLead,
    industryName,
    organizationId,
    rules,
  })

  const leadRow = {
    name: mapped.name,
    phone,
    email: mapped.email,
    source: SOURCE,
    budget,
    urgency,
    responded: false,
    industry_id: industryId,
    business_type_id: businessTypeId,
    score,
    category,
    status: 'new',
    assigned_to: assignee,
    organization_id: organizationId,
    created_by: userId,
  }

  const { data: inserted, error: insErr } = await adminClient
    .from('leads')
    .insert(leadRow)
    .select()
    .single()

  if (insErr) throw new Error(insErr.message)

  await insertActivity(adminClient, {
    leadId: inserted.id,
    organizationId,
    userId,
    activityType: ACTIVITY_TYPES.LEAD_CREATED,
    description: `Lead imported from HubSpot: ${inserted.name}`,
    metadata: { source: SOURCE, score, category, via: 'hubspot' },
  })

  await insertScoreHistory(adminClient, {
    leadId: inserted.id,
    organizationId,
    oldScore: 0,
    newScore: inserted.score ?? 0,
    reason: 'Initial score on lead creation',
    userId,
  })

  if (assignee) {
    await insertActivity(adminClient, {
      leadId: inserted.id,
      organizationId,
      userId,
      activityType: ACTIVITY_TYPES.LEAD_ASSIGNED,
      description: `Lead assigned to ${assignee}`,
      metadata: { assigned_to: assignee, method },
    })

    if (matchedRule) {
      await insertActivity(adminClient, {
        leadId: inserted.id,
        organizationId,
        userId,
        activityType: ACTIVITY_TYPES.ASSIGNMENT_RULE_APPLIED,
        description: `Assignment rule applied (${matchedRule.rule_type}: ${matchedRule.condition_value})`,
        metadata: {
          rule_id: matchedRule.id,
          rule_type: matchedRule.rule_type,
          assigned_user: assignee,
        },
      })
    }
  }

  if (isHotCategory(category)) {
    const assigneeId = await findProfileIdByName(adminClient, organizationId, assignee)
    await insertNotification(adminClient, {
      organizationId,
      userId: assigneeId,
      notificationType: NOTIFICATION_TYPES.HOT_LEAD_ARRIVED,
      title: 'Hot Lead Arrived',
      message: `${inserted.name} scored ${inserted.score} — act now!`,
      leadId: inserted.id,
      metadata: { score: inserted.score, source: inserted.source },
    })
  }

  return inserted
}

/**
 * Authenticate a Supabase session and resolve the user's organization.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminClient
 * @param {string | undefined} authHeader
 */
export async function authenticateHubSpotImport(adminClient, authHeader) {
  const token = String(authHeader || '')
    .replace(/^Bearer\s+/i, '')
    .trim()

  if (!token) {
    return { ok: false, status: 401, error: 'Missing authorization token.' }
  }

  const { data: userData, error: userErr } = await adminClient.auth.getUser(token)
  if (userErr || !userData?.user?.id) {
    return { ok: false, status: 401, error: 'Invalid or expired session.' }
  }

  const userId = userData.user.id
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('id, organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileErr) {
    return { ok: false, status: 500, error: profileErr.message }
  }
  if (!profile?.organization_id) {
    return { ok: false, status: 403, error: 'No organization found for this user.' }
  }

  return {
    ok: true,
    userId,
    organizationId: profile.organization_id,
  }
}

/**
 * Fetch HubSpot contacts and import new leads (skip when email already exists in org).
 * @param {import('@supabase/supabase-js').SupabaseClient} adminClient
 * @param {{ hubspotAccessToken: string, organizationId: string, userId: string }} params
 */
export async function syncHubSpotContacts(adminClient, { hubspotAccessToken, organizationId, userId }) {
  const contacts = await fetchAllHubSpotContacts(hubspotAccessToken)
  const catalog = await resolveDefaultCatalog(adminClient)
  const existingEmails = await loadExistingEmails(adminClient, organizationId)
  const rules = await fetchAssignmentRules(adminClient, organizationId)

  let imported = 0
  let skipped = 0

  for (const contact of contacts) {
    const mapped = mapHubSpotContact(contact)
    const emailKey = normalizeEmail(mapped.email)

    if (!emailKey) {
      skipped += 1
      continue
    }

    if (existingEmails.has(emailKey)) {
      skipped += 1
      continue
    }

    await importHubSpotLead({
      adminClient,
      mapped: { ...mapped, email: mapped.email.trim() },
      organizationId,
      userId,
      catalog,
      rules,
    })

    existingEmails.add(emailKey)
    imported += 1
  }

  return {
    imported,
    skipped,
    total: contacts.length,
  }
}
