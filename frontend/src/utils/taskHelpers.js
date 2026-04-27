/** Calendar-day overdue: due date is before today (local), and still pending. */
export function isTaskOverdue(dueDateIso, status) {
  if (status !== 'pending' || !dueDateIso) return false
  const due = new Date(dueDateIso)
  const today = new Date()
  due.setHours(0, 0, 0, 0)
  today.setHours(0, 0, 0, 0)
  return due < today
}

export function countOverduePendingTasks(tasks) {
  return tasks.filter((t) => isTaskOverdue(t.due_date, t.status)).length
}

export function countPendingTasks(tasks) {
  return tasks.filter((t) => t.status === 'pending').length
}
