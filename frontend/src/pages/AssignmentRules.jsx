import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { supabase } from '../lib/supabaseClient'
import {
  RULE_TYPES,
  RULE_TYPE_LABELS,
} from '../constants/assignmentRules.js'
import {
  createAssignmentRule,
  deleteAssignmentRule,
  fetchAssignmentRules,
  updateAssignmentRule,
} from '../services/assignmentEngine.js'

const EMPTY_FORM = {
  rule_type: RULE_TYPES.INDUSTRY,
  condition_value: '',
  assigned_user: '',
}

function defaultConditionField(ruleType) {
  if (ruleType === RULE_TYPES.INDUSTRY) return 'industry'
  if (ruleType === RULE_TYPES.BUDGET) return 'budget'
  if (ruleType === RULE_TYPES.SOURCE) return 'source'
  return 'industry'
}

function conditionPlaceholder(ruleType) {
  if (ruleType === RULE_TYPES.INDUSTRY) return 'e.g. Real Estate, Clinic, EdTech'
  if (ruleType === RULE_TYPES.BUDGET) return 'e.g. >100000 or >=50000'
  if (ruleType === RULE_TYPES.SOURCE) return 'e.g. referral, website, ads'
  return ''
}

export default function AssignmentRules() {
  const { organization } = useAuth()
  const orgId = organization?.id

  const [rules, setRules] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    setError(null)

    const [{ rules: list, error: rulesErr }, { data: profs }] = await Promise.all([
      fetchAssignmentRules(orgId),
      supabase
        .from('profiles')
        .select('full_name')
        .eq('organization_id', orgId)
        .order('full_name', { ascending: true }),
    ])

    setLoading(false)
    if (rulesErr) {
      setError(rulesErr.message)
      return
    }
    setRules(list)
    setTeamMembers([...new Set((profs ?? []).map((p) => p.full_name).filter(Boolean))])
  }, [orgId])

  useEffect(() => {
    void load()
  }, [load])

  function startEdit(rule) {
    setEditingId(rule.id)
    setForm({
      rule_type: rule.rule_type,
      condition_value: rule.condition_value,
      assigned_user: rule.assigned_user,
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!orgId) return
    setSaving(true)
    setError(null)

    const payload = {
      rule_type: form.rule_type,
      condition_field: defaultConditionField(form.rule_type),
      condition_value: form.condition_value.trim(),
      assigned_user: form.assigned_user.trim(),
    }

    if (!payload.condition_value || !payload.assigned_user) {
      setError('Condition and assignee are required.')
      setSaving(false)
      return
    }

    const { error: saveErr } = editingId
      ? await updateAssignmentRule(editingId, orgId, payload)
      : await createAssignmentRule(orgId, payload)

    setSaving(false)
    if (saveErr) {
      setError(saveErr.message)
      return
    }

    cancelEdit()
    void load()
  }

  async function handleDelete(ruleId) {
    if (!orgId || !window.confirm('Delete this assignment rule?')) return
    const { error: delErr } = await deleteAssignmentRule(ruleId, orgId)
    if (delErr) {
      setError(delErr.message)
      return
    }
    if (editingId === ruleId) cancelEdit()
    void load()
  }

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1>Assignment rules</h1>
        <p className="page-subtitle">
          Route leads by industry, budget, or source. First matching rule wins; otherwise round-robin applies.
        </p>
      </header>

      {error ? <div className="banner banner-error">{error}</div> : null}

      <form className="card form-card assignment-rule-form" onSubmit={handleSubmit}>
        <h2 className="analytics-section-title">{editingId ? 'Edit rule' : 'Add rule'}</h2>

        <label className="field">
          <span>Rule type</span>
          <select
            value={form.rule_type}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, rule_type: e.target.value, condition_value: '' }))
            }
          >
            {Object.entries(RULE_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Condition</span>
          <input
            required
            value={form.condition_value}
            onChange={(e) => setForm((prev) => ({ ...prev, condition_value: e.target.value }))}
            placeholder={conditionPlaceholder(form.rule_type)}
          />
        </label>

        <label className="field">
          <span>Assign to</span>
          <select
            required
            value={form.assigned_user}
            onChange={(e) => setForm((prev) => ({ ...prev, assigned_user: e.target.value }))}
          >
            <option value="">Select team member</option>
            {teamMembers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          {editingId ? (
            <button type="button" className="btn btn-secondary" onClick={cancelEdit}>
              Cancel
            </button>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Update rule' : 'Add rule'}
          </button>
        </div>
      </form>

      <section className="card csv-section">
        <h2 className="analytics-section-title">Active rules</h2>
        {loading ? (
          <p className="muted">Loading rules…</p>
        ) : rules.length === 0 ? (
          <p className="muted">No rules yet. Add one above — leads will use round-robin until a rule matches.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Condition</th>
                  <th>Assign to</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{RULE_TYPE_LABELS[rule.rule_type] ?? rule.rule_type}</td>
                    <td>
                      <code>{rule.condition_value}</code>
                    </td>
                    <td>{rule.assigned_user}</td>
                    <td className="lead-actions-cell">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => startEdit(rule)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => void handleDelete(rule.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card csv-section">
        <h2 className="analytics-section-title">How rules work</h2>
        <ul className="assignment-rules-help muted">
          <li>
            <strong>Industry:</strong> matches industry name (e.g. Real Estate → User A)
          </li>
          <li>
            <strong>Budget:</strong> use operators like <code>&gt;100000</code> or <code>&gt;=50000</code>
          </li>
          <li>
            <strong>Source:</strong> exact match on lead source (e.g. referral → Admin)
          </li>
          <li>Rules are evaluated top-to-bottom; first match assigns the lead.</li>
          <li>If no rule matches, the system uses round-robin across your team.</li>
        </ul>
      </section>
    </div>
  )
}
