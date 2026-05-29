import { supabase } from '../lib/supabaseClient'
import { NOTIFICATION_TYPES } from '../constants/notificationTypes'
import { isHotCategory } from '../utils/leadHot'

async function findProfileIdByName(organizationId, fullName, client) {
  if (!fullName?.trim() || !organizationId) return null
  const db = client ?? supabase
  const { data } = await db
    .from('profiles')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('full_name', fullName.trim())
    .maybeSingle()
  return data?.id ?? null
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} [client]
 */
export async function createNotification(
  {
    organizationId,
    userId = null,
    notificationType,
    title,
    message,
    leadId = null,
    metadata = {},
  },
  client,
) {
  const db = client ?? supabase
  const { data, error } = await db
    .from('notifications')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      notification_type: notificationType,
      title,
      message,
      lead_id: leadId,
      is_read: false,
      metadata,
    })
    .select()
    .single()

  if (error) {
    console.error('[notificationService] create failed:', error.message)
  }
  return { data, error }
}

export async function createHotLeadNotification(lead, client) {
  if (!isHotCategory(lead?.category)) return { data: null, error: null }

  const assigneeId = await findProfileIdByName(
    lead.organization_id,
    lead.assigned_to,
    client,
  )

  return createNotification(
    {
      organizationId: lead.organization_id,
      userId: assigneeId,
      notificationType: NOTIFICATION_TYPES.HOT_LEAD_ARRIVED,
      title: 'Hot Lead Arrived',
      message: `${lead.name} scored ${lead.score} — act now!`,
      leadId: lead.id,
      metadata: { score: lead.score, source: lead.source },
    },
    client,
  )
}

export async function createLeadAssignedNotification(lead, assigneeName, client) {
  const assigneeId = await findProfileIdByName(lead.organization_id, assigneeName, client)

  return createNotification(
    {
      organizationId: lead.organization_id,
      userId: assigneeId,
      notificationType: NOTIFICATION_TYPES.LEAD_ASSIGNED,
      title: 'Lead Assigned',
      message: `${lead.name} was assigned to ${assigneeName || 'you'}.`,
      leadId: lead.id,
      metadata: { assigned_to: assigneeName },
    },
    client,
  )
}

export async function createLeadConvertedNotification(lead, client) {
  const assigneeId = await findProfileIdByName(
    lead.organization_id,
    lead.assigned_to,
    client,
  )

  return createNotification(
    {
      organizationId: lead.organization_id,
      userId: assigneeId,
      notificationType: NOTIFICATION_TYPES.LEAD_CONVERTED,
      title: 'Lead Converted',
      message: `${lead.name} was marked converted — great work!`,
      leadId: lead.id,
    },
    client,
  )
}

/**
 * Create task_overdue notifications for pending past-due tasks (deduped per task).
 */
export async function syncOverdueTaskNotifications(organizationId, client) {
  if (!organizationId) return { created: 0 }

  const db = client ?? supabase
  const now = new Date().toISOString()

  const { data: overdueTasks, error } = await db
    .from('tasks')
    .select('id, lead_id, task_type, due_date, organization_id, leads(name, assigned_to)')
    .eq('organization_id', organizationId)
    .eq('status', 'pending')
    .lt('due_date', now)

  if (error || !overdueTasks?.length) return { created: 0 }

  let created = 0
  for (const task of overdueTasks) {
    const lead = Array.isArray(task.leads) ? task.leads[0] : task.leads
    const leadName = lead?.name ?? 'Lead'
    const assignee = lead?.assigned_to

    const { data: existing } = await db
      .from('notifications')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('notification_type', NOTIFICATION_TYPES.TASK_OVERDUE)
      .contains('metadata', { task_id: task.id })
      .limit(1)

    if (existing?.length) continue

    const assigneeId = await findProfileIdByName(organizationId, assignee, db)
    const { error: insErr } = await createNotification(
      {
        organizationId,
        userId: assigneeId,
        notificationType: NOTIFICATION_TYPES.TASK_OVERDUE,
        title: 'Task Overdue',
        message: `${task.task_type} for ${leadName} is overdue.`,
        leadId: task.lead_id,
        metadata: { task_id: task.id, task_type: task.task_type, due_date: task.due_date },
      },
      db,
    )
    if (!insErr) created += 1
  }

  return { created }
}

