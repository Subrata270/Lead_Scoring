import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { calculateLeadScore } from '../utils/leadScoring'

const initialForm = {
  name: '',
  phone: '',
  email: '',
  source: 'website',
  budget: '',
  urgency: 'medium',
  responded: false,
}

export default function AddLead() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const budgetNum = form.budget === '' ? 0 : Number(form.budget)
    if (Number.isNaN(budgetNum) || budgetNum < 0) {
      setError('Please enter a valid budget (0 or greater).')
      setSubmitting(false)
      return
    }

    const { score, category } = calculateLeadScore({
      source: form.source,
      responded: form.responded,
      budget: budgetNum,
      urgency: form.urgency,
    })

    const row = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      source: form.source,
      budget: budgetNum,
      urgency: form.urgency,
      responded: form.responded,
      score,
      category,
      status: 'new',
      assigned_to: '',
    }

    const { error: insertError } = await supabase.from('leads').insert(row)

    setSubmitting(false)

    if (insertError) {
      setError(insertError.message)
      return
    }

    navigate('/dashboard')
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Add lead</h1>
        <p className="page-subtitle">
          Submit a lead; score and category are computed automatically.
        </p>
      </header>

      <form className="card form-card" onSubmit={handleSubmit}>
        {error ? <div className="banner banner-error">{error}</div> : null}

        <label className="field">
          <span>Name</span>
          <input
            required
            value={form.name}
            onChange={(e) => updateField('name', e.target.value)}
            placeholder="Jane Doe"
          />
        </label>

        <label className="field">
          <span>Phone</span>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => updateField('phone', e.target.value)}
            placeholder="+1 …"
          />
        </label>

        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => updateField('email', e.target.value)}
            placeholder="jane@company.com"
          />
        </label>

        <label className="field">
          <span>Source</span>
          <select
            value={form.source}
            onChange={(e) => updateField('source', e.target.value)}
          >
            <option value="website">Website</option>
            <option value="referral">Referral</option>
            <option value="ads">Ads</option>
            <option value="event">Event</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="field">
          <span>Budget</span>
          <input
            type="number"
            min={0}
            step={1000}
            value={form.budget}
            onChange={(e) => updateField('budget', e.target.value)}
            placeholder="50000"
          />
        </label>

        <label className="field">
          <span>Urgency</span>
          <select
            value={form.urgency}
            onChange={(e) => updateField('urgency', e.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>

        <label className="field field-checkbox">
          <input
            type="checkbox"
            checked={form.responded}
            onChange={(e) => updateField('responded', e.target.checked)}
          />
          <span>Responded</span>
        </label>

        <div className="form-actions">
          <Link className="btn btn-secondary" to="/dashboard">
            Cancel
          </Link>
          <button className="btn btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Submit lead'}
          </button>
        </div>
      </form>
    </div>
  )
}
