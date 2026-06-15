import { ACTIVITY_TYPES } from '../constants/activityTypes.js'
import { NOTIFICATION_TYPES } from '../constants/notificationTypes.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

/**
 * Normalize a lead phone number to Twilio WhatsApp format (e.g. whatsapp:+919876543210).
 * @param {string | null | undefined} phone
 */
export function formatWhatsAppAddress(phone) {
  let digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return null

  if (digits.length === 10) {
    digits = `91${digits}`
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = `91${digits.slice(1)}`
  }

  return `whatsapp:+${digits}`
}

async function authenticateRequest(adminClient, authHeader) {
  const token = String(authHeader || '')
    .replace(/^Bearer\s+/i, '')
    .trim()

  if (!token) {
    return { ok: false, status: 401, error: 'Missing authorization token.' }
  }

  const { data: userData, error: userErr } = await adminClient.auth.getUser(token)
  if (userErr || !userData?.user?.id) {
    return { ok: false, status: 401, error: 'Invalid or expired session.' }
  }

  const userId = userData.user.id
  const { data: profile, error: profileErr } = await adminClient
    .from('profiles')
    .select('id, organization_id')
    .eq('id', userId)
    .maybeSingle()

  if (profileErr) {
    return { ok: false, status: 500, error: profileErr.message }
  }
  if (!profile?.organization_id) {
    return { ok: false, status: 403, error: 'No organization found for this user.' }
  }

  return { ok: true, userId, organizationId: profile.organization_id }
}

function formatActivityInsertError(error) {
  const base = error?.message || 'Unknown activity insert error'
  if (error?.code === '23503' && String(base).includes('activities_id_fkey')) {
    return (
      `${base} — activities.id incorrectly references profiles(id). ` +
      'Run supabase/sql/010_fix_activities_id.sql in the Supabase SQL editor.'
    )
  }
  if (error?.code) return `${base} (code ${error.code})`
  return base
}

/**
 * Insert activity row. Does NOT set `id` — Postgres must generate it via gen_random_uuid().
 * Requires supabase/sql/010_fix_activities_id.sql (drops broken activities_id_fkey).
 */
async function insertActivity(adminClient, payload) {
  const activityType = String(payload.activityType || '').trim()
  const row = {
    lead_id: payload.leadId,
    organization_id: payload.organizationId,
    user_id: payload.userId,
    activity_type: activityType,
    description: payload.description,
    metadata: payload.metadata ?? {},
  }

  const response = await adminClient
    .from('activities')
    .insert(row)
    .select('id, lead_id, organization_id, user_id, activity_type, description, metadata, created_at')
    .single()

  const { data, error, status, statusText } = response

  if (error) {
    return { data: null, error }
  }

  if (!data?.id) {
    return {
      data: null,
      error: {
        message: 'Activity insert returned no row (check RLS or activities table schema).',
        code: 'ACTIVITY_INSERT_EMPTY',
      },
    }
  }

  return { data, error: null }
}

async function insertNotification(adminClient, payload) {
  const { error } = await adminClient.from('notifications').insert({
    organization_id: payload.organizationId,
    user_id: payload.userId,
    notification_type: payload.notificationType,
    title: payload.title,
    message: payload.message,
    lead_id: payload.leadId,
    is_read: false,
    metadata: payload.metadata ?? {},
  })

  if (error) {
    console.error('[whatsappSend] notification insert failed:', error.message)
  }
}

function parseTwilioError(body, status) {
  const message =
    body?.message ||
    body?.error_message ||
    body?.more_info ||
    `Twilio request failed (${status})`
  const code = body?.code != null ? ` (code ${body.code})` : ''
  return `${message}${code}`
}

async function sendTwilioWhatsApp({ accountSid, authToken, from, to, body }) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
  const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')
  const params = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(parseTwilioError(data, res.status))
  }

  return data
}

/**
 * Send a WhatsApp message to a lead via Twilio.
 * @param {import('@supabase/supabase-js').SupabaseClient} adminClient
 * @param {{
 *   authHeader?: string,
 *   leadId: string,
 *   message: string,
 *   twilioAccountSid: string,
 *   twilioAuthToken: string,
 *   twilioWhatsAppFrom: string,
 * }} params
 */
