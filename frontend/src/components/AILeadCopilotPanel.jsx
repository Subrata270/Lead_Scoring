import { useMemo, useState } from 'react'
import { useLeadCopilotData } from '../hooks/useLeadCopilotData.js'
import {
  computeConversionLikelihood,
  computeLeadHealth,
  generateCallPrep,
  generateLeadSummary,
  getNextBestAction,
  HEALTH_LABELS,
} from '../utils/leadCopilot.js'
import AILeadSummary from './AILeadSummary.jsx'

function healthBadgeClass(tone) {
  return `copilot-health-badge copilot-health-badge--${tone}`
}

function likelihoodClass(level) {
  return `copilot-likelihood copilot-likelihood--${level}`
}

function actionClass(tone) {
  return `copilot-action-card copilot-action-card--${tone}`
}

export default function AILeadCopilotPanel({ lead, tasks, organizationId, embedded = false }) {
  const [open, setOpen] = useState(embedded)
  const { activities, scoreHistory, loading, error } = useLeadCopilotData(
    lead.id,
    organizationId,
    true,
  )

  const summary = useMemo(
    () => generateLeadSummary(lead, activities, scoreHistory),
    [lead, activities, scoreHistory],
  )
  const health = useMemo(() => computeLeadHealth(lead, activities), [lead, activities])
  const likelihood = useMemo(
    () => computeConversionLikelihood(lead, activities),
    [lead, activities],
  )
  const nextAction = useMemo(() => getNextBestAction(lead, tasks), [lead, tasks])
  const callPrep = useMemo(
    () => generateCallPrep(lead, activities, scoreHistory),
    [lead, activities, scoreHistory],
  )

  return (
    <div className={`copilot-panel${embedded ? ' copilot-panel--embedded' : ''}`}>
      {!embedded ? (
        <button
          type="button"
          className="copilot-panel-toggle"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          <span className="copilot-panel-toggle-icon" aria-hidden>
            {open ? '▼' : '▶'}
          </span>
          <span className="copilot-panel-toggle-title">AI Lead Copilot</span>
          <span className={healthBadgeClass(health.tone)}>{health.label}</span>
        </button>
      ) : null}

      {embedded || open ? (
        <div className="copilot-panel-body">
          {loading ? <p className="muted subtle">Loading insights…</p> : null}
          {error ? <p className="muted subtle">Some copilot data unavailable: {error}</p> : null}

          <div className="copilot-grid">
            <AILeadSummary summary={summary} />

            <div className="copilot-card">
              <h4 className="copilot-card-title">Lead health</h4>
              <div className="copilot-health-row">
                <span className={healthBadgeClass(health.tone)}>{HEALTH_LABELS[health.status] ?? health.label}</span>
                <p className="copilot-health-reason muted">{health.reason}</p>
              </div>
              <div className="copilot-health-legend">
                <span className={healthBadgeClass('healthy')}>Healthy</span>
                <span className={healthBadgeClass('at_risk')}>At Risk</span>
                <span className={healthBadgeClass('stale')}>Stale</span>
                <span className={healthBadgeClass('critical')}>Critical</span>
              </div>
            </div>

            <div className="copilot-card">
              <h4 className="copilot-card-title">Conversion likelihood</h4>
              <div className="copilot-likelihood-row">
                <span className={likelihoodClass(likelihood.level)}>{likelihood.label}</span>
                <div className="copilot-confidence">
                  <div className="copilot-confidence-bar">
                    <div
                      className={`copilot-confidence-fill copilot-confidence-fill--${likelihood.level}`}
                      style={{ width: `${likelihood.confidence}%` }}
                    />
                  </div>
                  <span className="copilot-confidence-pct">{likelihood.confidence}% confidence</span>
                </div>
              </div>
              <ul className="copilot-factor-list">
                {likelihood.factors.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>

            <div className={`copilot-card ${actionClass(nextAction.tone)}`}>
              <h4 className="copilot-card-title">Next best action</h4>
              <div className="copilot-action-head">
                <span className="copilot-action-icon" aria-hidden>
                  {nextAction.icon}
                </span>
                <strong>{nextAction.title}</strong>
              </div>
              <p className="copilot-action-desc">{nextAction.description}</p>
            </div>

            <div className="copilot-card copilot-call-prep">
              <h4 className="copilot-card-title">Prepare for call</h4>
              <p className="muted subtle copilot-urgency-line">{callPrep.urgencyReminder}</p>
              <h5 className="copilot-subtitle">Key talking points</h5>
              <ul className="copilot-bullet-list">
                {callPrep.talkingPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
              <h5 className="copilot-subtitle">Previous activity</h5>
              <pre className="copilot-activity-pre">{callPrep.activitySummary}</pre>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
