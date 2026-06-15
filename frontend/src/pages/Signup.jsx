import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth.js'
import {
  acceptInvitation,
  fetchInvitation,
} from '../services/inviteOnboardingService.js'
import { AUTH_LOAD_TIMEOUT_MS } from '../utils/authLoadTimeout.js'

export default function Signup() {
  const {
    user,
    profile,
    organization,
    loading,
    profileLoading,
    profileError,
    loadTimedOut,
    bootstrapComplete,
  } = useAuth()
  const [searchParams] = useSearchParams()
  const inviteId = (searchParams.get('invite') || '').trim()
  const inviteMode = Boolean(inviteId)

  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('')
  const [inviteOrganizationId, setInviteOrganizationId] = useState('')
  const [inviteStatus, setInviteStatus] = useState('')
  const [inviteFound, setInviteFound] = useState(false)
  const [inviteLookupSource, setInviteLookupSource] = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [pendingVerify, setPendingVerify] = useState(false)
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

  useEffect(() => {
    let cancelled = false

    async function loadInvite() {
      if (!inviteMode) {
        setInviteError(null)
        setInviteRole('')
        setInviteOrganizationId('')
        setInviteStatus('')
        setInviteFound(false)
        setInviteLookupSource('')
        return
      }

      setInviteLoading(true)
      setInviteError(null)
      setInviteFound(false)
      setInviteStatus('')
      setInviteLookupSource('')
      console.log('Invite ID:', inviteId)

      const result = await fetchInvitation(inviteId)
      if (cancelled) return

      setInviteLoading(false)
      setInviteLookupSource(result.source || '')

      if (!result.ok) {
        console.log('Invite Query Result:', null)
        console.log('Invite Error:', result.error)
        setInviteError(result.error || 'Invalid or expired invitation.')
        setInviteFound(false)
        setEmail('')
        setInviteRole('')
        setInviteOrganizationId('')
        return
      }

      const invitation = result.invitation
      if (!invitation?.id || !invitation?.email) {
        const msg = 'Invitation data is missing or incomplete.'
        console.log('Invite Query Result:', invitation)
        console.log('Invite Error:', msg)
        setInviteError(msg)
        setInviteFound(false)
        return
      }

      console.log('Invite Query Result:', invitation)
      console.log('Invite Error:', null)
      setInviteFound(true)
      setEmail(String(invitation.email).trim())
      setInviteRole(String(invitation.role || 'salesperson').trim() || 'salesperson')
      setInviteOrganizationId(String(invitation.organization_id || '').trim())
      setInviteStatus(String(invitation.status || 'pending').trim())
    }

    void loadInvite()
    return () => {
      cancelled = true
    }
  }, [inviteId, inviteMode])

  if (bootstrapComplete && !loading && !profileLoading && user && hasWorkspace) {
    return <Navigate to="/dashboard" replace />
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
          <h1 className="auth-card-title">Could not finish setup</h1>
          {(loadTimedOut || localTimedOut) && (
            <div className="banner banner-error">
              Workspace loading timed out after {AUTH_LOAD_TIMEOUT_MS / 1000} seconds.
            </div>
          )}
          {profileError ? <div className="banner banner-error">{profileError}</div> : null}
          <Link className="btn btn-primary" to="/login">
            Go to sign in
          </Link>
        </div>
      </div>
    )
  }

  async function completeInviteOnboarding(sessionUser, name, accessToken) {
    if (!accessToken) {
      console.warn('[signup] invite completion deferred: no session token yet', { inviteId })
      return { ok: false, deferred: true }
    }

    const acceptResult = await acceptInvitation({
      inviteId,
      fullName: name,
      accessToken,
    })

    if (!acceptResult.ok) {
      console.error('[signup] invite acceptance failed', { inviteId, error: acceptResult.error })
      return { ok: false, error: acceptResult.error }
    }

    console.log('[signup] invite onboarding complete', { inviteId, userId: sessionUser.id })
    return { ok: true }
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
    if (inviteMode && (inviteError || !inviteFound)) {
      setError(inviteError || 'Invalid or expired invitation.')
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
      console.error('[signup] auth signUp failed', signUpErr)
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

    if (inviteMode) {
      const inviteResult = await completeInviteOnboarding(
        sessionUser,
        fn,
        authData.session?.access_token,
      )
      setSubmitting(false)

      if (inviteResult.deferred) {
        setPendingVerify(true)
        return
      }
      if (!inviteResult.ok) {
        setError(inviteResult.error || 'Failed to join organization.')
        return
      }

      window.location.assign('/dashboard')
      return
    }

    const { data: orgRow, error: orgErr } = await supabase
      .from('organizations')
      .insert({ name: cn })
      .select('id')
      .single()

    if (orgErr) {
      setSubmitting(false)
      console.error('[signup] organization creation failed', orgErr)
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
      console.error('[signup] profile creation failed', profErr)
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
            Check your email to confirm your account. After confirming, sign in to join your team.
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
            disabled={submitting || inviteLoading || Boolean(inviteMode && (inviteError || !inviteFound))}
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