export async function sendWhatsAppToLead(
  adminClient,
  { authHeader, leadId, message, twilioAccountSid, twilioAuthToken, twilioWhatsAppFrom },
) {
  const auth = await authenticateRequest(adminClient, authHeader)
  if (!auth.ok) {
    return { ok: false, status: auth.status, error: auth.error }
  }

  const id = String(leadId || '').trim()
  const text = String(message || '').trim()

  if (!isUuid(id)) {
    return { ok: false, status: 400, error: 'leadId must be a valid UUID.' }
  }
  if (!text) {
    return { ok: false, status: 400, error: 'message is required.' }
  }
  if (text.length > 1600) {
    return { ok: false, status: 400, error: 'message must be 1600 characters or fewer.' }
  }

  if (!twilioAccountSid || !twilioAuthToken || !twilioWhatsAppFrom) {
    return {
      ok: false,
      status: 503,
      error: 'WhatsApp is not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM).',
    }
  }

  const { data: lead, error: leadErr } = await adminClient
    .from('leads')
    .select('id, name, phone, organization_id')
    .eq('id', id)
    .maybeSingle()

  if (leadErr) {
    return { ok: false, status: 500, error: leadErr.message }
  }
  if (!lead) {
    return { ok: false, status: 404, error: 'Lead not found.' }
  }
  if (lead.organization_id !== auth.organizationId) {
    return { ok: false, status: 403, error: 'You do not have access to this lead.' }
  }

  const to = formatWhatsAppAddress(lead.phone)
  if (!to) {
    return { ok: false, status: 400, error: 'Lead does not have a valid phone number for WhatsApp.' }
  }

  const from = String(twilioWhatsAppFrom).trim()
  if (!from.startsWith('whatsapp:')) {
    return {
      ok: false,
      status: 503,
      error: 'TWILIO_WHATSAPP_FROM must use the whatsapp:+... format.',
    }
  }

  try {
    const twilioMessage = await sendTwilioWhatsApp({
      accountSid: twilioAccountSid,
      authToken: twilioAuthToken,
      from,
      to,
      body: text,
    })

    const organizationId = lead.organization_id || auth.organizationId
    const { data: activity, error: activityErr } = await insertActivity(adminClient, {
      leadId: lead.id,
      organizationId,
      userId: auth.userId,
      activityType: ACTIVITY_TYPES.WHATSAPP_SENT,
      description: 'WhatsApp message sent',
      metadata: {
        channel: 'whatsapp',
        to,
        twilio_sid: twilioMessage.sid ?? null,
      },
    })

    if (activityErr) {
      const errorMessage = formatActivityInsertError(activityErr)
      console.error('[whatsappSend] activity insert failed after Twilio send', {
        twilio_sid: twilioMessage.sid ?? null,
        lead_id: lead.id,
        organization_id: organizationId,
        activity_type: ACTIVITY_TYPES.WHATSAPP_SENT,
        error: errorMessage,
        code: activityErr.code,
        details: activityErr.details,
      })
      return {
        ok: false,
        status: 500,
        error: errorMessage,
        data: {
          twilioSent: true,
          sid: twilioMessage.sid ?? null,
          leadId: lead.id,
        },
      }
    }

    return {
      ok: true,
      status: 200,
      data: {
        sid: twilioMessage.sid ?? null,
        to,
        leadId: lead.id,
        organizationId,
        activity,
      },
    }
  } catch (err) {
    const errorMessage = err?.message ?? 'Failed to send WhatsApp message.'

    await insertNotification(adminClient, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      notificationType: NOTIFICATION_TYPES.WHATSAPP_SEND_FAILED,
      title: 'WhatsApp send failed',
      message: `${lead.name}: ${errorMessage}`,
      leadId: lead.id,
      metadata: { error: errorMessage, to },
    })

    return { ok: false, status: 502, error: errorMessage }
  }
}