export async function createImportCompletedNotification(
  { organizationId, userId, fileName, importedCount, failedCount, importId },
  client,
) {
  return createNotification(
    {
      organizationId,
      userId,
      notificationType: NOTIFICATION_TYPES.IMPORT_COMPLETED,
      title: 'Import Completed',
      message: `${fileName}: ${importedCount} leads imported${failedCount ? `, ${failedCount} failed` : ''}.`,
      metadata: { import_id: importId, imported_count: importedCount, failed_count: failedCount },
    },
    client,
  )
}

export async function createLeadAssignedByRuleNotification(lead, assigneeName, rule, client) {
  const assigneeId = await findProfileIdByName(lead.organization_id, assigneeName, client)

  return createNotification(
    {
      organizationId: lead.organization_id,
      userId: assigneeId,
      notificationType: NOTIFICATION_TYPES.LEAD_ASSIGNED_BY_RULE,
      title: 'Lead Assigned by Rule',
      message: `${lead.name} assigned to ${assigneeName} via ${rule.rule_type} rule.`,
      leadId: lead.id,
      metadata: { rule_id: rule.id, rule_type: rule.rule_type, assigned_to: assigneeName },
    },
    client,
  )
}

/**
 * Notify for leads older than 15 days still open (deduped per lead).
 */
export async function syncAgingLeadNotifications(organizationId, client) {
  if (!organizationId) return { created: 0 }

  const db = client ?? supabase
  const thresholdMs = 15 * 86400000
  const cutoff = new Date(Date.now() - thresholdMs).toISOString()

  const { data: staleLeads, error } = await db
    .from('leads')
    .select('id, name, status, created_at, assigned_to, organization_id')
    .eq('organization_id', organizationId)
    .lt('created_at', cutoff)

  if (error || !staleLeads?.length) return { created: 0 }

  const openLeads = staleLeads.filter((lead) => {
    const s = (lead.status || 'new').toLowerCase()
    return s !== 'converted' && s !== 'lost'
  })

  let created = 0
  for (const lead of openLeads) {
    const { data: existing } = await db
      .from('notifications')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('notification_type', NOTIFICATION_TYPES.AGING_LEAD_ALERT)
      .eq('lead_id', lead.id)
      .limit(1)

    if (existing?.length) continue

    const assigneeId = await findProfileIdByName(organizationId, lead.assigned_to, db)
    const { error: insErr } = await createNotification(
      {
        organizationId,
        userId: assigneeId,
        notificationType: NOTIFICATION_TYPES.AGING_LEAD_ALERT,
        title: 'Lead Requires Attention',
        message: `${lead.name} has been open for over 15 days — follow up soon.`,
        leadId: lead.id,
        metadata: { created_at: lead.created_at, status: lead.status },
      },
      db,
    )
    if (!insErr) created += 1
  }

  return { created }
}

export async function fetchNotifications(organizationId, userId, { limit = 50 } = {}) {
  let q = supabase
    .from('notifications')
    .select('id, notification_type, title, message, lead_id, is_read, created_at, metadata')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (userId) {
    q = q.or(`user_id.eq.${userId},user_id.is.null`)
  }

  const { data, error } = await q
  return { data: data ?? [], error }
}

export async function fetchUnreadCount(organizationId, userId) {
  let q = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('is_read', false)

  if (userId) {
    q = q.or(`user_id.eq.${userId},user_id.is.null`)
  }

  const { count, error } = await q
  return { count: error ? 0 : count ?? 0, error }
}

export async function markNotificationRead(notificationId, organizationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
    .eq('organization_id', organizationId)

  return { error }
}

export async function markAllNotificationsRead(organizationId, userId) {
  let q = supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('organization_id', organizationId)
    .eq('is_read', false)

  if (userId) {
    q = q.or(`user_id.eq.${userId},user_id.is.null`)
  }

  const { error } = await q
  return { error }
}
