import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { TASK_TYPES } from '../constants/crm'

export default function TaskModal({ lead, onClose, onCreated }) {
  const [taskType, setTaskType] = useState('call')
  const [dueDate, setDueDate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!dueDate) {
      setError('Pick a due date.')
      return
    }

    const dueIso = new Date(dueDate).toISOString()
    setSaving(true)

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({
        lead_id: lead.id,
        task_type: taskType,
        due_date: dueIso,
        status: 'pending',
      })
      .select()
      .single()

    setSaving(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    onCreated(data)
    onClose()
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="modal" role="dialog" aria-labelledby="task-modal-title">
        <div className="modal-header">
          <h2 id="task-modal-title">Add follow-up task</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="modal-lead-name">{lead.name}</p>

        <form className="modal-form" onSubmit={handleSubmit}>
          {error ? <div className="banner banner-error">{error}</div> : null}

          <label className="field">
            <span>Type</span>
            <select value={taskType} onChange={(e) => setTaskType(e.target.value)}>
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Due date</span>
            <input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              required
            />
          </label>

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
