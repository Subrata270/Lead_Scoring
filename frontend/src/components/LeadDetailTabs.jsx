import { useEffect, useState } from 'react'
import { formatTimeToFirstAction } from '../utils/leadHot'
import { getSuggestionsForLead } from '../utils/aiSuggestions.js'
import { countOverduePendingTasks, isTaskOverdue } from '../utils/taskHelpers'
import LeadTimeline from './LeadTimeline.jsx'
import ScoreBreakdown from './ScoreBreakdown.jsx'
import ScoreHistory from './ScoreHistory.jsx'
import AILeadCopilotPanel from './AILeadCopilotPanel.jsx'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'copilot', label: 'AI Copilot' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'history', label: 'History' },
]

function suggestionToneClass(tone) {
  return `suggestion-chip suggestion-chip--${tone}`
}

export default function LeadDetailTabs({
  lead,
  tasks,
  organizationId,
  scoringRow,
  onMarkTaskDone,
  onAddTask,
  initialTab = 'overview',
}) {
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    setActiveTab(initialTab)
  }, [initialTab, lead.id])

  const suggestions = getSuggestionsForLead(lead, tasks)
  const ttf = formatTimeToFirstAction(lead.created_at, lead.first_status_changed_at)
  const overdueCount = countOverduePendingTasks(tasks)

  return (
    <div className="lead-detail-tabs">
      <div className="lead-detail-tablist" role="tablist" aria-label="Lead details">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`lead-detail-tab${activeTab === tab.id ? ' lead-detail-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.id === 'tasks' && tasks.length > 0 ? (
              <span className="lead-detail-tab-count">{tasks.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="lead-detail-tabpanel" role="tabpanel">
        {activeTab === 'overview' ? (
          <div className="lead-detail-overview">
            <div className="lead-detail-grid lead-detail-grid--compact">
              <ScoreBreakdown
                lead={lead}
                highBudget={scoringRow?.high_budget}
                mediumBudget={scoringRow?.medium_budget}
              />
              <div className="lead-overview-meta card-compact">
                <h4 className="copilot-card-title">Quick facts</h4>
                <dl className="lead-overview-facts">
                  <div>
                    <dt>Industry</dt>
                    <dd>{lead.industries?.name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Business type</dt>
                    <dd>{lead.business_types?.name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{lead.source ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Assigned</dt>
                    <dd>{lead.assigned_to || 'Unassigned'}</dd>
                  </div>
                  {ttf ? (
                    <div>
                      <dt>First response</dt>
                      <dd>{ttf}</dd>
                    </div>
                  ) : null}
                  {overdueCount > 0 ? (
                    <div>
                      <dt>Follow-up</dt>
                      <dd>
                        <span className="badge badge-overdue">{overdueCount} overdue</span>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            </div>
            {suggestions.length > 0 ? (
              <div className="lead-overview-suggestions">
                <h4 className="copilot-card-title">Suggestions</h4>
                <div className="suggestion-row-inner" role="list">
                  {suggestions.map((s) => (
                    <span key={s.id} className={suggestionToneClass(s.tone)} role="listitem">
                      {s.text}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {activeTab === 'timeline' ? (
          <LeadTimeline leadId={lead.id} organizationId={organizationId} />
        ) : null}

        {activeTab === 'copilot' ? (
          <AILeadCopilotPanel
            lead={lead}
            tasks={tasks}
            organizationId={organizationId}
            embedded
          />
        ) : null}

        {activeTab === 'tasks' ? (
          <div className="lead-detail-tasks">
            <div className="lead-detail-tasks-head">
              <h4 className="copilot-card-title">Tasks for {lead.name}</h4>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onAddTask(lead)}>
                + Add task
              </button>
            </div>
            {tasks.length === 0 ? (
              <p className="muted">No tasks yet.</p>
            ) : (
              <table className="nested-table nested-table--compact">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id}>
                      <td>{t.task_type}</td>
                      <td>
                        {new Date(t.due_date).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        {isTaskOverdue(t.due_date, t.status) ? (
                          <span className="badge badge-overdue nested-overdue">overdue</span>
                        ) : null}
                      </td>
                      <td>{t.status}</td>
                      <td>
                        {t.status === 'pending' ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => onMarkTaskDone(t.id)}
                          >
                            Done
                          </button>
                        ) : (
                          <span className="muted subtle">Done</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {activeTab === 'history' ? (
          <ScoreHistory leadId={lead.id} organizationId={organizationId} />
        ) : null}
      </div>
    </div>
  )
}
