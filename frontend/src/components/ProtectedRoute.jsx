import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { AUTH_LOAD_TIMEOUT_MS } from '../utils/authLoadTimeout.js'

function WorkspaceErrorCard({
  title,
  message,
  profileError,
  loadTimedOut,
  onSignOut,
  onRetry,
}) {
  return (
    <div className="page auth-page">
      <div className="auth-card card">
        <h1 className="auth-card-title">{title}</h1>
        <p className="muted">{message}</p>
        {loadTimedOut ? (
          <div className="banner banner-error" role="alert">
            Workspace loading timed out after {AUTH_LOAD_TIMEOUT_MS / 1000} seconds.
          </div>
        ) : null}
        {profileError ? (
          <div className="banner banner-error" role="alert">
            {profileError}
          </div>
        ) : null}
        <div className="auth-inline-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void onSignOut()}>
            Sign out
          </button>
          <button type="button" className="btn btn-primary" onClick={() => void onRetry()}>
            Retry
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ProtectedRoute() {
  const {
    user,
    profile,
    organization,
    loading,
    profileLoading,
    profileError,
    loadTimedOut,
    bootstrapComplete,
    signOut,
    refreshProfile,
  } = useAuth()
  const location = useLocation()
  const [localTimedOut, setLocalTimedOut] = useState(false)

  useEffect(() => {
    console.log('[ProtectedRoute] render state', {
      loading,
      profileLoading,
      bootstrapComplete,
      hasUser: Boolean(user?.id),
      hasProfile: Boolean(profile?.id),
      hasOrganization: Boolean(organization?.id),
      profileError,
      loadTimedOut,
      path: location.pathname,
    })
  }, [loading, profileLoading, bootstrapComplete, user, profile, organization, profileError, loadTimedOut, location.pathname])

  useEffect(() => {
    if (bootstrapComplete && !loading && !profileLoading) {
      setLocalTimedOut(false)
      return undefined
    }

    if (!bootstrapComplete && !loading && !profileLoading) {
      return undefined
    }

    const timer = window.setTimeout(() => {
      console.error('[ProtectedRoute] loading timed out', {
        loading,
        profileLoading,
        bootstrapComplete,
        profileError,
      })
      setLocalTimedOut(true)
    }, AUTH_LOAD_TIMEOUT_MS)

    return () => window.clearTimeout(timer)
  }, [bootstrapComplete, loading, profileLoading, profileError])

  const timedOut = loadTimedOut || localTimedOut
  const isLoading = !bootstrapComplete || ((loading || profileLoading) && !timedOut)

  if (isLoading) {
    return (
      <div className="auth-boot-screen" role="status" aria-live="polite">
        <div className="auth-spinner" />
        <p className="muted">Loading your workspace…</p>
      </div>
    )
  }

  if (timedOut && (!bootstrapComplete || loading || profileLoading)) {
    return (
      <WorkspaceErrorCard
        title="Workspace loading timed out"
        message="Profile or organization loading took too long. The error below may explain why."
        profileError={profileError}
        loadTimedOut
        onSignOut={signOut}
        onRetry={() => {
          setLocalTimedOut(false)
          void refreshProfile()
        }}
      />
    )
  }

  if (!user) {
    console.log('[ProtectedRoute] no user, redirecting to login')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const hasOrgContext = Boolean(profile?.organization_id && (organization?.id || profile.organization_id))

  if (profileError || !profile?.id || !hasOrgContext) {
    const displayError =
      profileError ||
      (!profile?.id
        ? 'missing_profile'
        : !profile?.organization_id
          ? 'Profile exists but is not linked to an organization.'
          : 'Organization record could not be loaded.')

    console.warn('[ProtectedRoute] workspace incomplete', {
      profileError: displayError,
      hasProfile: Boolean(profile?.id),
      organizationId: profile?.organization_id ?? null,
      organizationLoaded: Boolean(organization?.id),
    })

    return (
      <WorkspaceErrorCard
        title="Account setup incomplete"
        message="We couldn't load your profile or organization. Try again, sign out, or contact your administrator."
        profileError={displayError}
        loadTimedOut={timedOut}
        onSignOut={signOut}
        onRetry={() => void refreshProfile()}
      />
    )
  }

  console.log('[ProtectedRoute] workspace ready, rendering app')
  return <Outlet />
}
