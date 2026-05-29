import { supabase } from '../lib/supabaseClient'
import { CRM_USERS } from '../constants/crm'
import { RULE_TYPES } from '../constants/assignmentRules'
import { ACTIVITY_TYPES } from '../constants/activityTypes'
import { recordActivity } from './activityEngine'
import { createLeadAssignedByRuleNotification, createLeadAssignedNotification } from './notificationService'

export async function fetchAssignmentRules(organizationId, client) {
  const db = client ?? supabase
  const { data, error } = await db
    .from('assignment_rules')
    .select('id, rule_type, condition_field, condition_value, assigned_user, created_at')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })

  return { rules: data ?? [], error }
}

export async function createAssignmentRule(organizationId, rule) {
  const { data, error } = await supabase
    .from('assignment_rules')
    .insert({
      organization_id: organizationId,
      rule_type: rule.rule_type,
      condition_field: rule.condition_field,
      condition_value: rule.condition_value,
      assigned_user: rule.assigned_user,
    })
    .select()
    .single()

  return { data, error }
}

export async function updateAssignmentRule(ruleId, organizationId, patch) {
  const { data, error } = await supabase
    .from('assignment_rules')
    .update(patch)
    .eq('id', ruleId)
    .eq('organization_id', organizationId)
    .select()
    .single()

  return { data, error }
}

export async function deleteAssignmentRule(ruleId, organizationId) {
  const { error } = await supabase
    .from('assignment_rules')
    .delete()
    .eq('id', ruleId)
    .eq('organization_id', organizationId)

  return { error }
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

export async function pickRoundRobinAssignee(organizationId, client) {
  const db = client ?? supabase

  const { data: profs } = await db
    .from('profiles')
    .select('full_name')
    .eq('organization_id', organizationId)
    .order('full_name', { ascending: true })

  const team = [...new Set((profs ?? []).map((p) => p.full_name).filter(Boolean))]
  const pool = team.length ? team : CRM_USERS

  let q = db.from('leads').select('*', { count: 'exact', head: true })
  if (organizationId) q = q.eq('organization_id', organizationId)
  const { count, error } = await q
  if (error) throw error

  const n = Number(count) || 0
  return pool[n % pool.length]
}

/**
 * Resolve assignee using rules first, then round-robin fallback.
 * @returns {{ assignee: string, matchedRule: object|null, method: 'rule'|'round_robin' }}
 */
export async function resolveLeadAssignee(
  { lead, industryName, organizationId, rules },
  client,
) {
  const db = client ?? supabase
  let ruleList = rules
  if (!ruleList) {
    const { rules: fetched } = await fetchAssignmentRules(organizationId, db)
    ruleList = fetched
  }

  for (const rule of ruleList) {
    if (ruleMatches(rule, { lead, industryName })) {
      return { assignee: rule.assigned_user, matchedRule: rule, method: 'rule' }
    }
  }

  const assignee = await pickRoundRobinAssignee(organizationId, db)
  return { assignee, matchedRule: null, method: 'round_robin' }
}

/** Post-assignment side effects: activities + notifications */
export async function recordAssignmentOutcome(
  {
    lead,
    assignee,
    matchedRule,
    organizationId,
    userId = null,
    method,
  },
  client,
) {
  if (!assignee) return

  await recordActivity(
    {
      leadId: lead.id,
      organizationId,
      userId,
      activityType: ACTIVITY_TYPES.LEAD_ASSIGNED,
      description: `Lead assigned to ${assignee}`,
      metadata: { assigned_to: assignee, method },
    },
    client,
  )

  if (matchedRule) {
    await recordActivity(
      {
        leadId: lead.id,
        organizationId,
        userId,
        activityType: ACTIVITY_TYPES.ASSIGNMENT_RULE_APPLIED,
        description: `Assignment rule applied (${matchedRule.rule_type}: ${matchedRule.condition_value})`,
        metadata: {
          rule_id: matchedRule.id,
          rule_type: matchedRule.rule_type,
          assigned_user: assignee,
        },
      },
      client,
    )
    await createLeadAssignedByRuleNotification(lead, assignee, matchedRule, client)
  } else {
    await createLeadAssignedNotification(lead, assignee, client)
  }
}
