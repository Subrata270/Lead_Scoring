import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'

export default function ProtectedRoute() {
  const { user, profile, organization, loading, profileLoading, profileError, signOut } = useAuth()
  const location = useLocation()

  if (loading || profileLoading) {
    return (
      <div className="auth-boot-screen" role="status" aria-live="polite">
        <div className="auth-spinner" />
        <p className="muted">Loading your workspace…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (profileError === 'missing_profile' || !profile?.organization_id || !organization?.id) {
    return (
      <div className="page auth-page">
        <div className="auth-card card">
          <h1 className="auth-card-title">Account setup incomplete</h1>
          <p className="muted">
            We couldn&apos;t load your profile or organization. This usually means your account exists but isn&apos;t
            linked to an organization yet. Try signing out and signing up again, or contact your administrator.
          </p>
          {profileError ? (
            <div className="banner banner-error">{profileError}</div>
          ) : null}
          <div className="auth-inline-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void signOut()}>
              Sign out
            </button>
            <button type="button" className="btn btn-primary" onClick={() => window.location.assign('/login')}>
              Login screen
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}
