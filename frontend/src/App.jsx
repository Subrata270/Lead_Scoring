import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import AddLead from './components/AddLead.jsx'
import Dashboard from './components/Dashboard.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import PublicLeadForm from './components/PublicLeadForm.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import { useAuth } from './hooks/useAuth.js'
import './App.css'

const Analytics = lazy(() => import('./pages/Analytics.jsx'))
const FollowUps = lazy(() => import('./pages/FollowUps.jsx'))
const ScoringConfig = lazy(() => import('./pages/ScoringConfig.jsx'))

function Layout() {
  const { profile, organization, signOut } = useAuth()

  const displayName = profile?.full_name?.trim() || 'Team member'
  const orgName = organization?.name || 'Organization'
  const roleLabel = profile?.role ? String(profile.role) : '—'

  return (
    <div className="app-shell">
      <nav className="app-nav">
        <span className="app-brand">AI Lead Scoring</span>
        <div className="app-nav-links">
          <Link to="/dashboard">Dashboard</Link>
          <Link to="/follow-ups">Follow-Ups</Link>
          <Link to="/analytics">Analytics</Link>
          <Link to="/config">Scoring Config</Link>
          <Link to="/add-lead">Add lead</Link>
        </div>
        <div className="app-nav-user">
          <div className="app-nav-org" title={orgName}>
            <span className="app-nav-org-name">{orgName}</span>
            <span className="muted app-nav-role">{roleLabel}</span>
          </div>
          <span className="app-nav-display-name">{displayName}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void signOut()}>
            Log out
          </button>
        </div>
      </nav>
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
