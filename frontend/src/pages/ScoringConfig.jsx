import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useIndustries } from '../hooks/useIndustries.js'
import { useBusinessTypes } from '../hooks/useBusinessTypes.js'
import { useScoringConfig } from '../hooks/useScoringConfig.js'
import { SCORING_DEFAULT_BUDGETS } from '../utils/leadScoring.js'

export default function ScoringConfig() {
  const [industryId, setIndustryId] = useState('')
  const [businessTypeId, setBusinessTypeId] = useState('')
  const [highBudget, setHighBudget] = useState('')
  const [mediumBudget, setMediumBudget] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [saveOk, setSaveOk] = useState(false)

  const { industries, loading: industriesLoading, error: industriesError } = useIndustries()
  const { businessTypes, loading: businessTypesLoading, error: businessTypesError } =
    useBusinessTypes(industryId || null)
  const {
    config,
    loading: configLoading,
    error: configError,
    usingDefault,
    reload,
  } = useScoringConfig(industryId || null, businessTypeId || null)

  useEffect(() => {
    setSaveOk(false)
  }, [industryId, businessTypeId])

  useEffect(() => {
    if (!industryId || !businessTypeId || configLoading || configError) return
    if (config) {
      setHighBudget(String(config.high_budget))
      setMediumBudget(String(config.medium_budget))
    } else {
      setHighBudget(String(SCORING_DEFAULT_BUDGETS.highBudget))
      setMediumBudget(String(SCORING_DEFAULT_BUDGETS.mediumBudget))
    }
  }, [industryId, businessTypeId, config, configLoading, configError])

  async function handleSave(e) {
    e.preventDefault()
    setSaveError(null)
    setSaveOk(false)
    if (!industryId || !businessTypeId) {
      setSaveError('Select an industry and business type.')
      return
    }
    const high = Number(highBudget)
    const medium = Number(mediumBudget)
    if (!Number.isFinite(high) || !Number.isFinite(medium) || high < 0 || medium < 0) {
      setSaveError('Enter valid non-negative numbers for budgets.')
      return
    }
    if (medium > high) {
      setSaveError('Medium budget must be less than or equal to high budget.')
      return
    }

    setSaving(true)
    const { error } = await supabase.from('scoring_configs').upsert(
      {
        industry_id: industryId,
        business_type_id: businessTypeId,
        high_budget: high,
        medium_budget: medium,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'industry_id,business_type_id' },
    )
    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setSaveOk(true)
    await reload()
  }

  const catalogError = industriesError || businessTypesError
  const businessTypeDisabled = !industryId || industriesLoading || businessTypesLoading

  return (
    <div className="page">
      <header className="page-header page-header-row">
        <div>
          <h1>Scoring config</h1>
          <p className="page-subtitle">
            Set high and medium budget thresholds per industry and business type. Leads without a
            row use defaults ({SCORING_DEFAULT_BUDGETS.highBudget} / {SCORING_DEFAULT_BUDGETS.mediumBudget}).
          </p>
        </div>
        <Link className="btn btn-secondary" to="/dashboard">
          Back to dashboard
        </Link>
      </header>

      <form className="card form-card" onSubmit={handleSave}>
        {catalogError ? <div className="banner banner-error">{catalogError}</div> : null}
        {configError ? <div className="banner banner-error">{configError}</div> : null}
        {saveError ? <div className="banner banner-error">{saveError}</div> : null}
        {saveOk ? <div className="banner banner-success">Config saved.</div> : null}

        {industryId && businessTypeId && usingDefault && !configLoading ? (
          <div className="banner" role="status">
            Using default scoring
          </div>
        ) : null}

        <label className="field">
          <span>Industry</span>
          <select
            value={industryId}
            onChange={(e) => {
              setIndustryId(e.target.value)
              setBusinessTypeId('')
            }}
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
            value={businessTypeId}
            onChange={(e) => setBusinessTypeId(e.target.value)}
            disabled={businessTypeDisabled}
          >
            <option value="">
              {!industryId
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
          <span>High budget</span>
          <input
            type="number"
            min={0}
            step={1000}
            required
            value={highBudget}
            onChange={(e) => setHighBudget(e.target.value)}
            disabled={!industryId || !businessTypeId || configLoading}
            placeholder="50000"
          />
          <span className="muted subtle">Score +25 when budget ≥ this value.</span>
        </label>

        <label className="field">
          <span>Medium budget</span>
          <input
            type="number"
            min={0}
            step={1000}
            required
            value={mediumBudget}
            onChange={(e) => setMediumBudget(e.target.value)}
            disabled={!industryId || !businessTypeId || configLoading}
            placeholder="20000"
          />
          <span className="muted subtle">Score +15 when budget ≥ this (and below high).</span>
        </label>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            type="submit"
            disabled={
              saving ||
              !industryId ||
              !businessTypeId ||
              configLoading ||
              industriesLoading
            }
          >
            {saving ? 'Saving…' : 'Save config'}
          </button>
        </div>
      </form>
    </div>
  )
}
