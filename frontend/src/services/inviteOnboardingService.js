import { supabase } from '../lib/supabaseClient'
import {
  INVITE_INVALID_MSG,
  INVITE_USED_MSG,
  validateInvitationRecord,
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
  const contentType = res.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    const text = await res.text().catch(() => '')
    return { body: null, parseError: `Expected JSON but received ${contentType || 'unknown'} (${text.slice(0, 120)})` }
  }

  try {
    const body = await res.json()
    return { body, parseError: null }
  } catch (err) {
    return { body: null, parseError: err?.message || 'Invalid JSON response' }
  }
}

/**
 * Direct Supabase lookup (anon client). Requires RLS policy allowing read of pending invites by id.
 * @param {string} inviteId
 */
async function fetchInvitationFromSupabase(inviteId) {
  const id = String(inviteId || '').trim()
  console.log('Invite ID:', id)

  const { data: invite, error } = await supabase
    .from('invitations')
    .select('id,email,role,organization_id,status')
    .eq('id', id)
    .maybeSingle()

  console.log('Invite Query Result:', invite)
  console.log('Invite Error:', error)

  if (error) {
    console.error('[inviteOnboarding] supabase lookup failed', { inviteId: id, error: error.message })
    return { ok: false, error: error.message, source: 'supabase', hardError: true }
  }

  if (!invite) {
    return { ok: false, error: INVITE_INVALID_MSG, source: 'supabase', hardError: false }
  }

  const validated = validateInvitationRecord(invite)
  if (!validated.ok) {
    return { ok: false, error: validated.error, source: 'supabase', hardError: true }
  }

  console.log('[inviteOnboarding] invitation loaded via supabase', { inviteId: id })
  return { ok: true, invitation: validated.invitation, source: 'supabase' }
}

/**
 * Server API lookup (service role). Works on localhost via Vite proxy to Express.
 * @param {string} inviteId
 */
async function fetchInvitationFromApi(inviteId) {
  const id = String(inviteId || '').trim()
  console.log('[inviteOnboarding] fetching invitation via API', { inviteId: id, url: inviteUrl(`/api/invitations/${encodeURIComponent(id)}`) })

  try {
    const res = await fetch(inviteUrl(`/api/invitations/${encodeURIComponent(id)}`))
    const { body, parseError } = await parseJsonResponse(res)

    if (parseError) {
      console.error('[inviteOnboarding] API response parse failed', { inviteId: id, parseError })
      return {
        ok: false,
        error: `Invitation API returned an invalid response: ${parseError}`,
        source: 'api',
        hardError: true,
      }
    }

    if (!res.ok) {
      const error = body?.error || INVITE_INVALID_MSG
      console.error('[inviteOnboarding] API fetch failed', { inviteId: id, status: res.status, error })
      return { ok: false, error, source: 'api', hardError: true }
    }

    const raw = body?.invitation ?? null
    console.log('Invite Query Result:', raw)
    console.log('Invite Error:', null)

    const validated = validateInvitationRecord(raw)
    if (!validated.ok) {
      console.error('[inviteOnboarding] API returned invalid invitation', { inviteId: id, error: validated.error })
      return { ok: false, error: validated.error, source: 'api', hardError: true }
    }

    console.log('[inviteOnboarding] invitation loaded via API', { inviteId: id })
    return { ok: true, invitation: validated.invitation, source: 'api' }
  } catch (err) {
    console.error('[inviteOnboarding] API fetch error', { inviteId: id, error: err })
    return { ok: false, error: err?.message || 'Failed to load invitation.', source: 'api', hardError: true }
  }
}

/**
 * @param {string} inviteId
 * @returns {Promise<{ ok: true, invitation: object, source: string } | { ok: false, error: string, source?: string }>}
 */
export async function fetchInvitation(inviteId) {
  const id = String(inviteId || '').trim()
  if (!id) {
    console.warn('[inviteOnboarding] fetch skipped: missing invite id')
    return { ok: false, error: INVITE_INVALID_MSG }
  }

  const supabaseResult = await fetchInvitationFromSupabase(id)
  if (supabaseResult.ok) {
    return supabaseResult
  }

  // Supabase returned no row (RLS or missing invite) — try service-role API fallback.
  if (!supabaseResult.hardError) {
    console.warn('[inviteOnboarding] supabase returned no invite, trying API fallback', { inviteId: id })
    const apiResult = await fetchInvitationFromApi(id)
    if (apiResult.ok) {
      return apiResult
    }
    return {
      ok: false,
      error: apiResult.error || supabaseResult.error || INVITE_INVALID_MSG,
      source: apiResult.source || 'api',
    }
  }

  // Supabase hard error (e.g. RLS denied) — still try API before surfacing error.
  console.warn('[inviteOnboarding] supabase lookup failed, trying API fallback', {
    inviteId: id,
    error: supabaseResult.error,
  })
  const apiResult = await fetchInvitationFromApi(id)
  if (apiResult.ok) {
    return apiResult
  }

  return {
    ok: false,
    error: apiResult.error || supabaseResult.error || INVITE_INVALID_MSG,
    source: apiResult.source || supabaseResult.source,
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
    const { body, parseError } = await parseJsonResponse(res)

    if (parseError) {
      console.error('[inviteOnboarding] accept response parse failed', { inviteId: id, parseError })
      return { ok: false, error: `Invitation accept API returned invalid response: ${parseError}` }
    }

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
