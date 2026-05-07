import { useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth.js'

export default function Login() {
  const { user, profile, organization, loading, profileLoading } = useAuth()
  const location = useLocation()
  const from = location.state?.from || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  if (!loading && !profileLoading && user && profile?.organization_id && organization?.id) {
    return <Navigate to={from === '/login' ? '/dashboard' : from} replace />
  }

  if (!loading && user && profileLoading) {
    return (
      <div className="auth-boot-screen" role="status">
        <div className="auth-spinner" />
        <p className="muted">Loading profile…</p>
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
