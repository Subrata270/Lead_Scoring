export const INVITE_INVALID_MSG = 'Invalid or expired invitation.'
export const INVITE_USED_MSG = 'This invitation has already been used.'

export function normalizeInviteStatus(status) {
  return String(status || '').toLowerCase().trim()
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin
 * @param {string} inviteId
 */
export async function fetchInvitationById(admin, inviteId) {
  const id = String(inviteId || '').trim()
  if (!id) {
    console.warn('[invite] fetch skipped: missing invite id')
    return { ok: false, status: 400, error: INVITE_INVALID_MSG }
  }

  console.log('[invite] fetching invitation', { inviteId: id })
  const { data, error } = await admin
    .from('invitations')
    .select('id,email,role,organization_id,status')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[invite] fetch failed', { inviteId: id, error })
    return { ok: false, status: 500, error: error.message }
  }
  if (!data) {
    console.warn('[invite] invitation not found', { inviteId: id })
    return { ok: false, status: 404, error: INVITE_INVALID_MSG }
  }

  const status = normalizeInviteStatus(data.status)
  if (status === 'accepted') {
    console.warn('[invite] invitation already accepted', { inviteId: id })
    return { ok: false, status: 409, error: INVITE_USED_MSG }
  }
  if (status !== 'pending') {
    console.warn('[invite] invitation not pending', { inviteId: id, status: data.status })
    return { ok: false, status: 410, error: INVITE_INVALID_MSG }
  }

  console.log('[invite] invitation valid', {
    inviteId: id,
    organization_id: data.organization_id,
    role: data.role,
  })
  return { ok: true, data }
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
