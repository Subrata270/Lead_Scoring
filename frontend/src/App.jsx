import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AddLead from './components/AddLead.jsx'
import Dashboard from './components/Dashboard.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import PublicLeadForm from './components/PublicLeadForm.jsx'
import AppNav from './components/AppNav.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import { useAuth } from './hooks/useAuth.js'
import { useUnreadNotificationCount } from './hooks/useNotifications.js'
import './App.css'

const Analytics = lazy(() => import('./pages/Analytics.jsx'))
const FollowUps = lazy(() => import('./pages/FollowUps.jsx'))
const ScoringConfig = lazy(() => import('./pages/ScoringConfig.jsx'))
const Team = lazy(() => import('./pages/Team.jsx'))
const Notifications = lazy(() => import('./pages/Notifications.jsx'))
const ImportLeads = lazy(() => import('./pages/ImportLeads.jsx'))
const AssignmentRules = lazy(() => import('./pages/AssignmentRules.jsx'))
const QA = lazy(() => import('./pages/QA.jsx'))

function NotificationsPage() {
  const { organization, user } = useAuth()
  const { refresh: refreshUnread } = useUnreadNotificationCount(organization?.id, user?.id)

  return (
    <Suspense
      fallback={
        <div className="page page-wide">
          <p className="muted">Loading notifications…</p>
        </div>
      }
    >
      <Notifications onRead={refreshUnread} />
    </Suspense>
  )
}

function Layout() {
  return (
    <div className="app-shell">
      <AppNav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route
            path="/analytics"
            element={
              <Suspense
                fallback={
                  <div className="page page-wide">
                    <p className="muted">Loading analytics…</p>
                  </div>
                }
              >
                <Analytics />
              </Suspense>
            }
          />
          <Route
            path="/follow-ups"
            element={
              <Suspense
                fallback={
                  <div className="page page-wide">
                    <p className="muted">Loading follow-ups…</p>
                  </div>
                }
              >
                <FollowUps />
              </Suspense>
            }
          />
          <Route path="/add-lead" element={<AddLead />} />
          <Route
            path="/import-leads"
            element={
              <Suspense
                fallback={
                  <div className="page page-wide">
                    <p className="muted">Loading import…</p>
                  </div>
                }
              >
                <ImportLeads />
              </Suspense>
            }
          />
          <Route
            path="/assignment-rules"
            element={
              <Suspense
                fallback={
                  <div className="page page-wide">
                    <p className="muted">Loading assignment rules…</p>
                  </div>
                }
              >
                <AssignmentRules />
              </Suspense>
            }
          />
          <Route
            path="/team"
            element={
              <Suspense
                fallback={
                  <div className="page page-wide">
                    <p className="muted">Loading team…</p>
                  </div>
                }
              >
                <Team />
              </Suspense>
            }
          />
          <Route
            path="/config"
            element={
              <Suspense
                fallback={
                  <div className="page page-wide">
                    <p className="muted">Loading scoring config…</p>
                  </div>
                }
              >
                <ScoringConfig />
              </Suspense>
            }
          />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/qa"
            element={
              <Suspense
                fallback={
                  <div className="page page-wide">
                    <p className="muted">Loading QA checklist…</p>
                  </div>
                }
              >
                <QA />
              </Suspense>
            }
          />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/public-form" element={<PublicLeadForm />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/*" element={<Layout />} />
      </Route>
    </Routes>
  )
}
