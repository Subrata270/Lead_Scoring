import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth.js'
import { normalizeRole } from '../utils/access.js'

export default function Signup() {
  const { user, profile, organization, loading, profileLoading } = useAuth()
  const [searchParams] = useSearchParams()
  const inviteId = (searchParams.get('invite') || '').trim()
  const inviteMode = Boolean(inviteId)

  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('')
  const [inviteOrganizationId, setInviteOrganizationId] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [pendingVerify, setPendingVerify] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadInvite() {
      if (!inviteMode) {
        setInviteError(null)
        setInviteRole('')
        setInviteOrganizationId('')
        return
      }
      setInviteLoading(true)
      setInviteError(null)
      const { data, error: invErr } = await supabase
        .from('invitations')
        .select('id,email,role,organization_id,status')
        .eq('id', inviteId)
        .maybeSingle()
      if (cancelled) return
      setInviteLoading(false)
      if (invErr) {
        setInviteError(invErr.message)
        return
      }
      if (!data) {
        setInviteError('Invalid invite link.')
        return
      }
      if (normalizeRole(data.status) !== 'pending') {
        setInviteError('This invitation has already been used or is no longer active.')
        return
      }
      setEmail(String(data.email || '').trim())
      setInviteRole(String(data.role || 'salesperson').trim() || 'salesperson')
      setInviteOrganizationId(String(data.organization_id || '').trim())
    }

    void loadInvite()
    return () => {
      cancelled = true
    }
  }, [inviteId, inviteMode])

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
    if (!fn) {
      setError('Enter your full name.')
      return
    }
    if (!inviteMode && !cn) {
      setError('Enter your company name.')
      return
    }
    if (inviteMode && inviteError) {
      setError(inviteError)
      return
    }
    if (inviteMode && (!inviteOrganizationId || !inviteRole || !email.trim())) {
      setError('Invitation is incomplete or invalid.')
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
        data: {
          full_name: fn,
          ...(inviteMode ? { invite_id: inviteId } : { company_name: cn }),
        },
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

    let profileInsertError

    if (inviteMode) {
      const { error: profErr } = await supabase.from('profiles').insert({
        id: sessionUser.id,
        full_name: fn,
        organization_id: inviteOrganizationId,
        role: inviteRole,
      })
      profileInsertError = profErr

      if (!profErr) {
        const { error: invUpErr } = await supabase
          .from('invitations')
          .update({ status: 'accepted' })
          .eq('id', inviteId)
          .eq('status', 'pending')
        if (invUpErr) profileInsertError = invUpErr
      }
    } else {
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
      profileInsertError = profErr
    }

    setSubmitting(false)

    if (profileInsertError) {
      setError(profileInsertError.message)
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
        <h1 className="auth-card-title">{inviteMode ? 'Join your team' : 'Create your workspace'}</h1>
        <p className="auth-card-sub muted">
          {inviteMode
            ? 'Complete signup to join the invited organization.'
            : 'Sign up to create an organization and admin account.'}
        </p>

        {inviteLoading ? <p className="muted">Validating invitation…</p> : null}
        {inviteError ? (
          <div className="banner banner-error" role="alert">
            {inviteError}
          </div>
        ) : null}

        {pendingVerify ? (
          <div className="banner banner-success" role="status">
            Check your email to confirm your account. After confirming, sign in to continue.
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

          {!inviteMode ? (
            <label className="field">
              <span>Company name</span>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                placeholder="Acme Inc."
              />
            </label>
          ) : null}

          <label className="field">
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              readOnly={inviteMode}
              placeholder="you@company.com"
            />
          </label>

          {inviteMode ? (
            <label className="field">
              <span>Role</span>
              <input value={inviteRole || 'salesperson'} readOnly />
            </label>
          ) : null}

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

          <button
            type="submit"
            className="btn btn-primary auth-submit"
            disabled={submitting || inviteLoading || Boolean(inviteMode && inviteError)}
          >
            {submitting ? 'Creating account…' : inviteMode ? 'Accept invite & sign up' : 'Sign up'}
          </button>
        </form>

        <p className="auth-footer muted">
          Already have access? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
