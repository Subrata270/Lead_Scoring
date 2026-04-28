import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { calculateLeadScore, SCORING_DEFAULT_BUDGETS } from '../utils/leadScoring'
import { useIndustries } from '../hooks/useIndustries.js'
import { useBusinessTypes } from '../hooks/useBusinessTypes.js'
import { useScoringConfig, fetchScoringConfigRow } from '../hooks/useScoringConfig.js'

const initialForm = {
  name: '',
  phone: '',
  email: '',
  source: 'website',
  budget: '',
  urgency: 'medium',
  responded: false,
  industry_id: '',
  business_type_id: '',
}

export default function AddLead() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const { industries, loading: industriesLoading, error: industriesError } = useIndustries()
  const { businessTypes, loading: businessTypesLoading, error: businessTypesError } =
    useBusinessTypes(form.industry_id || null)
  const {
    config: scoringRow,
    loading: scoringLoading,
    error: scoringError,
    usingDefault,
  } = useScoringConfig(form.industry_id || null, form.business_type_id || null)

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function setIndustryId(value) {
    setForm((prev) => ({ ...prev, industry_id: value, business_type_id: '' }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    if (!form.industry_id || !form.business_type_id) {
      setError('Please select an industry and business type.')
      setSubmitting(false)
      return
    }

    const budgetNum = form.budget === '' ? 0 : Number(form.budget)
    if (Number.isNaN(budgetNum) || budgetNum < 0) {
      setError('Please enter a valid budget (0 or greater).')
      setSubmitting(false)
      return
    }

    const { row: configRow, error: configErr } = await fetchScoringConfigRow(
      form.industry_id,
      form.business_type_id,
    )
    if (configErr) {
      setError(configErr.message)
      setSubmitting(false)
      return
    }

    const highBudget = configRow?.high_budget ?? SCORING_DEFAULT_BUDGETS.highBudget
    const mediumBudget = configRow?.medium_budget ?? SCORING_DEFAULT_BUDGETS.mediumBudget

    const { score, category } = calculateLeadScore({
      source: form.source,
      responded: form.responded,
      budget: budgetNum,
      urgency: form.urgency,
      highBudget,
      mediumBudget,
    })

    const row = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      source: form.source,
      budget: budgetNum,
      urgency: form.urgency,
      responded: form.responded,
      industry_id: form.industry_id,
      business_type_id: form.business_type_id,
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

  const catalogError = industriesError || businessTypesError
  const businessTypeDisabled =
    !form.industry_id || industriesLoading || businessTypesLoading

  return (
    <div className="page">
      <header className="page-header">
        <h1>Add lead</h1>
        <p className="page-subtitle">
          Submit a lead; score and category use industry-specific budget thresholds when configured.
        </p>
      </header>

      <form className="card form-card" onSubmit={handleSubmit}>
        {error ? <div className="banner banner-error">{error}</div> : null}
        {catalogError ? (
          <div className="banner banner-error">{catalogError}</div>
        ) : null}
        {scoringError ? <div className="banner banner-error">{scoringError}</div> : null}

        {form.industry_id && form.business_type_id && usingDefault && !scoringLoading ? (
          <div className="banner" role="status">
            Using default scoring
          </div>
        ) : null}

        <label className="field">
          <span>Industry</span>
          <select
            required
            value={form.industry_id}
            onChange={(e) => setIndustryId(e.target.value)}
            disabled={industriesLoading}
          >
            <option value="">{industriesLoading ? 'Loading…' : 'Select industry'}</option>
            {industries.map((ind) => (
              <option key={ind.id} value={ind.id}>
                {ind.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Business type</span>
          <select
            required
            value={form.business_type_id}
            onChange={(e) => updateField('business_type_id', e.target.value)}
            disabled={businessTypeDisabled}
          >
            <option value="">
              {!form.industry_id
                ? 'Select an industry first'
                : businessTypesLoading
                  ? 'Loading…'
                  : 'Select business type'}
            </option>
            {businessTypes.map((bt) => (
              <option key={bt.id} value={bt.id}>
                {bt.name}
              </option>
            ))}
          </select>
        </label>

        {form.industry_id &&
        form.business_type_id &&
        scoringRow &&
        !scoringLoading ? (
          <p className="muted subtle">
            Active thresholds: high ≥ {Number(scoringRow.high_budget).toLocaleString()}, medium ≥{' '}
            {Number(scoringRow.medium_budget).toLocaleString()}.
          </p>
        ) : null}

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
