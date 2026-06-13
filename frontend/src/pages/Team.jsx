import { useCallback, useEffect, useMemo, useState, startTransition } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth.js'
import { normalizeRole } from '../utils/access.js'
import { buildInviteSignupUrl } from '../utils/appUrl.js'

const ROLE_OPTIONS = ['admin', 'manager', 'salesperson']

function fmtDate(v) {
  if (!v) return '—'
  try {
    return new Date(v).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return '—'
  }
}

export default function Team() {
  const { profile, organization, user } = useAuth()
  const orgId = organization?.id ?? null
  const isAdmin = normalizeRole(profile?.role) === 'admin'

  const [users, setUsers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('salesperson')
  const [submittingInvite, setSubmittingInvite] = useState(false)
  const [inviteError, setInviteError] = useState(null)
  const [inviteLink, setInviteLink] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)

    if (!orgId || !isAdmin) {
      setUsers([])
      setInvitations([])
      setLoading(false)
      return
    }

    const withEmail = await supabase
      .from('profiles')
      .select('id,full_name,email,role,created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    let userRows
    if (withEmail.error && String(withEmail.error.message || '').toLowerCase().includes('email')) {
      const fallback = await supabase
        .from('profiles')
        .select('id,full_name,role,created_at')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
      if (fallback.error) {
        setLoading(false)
        setError(fallback.error.message)
        return
      }
      userRows = (fallback.data ?? []).map((r) => ({ ...r, email: null }))
    } else if (withEmail.error) {
      setLoading(false)
      setError(withEmail.error.message)
      return
    } else {
      userRows = withEmail.data ?? []
    }

    const { data: invData, error: invErr } = await supabase
      .from('invitations')
      .select('id,email,role,organization_id,invited_by,status,created_at')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })

    if (invErr) {
      setLoading(false)
      setError(invErr.message)
      return
    }
    setUsers(userRows)
    setInvitations(invData ?? [])
    setLoading(false)
  }, [orgId, isAdmin])

  useEffect(() => {
    startTransition(() => {
      void load()
    })
  }, [load])

  useEffect(() => {
    if (!orgId || !isAdmin) return undefined

    const channel = supabase
      .channel(`team-org-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `organization_id=eq.${orgId}` },
        () => {
          console.log('[team] profiles changed, refreshing members')
          void load()
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invitations', filter: `organization_id=eq.${orgId}` },
        () => {
          console.log('[team] invitations changed, refreshing list')
          void load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [orgId, isAdmin, load])

  const pendingInvites = useMemo(
    () => invitations.filter((x) => normalizeRole(x.status) === 'pending'),
    [invitations],
  )
  const acceptedInvites = useMemo(
    () => invitations.filter((x) => normalizeRole(x.status) === 'accepted'),
    [invitations],
  )

  async function copyText(text) {
    if (!text) return false
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      return false
    }
  }

  async function copyInviteLink() {
    if (!inviteLink) return
    const ok = await copyText(inviteLink)
    setCopied(ok)
    if (ok) window.setTimeout(() => setCopied(false), 2000)
  }

  async function copyPendingInviteLink(inviteId) {
    const link = buildInviteSignupUrl(inviteId)
    await copyText(link)
  }

  async function cancelInvite(id) {
    const { error: upErr } = await supabase
      .from('invitations')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .eq('organization_id', orgId)
      .eq('status', 'pending')
    if (!upErr) {
      setInvitations((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'cancelled' } : x)))
    }
  }

  async function submitInvite(e) {
    e.preventDefault()
    setInviteError(null)
    setInviteLink('')
    setCopied(false)

    if (!orgId || !user?.id) {
      setInviteError('Missing session organization context.')
      return
    }
    const email = inviteEmail.trim().toLowerCase()
    if (!email) {
      setInviteError('Email is required.')
      return
    }
    if (!ROLE_OPTIONS.includes(inviteRole)) {
      setInviteError('Invalid role.')
      return
    }

    setSubmittingInvite(true)
    const { data, error: insErr } = await supabase
      .from('invitations')
      .insert({
        email,
        role: inviteRole,
        organization_id: orgId,
        invited_by: user.id,
        status: 'pending',
      })
      .select('id,email,role,organization_id,invited_by,status,created_at')
      .single()
    setSubmittingInvite(false)

    if (insErr) {
      setInviteError(insErr.message)
      return
    }

    setInvitations((prev) => [data, ...prev])
    setInviteEmail('')
    setInviteLink(buildInviteSignupUrl(data.id))
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="page page-wide page-team">
      <header className="page-header page-header-row">
        <div>
          <h1>Team Management</h1>
          <p className="page-subtitle">Invite team members to your organization and review access.</p>
        </div>
        <Link className="btn btn-secondary" to="/dashboard">
          Dashboard
        </Link>
      </header>

      <section className="card team-invite-card">
        <h2 className="analytics-section-title">Invite user</h2>
        <form className="team-invite-form" onSubmit={submitInvite}>
          {inviteError ? <div className="banner banner-error">{inviteError}</div> : null}
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              placeholder="teammate@company.com"
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} required>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={submittingInvite}>
            {submittingInvite ? 'Creating invite…' : 'Create invite'}
          </button>
        </form>
        {inviteLink ? (
          <div className="team-invite-link-box">
            <p className="muted">Invite link</p>
            <code>{inviteLink}</code>
            <button type="button" className="btn btn-secondary btn-sm" onClick={copyInviteLink}>
              {copied ? 'Copied' : 'Copy invite link'}
            </button>
          </div>
        ) : null}
      </section>

      {error ? <div className="banner banner-error">{error}</div> : null}

      {loading ? (
        <p className="muted">Loading team…</p>
      ) : (
        <>
          <section className="card analytics-section">
            <h2 className="analytics-section-title">Organization users</h2>
            <div className="table-wrap analytics-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Full name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No users found.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id}>
                        <td>{u.full_name || '—'}</td>
                        <td>{u.email || '—'}</td>
                        <td>{u.role || 'salesperson'}</td>
                        <td>{fmtDate(u.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card analytics-section">
            <h2 className="analytics-section-title">Pending invitations</h2>
            <div className="table-wrap analytics-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {pendingInvites.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No pending invitations.
                      </td>
                    </tr>
                  ) : (
                    pendingInvites.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td>{inv.role}</td>
                        <td>{inv.status}</td>
                        <td>{fmtDate(inv.created_at)}</td>
                        <td className="lead-actions-cell">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => void copyPendingInviteLink(inv.id)}
                          >
                            Copy link
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => void cancelInvite(inv.id)}
                          >
                            Cancel
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card analytics-section">
            <h2 className="analytics-section-title">Accepted invitations</h2>
            <div className="table-wrap analytics-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {acceptedInvites.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No accepted invitations yet.
                      </td>
                    </tr>
                  ) : (
                    acceptedInvites.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.email}</td>
                        <td>{inv.role}</td>
                        <td>{inv.status}</td>
                        <td>{fmtDate(inv.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
