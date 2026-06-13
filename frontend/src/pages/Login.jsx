import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth.js'
import { AUTH_LOAD_TIMEOUT_MS } from '../utils/authLoadTimeout.js'

export default function Login() {
  const {
    user,
    profile,
    organization,
    loading,
    profileLoading,
    profileError,
    loadTimedOut,
    bootstrapComplete,
    refreshProfile,
  } = useAuth()
  const location = useLocation()
  const from = location.state?.from || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [localTimedOut, setLocalTimedOut] = useState(false)

  const hasWorkspace =
    Boolean(profile?.organization_id) && Boolean(organization?.id || profile?.organization_id)
  const isBootLoading = !bootstrapComplete || ((loading || profileLoading) && !loadTimedOut && !localTimedOut)

  useEffect(() => {
    if (bootstrapComplete && !loading && !profileLoading) {
      setLocalTimedOut(false)
      return undefined
    }
    if (!isBootLoading) return undefined
    const timer = window.setTimeout(() => setLocalTimedOut(true), AUTH_LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(timer)
  }, [bootstrapComplete, isBootLoading, loading, profileLoading])

  if (bootstrapComplete && !loading && !profileLoading && user && hasWorkspace) {
    return <Navigate to={from === '/login' ? '/dashboard' : from} replace />
  }

  if (isBootLoading) {
    return (
      <div className="auth-boot-screen" role="status">
        <div className="auth-spinner" />
        <p className="muted">Loading profile…</p>
      </div>
    )
  }

  if (user && (loadTimedOut || localTimedOut || profileError) && !hasWorkspace) {
    return (
      <div className="page auth-page">
        <div className="auth-card card">
          <h1 className="auth-card-title">Could not load workspace</h1>
          {(loadTimedOut || localTimedOut) && (
            <div className="banner banner-error">
              Profile loading timed out after {AUTH_LOAD_TIMEOUT_MS / 1000} seconds.
            </div>
          )}
          {profileError ? <div className="banner banner-error">{profileError}</div> : null}
          <button type="button" className="btn btn-primary" onClick={() => void refreshProfile()}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setToast(null)
    setSubmitting(true)

    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setSubmitting(false)

    if (signErr) {
      setError(signErr.message)
      setToast({ type: 'error', text: signErr.message })
      window.setTimeout(() => setToast(null), 5000)
      return
    }

    setToast({ type: 'success', text: 'Signed in successfully.' })
    window.setTimeout(() => setToast(null), 3000)
  }

  return (
    <div className="page auth-page">
      <div className="auth-card card">
        <div className="auth-brand">AI Lead Scoring</div>
        <h1 className="auth-card-title">Welcome back</h1>
        <p className="auth-card-sub muted">Sign in to your organization workspace.</p>

        {toast?.type === 'success' ? (
          <div className="banner banner-success auth-toast" role="status">
            {toast.text}
          </div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          {error ? (
            <div className="banner banner-error auth-toast" role="alert">
              {error}
            </div>
          ) : null}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@company.com"
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="auth-footer muted">
          No account? <Link to="/signup">Create organization</Link>
        </p>
      </div>
    </div>
  )
}
