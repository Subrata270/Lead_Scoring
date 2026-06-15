export const NOTIFICATION_TYPES = {
  HOT_LEAD_ARRIVED: 'hot_lead_arrived',
  LEAD_ASSIGNED: 'lead_assigned',
  TASK_OVERDUE: 'task_overdue',
  LEAD_CONVERTED: 'lead_converted',
  IMPORT_COMPLETED: 'import_completed',
  LEAD_ASSIGNED_BY_RULE: 'lead_assigned_by_rule',
  AGING_LEAD_ALERT: 'aging_lead_alert',
  WHATSAPP_SEND_FAILED: 'whatsapp_send_failed',
}

export function notificationTypeLabel(type) {
  const map = {
    [NOTIFICATION_TYPES.HOT_LEAD_ARRIVED]: 'Hot Lead Arrived',
    [NOTIFICATION_TYPES.LEAD_ASSIGNED]: 'Lead Assigned',
    [NOTIFICATION_TYPES.TASK_OVERDUE]: 'Task Overdue',
    [NOTIFICATION_TYPES.LEAD_CONVERTED]: 'Lead Converted',
    [NOTIFICATION_TYPES.IMPORT_COMPLETED]: 'Import Completed',
    [NOTIFICATION_TYPES.LEAD_ASSIGNED_BY_RULE]: 'Assigned by Rule',
    [NOTIFICATION_TYPES.AGING_LEAD_ALERT]: 'Aging Lead Alert',
    [NOTIFICATION_TYPES.WHATSAPP_SEND_FAILED]: 'WhatsApp Send Failed',
  }
  return map[type] ?? type
}

export function notificationTypeIcon(type) {
  const map = {
    [NOTIFICATION_TYPES.HOT_LEAD_ARRIVED]: '🔥',
    [NOTIFICATION_TYPES.LEAD_ASSIGNED]: '👤',
    [NOTIFICATION_TYPES.TASK_OVERDUE]: '⏰',
    [NOTIFICATION_TYPES.LEAD_CONVERTED]: '🎉',
    [NOTIFICATION_TYPES.IMPORT_COMPLETED]: '📥',
    [NOTIFICATION_TYPES.LEAD_ASSIGNED_BY_RULE]: '⚙️',
    [NOTIFICATION_TYPES.AGING_LEAD_ALERT]: '⏳',
    [NOTIFICATION_TYPES.WHATSAPP_SEND_FAILED]: '📱',
  }
  return map[type] ?? '🔔'
}
