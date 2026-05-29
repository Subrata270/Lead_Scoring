export const ACTIVITY_TYPES = {
  LEAD_CREATED: 'lead_created',
  LEAD_UPDATED: 'lead_updated',
  LEAD_ASSIGNED: 'lead_assigned',
  STATUS_CHANGED: 'status_changed',
  TASK_CREATED: 'task_created',
  TASK_COMPLETED: 'task_completed',
  MESSAGE_GENERATED: 'message_generated',
  LEAD_CONVERTED: 'lead_converted',
  LEAD_LOST: 'lead_lost',
  CSV_IMPORTED: 'csv_imported',
  ASSIGNMENT_RULE_APPLIED: 'assignment_rule_applied',
}

/** CSS kind + icon for timeline rendering */
export function activityTimelineMeta(activityType) {
  const map = {
    [ACTIVITY_TYPES.LEAD_CREATED]: { kind: 'created', icon: '✨' },
    [ACTIVITY_TYPES.LEAD_UPDATED]: { kind: 'updated', icon: '✏️' },
    [ACTIVITY_TYPES.LEAD_ASSIGNED]: { kind: 'assigned', icon: '👤' },
    [ACTIVITY_TYPES.STATUS_CHANGED]: { kind: 'status', icon: '🔄' },
    [ACTIVITY_TYPES.TASK_CREATED]: { kind: 'task', icon: '📋' },
    [ACTIVITY_TYPES.TASK_COMPLETED]: { kind: 'task_done', icon: '✅' },
    [ACTIVITY_TYPES.MESSAGE_GENERATED]: { kind: 'message', icon: '💬' },
    [ACTIVITY_TYPES.LEAD_CONVERTED]: { kind: 'converted', icon: '🎉' },
    [ACTIVITY_TYPES.LEAD_LOST]: { kind: 'lost', icon: '❌' },
    [ACTIVITY_TYPES.CSV_IMPORTED]: { kind: 'import', icon: '📥' },
    [ACTIVITY_TYPES.ASSIGNMENT_RULE_APPLIED]: { kind: 'rule', icon: '⚙️' },
  }
  return map[activityType] ?? { kind: 'updated', icon: '•' }
}
