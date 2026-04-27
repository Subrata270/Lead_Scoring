export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfToday() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d
}

/** Pending task due before today (local calendar). */
export function isOverdueFollowUp(dueDateIso) {
  if (!dueDateIso) return false
  return new Date(dueDateIso) < startOfToday()
}

/** Pending task due sometime today (local calendar). */
export function isDueTodayFollowUp(dueDateIso) {
  if (!dueDateIso) return false
  const due = new Date(dueDateIso)
  return due >= startOfToday() && due <= endOfToday()
}

export function sortByDueAsc(a, b) {
  return new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
}
