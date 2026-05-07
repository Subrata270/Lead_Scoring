/** @typedef {'admin'|'manager'|'salesperson'|string} OrgRole */

export function normalizeRole(role) {
  return String(role || '').toLowerCase().trim()
}

/** Admin & manager see all leads for the organization */
export function seesAllOrgLeads(role) {
  const r = normalizeRole(role)
  return r === 'admin' || r === 'manager'
}

export function isSalesperson(role) {
  return normalizeRole(role) === 'salesperson'
}
