import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth.js'

export default function Signup() {
  const { user, profile, organization, loading, profileLoading } = useAuth()

  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [pendingVerify, setPendingVerify] = useState(false)

  if (!loading && !profileLoading && user && profile?.organization_id && organization?.id) {
    return <Navigate to="/dashboard" replace />
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
    setPendingVerify(false)

    const fn = fullName.trim()
    const cn = companyName.trim()
    if (!fn || !cn) {
      setError('Enter your full name and company name.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setSubmitting(true)

    const { data: authData, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fn, company_name: cn },
      },
    })

    if (signUpErr) {
      setSubmitting(false)
      setError(signUpErr.message)
      return
    }

    const sessionUser = authData.user
    if (!sessionUser?.id) {
      setSubmitting(false)
      setPendingVerify(true)
      setError(null)
      return
    }

    const { data: orgRow, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: cn })
      .select('id')
      .single()

    if (orgErr) {
      setSubmitting(false)
      setError(orgErr.message)
      return
    }

    const { error: profErr } = await supabase.from('profiles').insert({
      id: sessionUser.id,
      full_name: fn,
      organization_id: orgRow.id,
      role: 'admin',
    })

    setSubmitting(false)

    if (profErr) {
      setError(profErr.message)
      return
    }

    if (authData.session) {
      window.location.assign('/dashboard')
      return
    }

    setPendingVerify(true)
  }

  return (
    <div className="page auth-page">
      <div className="auth-card card">
        <div className="auth-brand">AI Lead Scoring</div>
        <h1 className="auth-card-title">Create your workspace</h1>
        <p className="auth-card-sub muted">Sign up to create an organization and admin account.</p>

        {pendingVerify ? (
          <div className="banner banner-success" role="status">
            Check your email to confirm your account. After confirming, sign in — your organization may already be
            created; if login fails, contact support.
          </div>
        ) : null}

        <form className="auth-form" onSubmit={handleSubmit}>
          {error ? (
            <div className="banner banner-error" role="alert">
              {error}
            </div>
          ) : null}

          <label className="field">
            <span>Full name</span>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Jane Doe" />
          </label>

          <label className="field">
            <span>Company name</span>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              required
              placeholder="Acme Inc."
            />
          </label>

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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </label>

          <button type="submit" className="btn btn-primary auth-submit" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Sign up'}
          </button>
        </form>

        <p className="auth-footer muted">
          Already have access? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
