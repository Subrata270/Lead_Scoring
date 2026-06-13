export const INVITE_INVALID_MSG = 'Invalid or expired invitation.'
export const INVITE_USED_MSG = 'This invitation has already been used.'
export const INVITE_CANCELLED_MSG = 'This invitation has been cancelled.'

export function normalizeInviteStatus(status) {
  return String(status || '').toLowerCase().trim()
}

/**
 * Validate a raw invitation row (client or server).
 * @param {object | null | undefined} invite
 * @returns {{ ok: true, invitation: object } | { ok: false, error: string, statusCode?: number }}
 */
export function validateInvitationRecord(invite) {
  if (!invite || typeof invite !== 'object' || !invite.id) {
    return { ok: false, error: INVITE_INVALID_MSG, statusCode: 404 }
  }

  const status = normalizeInviteStatus(invite.status)
  if (status === 'accepted') {
    return { ok: false, error: INVITE_USED_MSG, statusCode: 409 }
  }
  if (status === 'cancelled') {
    return { ok: false, error: INVITE_CANCELLED_MSG, statusCode: 410 }
  }
  if (status !== 'pending') {
    return { ok: false, error: INVITE_INVALID_MSG, statusCode: 410 }
  }

  if (!invite.email || !invite.organization_id) {
    return { ok: false, error: 'Invitation is incomplete or invalid.', statusCode: 422 }
  }

  return {
    ok: true,
    invitation: {
      id: invite.id,
      email: String(invite.email).trim().toLowerCase(),
      role: String(invite.role || 'salesperson').trim() || 'salesperson',
      organization_id: invite.organization_id,
      status: invite.status,
    },
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} inviteId
 */
export async function fetchInvitationById(admin, inviteId) {
  const id = String(inviteId || '').trim()
  console.log('Invite ID:', id)

  if (!id) {
    console.warn('[invite] fetch skipped: missing invite id')
    return { ok: false, status: 400, error: INVITE_INVALID_MSG }
  }

  const { data: invite, error } = await admin
    .from('invitations')
    .select('id,email,role,organization_id,status')
    .eq('id', id)
    .maybeSingle()

  console.log('Invite Query Result:', invite)
  console.log('Invite Error:', error)

  if (error) {
    console.error('[invite] fetch failed', { inviteId: id, error: error.message })
    return { ok: false, status: 500, error: error.message }
  }

  const validated = validateInvitationRecord(invite)
  if (!validated.ok) {
    console.warn('[invite] invitation invalid', {
      inviteId: id,
      status: invite?.status ?? null,
      error: validated.error,
    })
    return { ok: false, status: validated.statusCode || 404, error: validated.error }
  }

  console.log('[invite] invitation valid', {
    inviteId: id,
    organization_id: validated.invitation.organization_id,
    role: validated.invitation.role,
  })
  return { ok: true, data: validated.invitation }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {{ inviteId: string, userId: string, userEmail: string, fullName: string }} params
 */
export async function acceptInvitationForUser(admin, { inviteId, userId, userEmail, fullName }) {
  const id = String(inviteId || '').trim()
  const uid = String(userId || '').trim()
  const fn = String(fullName || '').trim()
  const email = String(userEmail || '').trim().toLowerCase()

  if (!id || !uid || !fn || !email) {
    console.warn('[invite] accept skipped: missing required fields', { inviteId: id, userId: uid })
    return { ok: false, status: 400, error: 'Missing invitation or account details.' }
  }

  const fetchResult = await fetchInvitationById(admin, id)
  if (!fetchResult.ok) return fetchResult

  const inv = fetchResult.data
  const invitedEmail = String(inv.email || '').trim().toLowerCase()
  if (email !== invitedEmail) {
    console.warn('[invite] email mismatch', { userEmail: email, invitedEmail, inviteId: id })
    return {
      ok: false,
      status: 403,
      error: 'Sign up with the email address that received this invitation.',
    }
  }

  const { data: existing, error: existingErr } = await admin
    .from('profiles')
    .select('id,organization_id,role,full_name')
    .eq('id', uid)
    .maybeSingle()

  if (existingErr) {
    console.error('[invite] profile lookup failed', { userId: uid, error: existingErr })
    return { ok: false, status: 500, error: existingErr.message }
  }

  if (existing?.organization_id) {
    if (existing.organization_id === inv.organization_id) {
      console.log('[invite] user already in organization', { userId: uid, organization_id: inv.organization_id })
      const { error: invUpErr } = await admin
        .from('invitations')
        .update({ status: 'accepted' })
        .eq('id', id)
        .eq('status', 'pending')
      if (invUpErr) {
        console.error('[invite] invitation update failed for existing member', { inviteId: id, error: invUpErr })
      }
      return { ok: true, data: { organization_id: existing.organization_id, role: existing.role, alreadyMember: true } }
    }
    return { ok: false, status: 409, error: 'Account already belongs to another organization.' }
  }

  const profilePayload = {
    id: uid,
    full_name: fn,
    organization_id: inv.organization_id,
    role: String(inv.role || 'salesperson').trim() || 'salesperson',
    email,
  }

  console.log('[invite] creating profile', {
    userId: uid,
    organization_id: inv.organization_id,
    role: profilePayload.role,
  })

  let { error: profErr } = await admin.from('profiles').insert(profilePayload)
  if (profErr && String(profErr.message || '').toLowerCase().includes('email')) {
    const { email: _omit, ...withoutEmail } = profilePayload
    ;({ error: profErr } = await admin.from('profiles').insert(withoutEmail))
  }

  if (profErr) {
    console.error('[invite] profile creation failed', { userId: uid, error: profErr })
    return { ok: false, status: 500, error: profErr.message }
  }

  console.log('[invite] marking invitation accepted', { inviteId: id })
  const { error: invErr } = await admin
    .from('invitations')
    .update({ status: 'accepted' })
    .eq('id', id)
    .eq('status', 'pending')

  if (invErr) {
    console.error('[invite] invitation update failed', { inviteId: id, error: invErr })
    return { ok: false, status: 500, error: invErr.message }
  }

  console.log('[invite] onboarding complete', { userId: uid, organization_id: inv.organization_id })
  return {
    ok: true,
    data: {
      organization_id: inv.organization_id,
      role: profilePayload.role,
      alreadyMember: false,
    },
  }
}
