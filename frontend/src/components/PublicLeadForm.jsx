import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useIndustries } from '../hooks/useIndustries.js'
import { useBusinessTypes } from '../hooks/useBusinessTypes.js'

const initial = {
  name: '',
  phone: '',
  email: '',
  industry_id: '',
  business_type_id: '',
  budget: '',
  urgency: 'medium',
}

function publicLeadApiUrl() {
  const base = import.meta.env.VITE_PUBLIC_LEAD_API_URL
  if (base && String(base).trim()) {
    return String(base).replace(/\/$/, '') + '/api/public-lead'
  }
  return '/api/public-lead'
}

export default function PublicLeadForm() {
  const [searchParams] = useSearchParams()
  const organizationIdFromUrl = (searchParams.get('org') || '').trim() || null

  const [form, setForm] = useState(initial)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const { industries, loading: industriesLoading, error: industriesError } = useIndustries()
  const { businessTypes, loading: businessTypesLoading, error: businessTypesError } =
    useBusinessTypes(form.industry_id || null)

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function setIndustryId(value) {
    setForm((prev) => ({ ...prev, industry_id: value, business_type_id: '' }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)

    const name = form.name.trim()
    const phone = form.phone.trim()
    if (!name || !phone) {
      setError('Please enter your name and phone number.')
      setSubmitting(false)
      return
    }
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

    const payload = {
      name,
      phone,
      email: form.email.trim(),
      industry_id: form.industry_id,
      business_type_id: form.business_type_id,
      budget: budgetNum,
      urgency: form.urgency,
      source: 'public_form',
      ...(organizationIdFromUrl ? { organization_id: organizationIdFromUrl } : {}),
    }

    try {
      const res = await fetch(publicLeadApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const text = await res.text()
      let data = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        setError('Unexpected response from server.')
        setSubmitting(false)
        return
      }

      if (!res.ok) {
        const msg =
          data?.error ||
          (Array.isArray(data?.details) ? data.details.join('. ') : null) ||
          `Request failed (${res.status})`
        setError(msg)
        setSubmitting(false)
        return
      }

      setSuccess({
        name: data?.lead?.name ?? name,
        category: data?.category,
        score: data?.score,
        assigned_to: data?.assigned_to,
      })
      setForm(initial)
    } catch (err) {
      setError(err?.message ?? 'Network error. Try again later.')
    }

    setSubmitting(false)
  }

  const catalogError = industriesError || businessTypesError
  const businessTypeDisabled =
    !form.industry_id || industriesLoading || businessTypesLoading

  return (
    <div className="public-form-shell">
      <div className="public-form-inner">
        <header className="public-form-header">
          <h1>Request information</h1>
          <p className="public-form-sub">
            Tell us about your needs. Our team will follow up based on your score and urgency.
          </p>
        </header>

        {success ? (
          <div className="card public-form-success" role="status">
            <h2 className="public-form-success-title">Thank you, {success.name}.</h2>
            <p>Your request was received successfully.</p>
            {success.score != null ? (
              <p className="muted">
                Priority score: <strong>{success.score}</strong>
                {success.category ? (
                  <>
                    {' '}
                    · <span className={`pill pill-${success.category}`}>{success.category}</span>
                  </>
                ) : null}
              </p>
            ) : null}
            {success.assigned_to ? (
              <p className="muted">A specialist ({success.assigned_to}) will be in touch.</p>
            ) : null}
            <p className="public-form-success-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setSuccess(null)}>
                Submit another
              </button>
            </p>
          </div>
        ) : (
          <form className="card form-card public-form-card" onSubmit={handleSubmit}>
            {error ? <div className="banner banner-error">{error}</div> : null}
            {catalogError ? <div className="banner banner-error">{catalogError}</div> : null}

            <label className="field">
              <span>
                Name <span className="req">*</span>
              </span>
              <input
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={(e) => updateField('name', e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </label>

            <label className="field">
              <span>
                Phone <span className="req">*</span>
              </span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                placeholder="+1 …"
                required
              />
            </label>

            <label className="field">
              <span>Email</span>
              <input
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="you@company.com"
              />
            </label>

            <label className="field">
              <span>
                Industry <span className="req">*</span>
              </span>
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
              <span>
                Business type <span className="req">*</span>
              </span>
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

            <label className="field">
              <span>Budget</span>
              <input
                type="number"
                min={0}
                step={1000}
                value={form.budget}
                onChange={(e) => updateField('budget', e.target.value)}
                placeholder="0"
              />
            </label>

            <label className="field">
              <span>Urgency</span>
              <select value={form.urgency} onChange={(e) => updateField('urgency', e.target.value)}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <div className="form-actions public-form-actions">
              <button className="btn btn-primary" type="submit" disabled={submitting}>
                {submitting ? 'Sending…' : 'Submit'}
              </button>
            </div>
          </form>
        )}

        {organizationIdFromUrl ? (
          <p className="muted public-form-org-hint">
            Submitting to organization ID <code>{organizationIdFromUrl}</code>
          </p>
        ) : null}

        <p className="public-form-footer muted">
          <Link to="/login">Team login</Link>
        </p>
      </div>
    </div>
  )
}
