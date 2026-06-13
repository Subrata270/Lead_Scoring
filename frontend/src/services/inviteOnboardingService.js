import {
  INVITE_INVALID_MSG,
  INVITE_USED_MSG,
} from '../lib/inviteOnboarding.js'

function apiBase() {
  const configured = import.meta.env.VITE_PUBLIC_LEAD_API_URL
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '')
  }
  return ''
}

function inviteUrl(path) {
  const base = apiBase()
  return base ? `${base}${path}` : path
}

async function parseJsonResponse(res) {
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return body
}

/**
 * @param {string} inviteId
 * @returns {Promise<{ ok: true, invitation: object } | { ok: false, error: string }>}
 */
export async function fetchInvitation(inviteId) {
  const id = String(inviteId || '').trim()
  if (!id) {
    console.warn('[inviteOnboarding] fetch skipped: missing invite id')
    return { ok: false, error: INVITE_INVALID_MSG }
  }

  console.log('[inviteOnboarding] fetching invitation', { inviteId: id })
  try {
    const res = await fetch(inviteUrl(`/api/invitations/${encodeURIComponent(id)}`))
    const body = await parseJsonResponse(res)

    if (!res.ok) {
      const error = body?.error || INVITE_INVALID_MSG
      console.error('[inviteOnboarding] fetch failed', { inviteId: id, status: res.status, error })
      return { ok: false, error }
    }

    console.log('[inviteOnboarding] invitation loaded', { inviteId: id })
    return { ok: true, invitation: body?.invitation ?? body }
  } catch (err) {
    console.error('[inviteOnboarding] fetch error', { inviteId: id, error: err })
    return { ok: false, error: err?.message || 'Failed to load invitation.' }
  }
}

/**
 * @param {{ inviteId: string, fullName: string, accessToken: string }} params
 */
export async function acceptInvitation({ inviteId, fullName, accessToken }) {
  const id = String(inviteId || '').trim()
  const token = String(accessToken || '').trim()
  const name = String(fullName || '').trim()

  if (!id || !token || !name) {
    console.warn('[inviteOnboarding] accept skipped: missing fields', { inviteId: id })
    return { ok: false, error: 'Missing invitation or session details.' }
  }

  console.log('[inviteOnboarding] accepting invitation', { inviteId: id })
  try {
    const res = await fetch(inviteUrl('/api/invitations/accept'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ inviteId: id, fullName: name }),
    })
    const body = await parseJsonResponse(res)

    if (!res.ok) {
      const error = body?.error || 'Failed to complete invitation onboarding.'
      console.error('[inviteOnboarding] accept failed', { inviteId: id, status: res.status, error })
      return { ok: false, error }
    }

    console.log('[inviteOnboarding] invitation accepted', { inviteId: id })
    return { ok: true, data: body }
  } catch (err) {
    console.error('[inviteOnboarding] accept error', { inviteId: id, error: err })
    return { ok: false, error: err?.message || 'Failed to complete invitation onboarding.' }
  }
}

export { INVITE_INVALID_MSG, INVITE_USED_MSG }
