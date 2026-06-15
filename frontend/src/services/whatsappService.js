function apiBase() {
  const configured = import.meta.env.VITE_PUBLIC_LEAD_API_URL
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '')
  }
  return ''
}

function apiUrl(path) {
  const base = apiBase()
  return base ? `${base}${path}` : path
}

/**
 * Send a WhatsApp message to a lead via Twilio.
 * @param {{ accessToken: string, leadId: string, message: string }} params
 */
export async function sendWhatsAppMessage({ accessToken, leadId, message }) {
  const token = String(accessToken || '').trim()
  if (!token) {
    return { ok: false, status: 401, error: 'You must be signed in to send WhatsApp messages.' }
  }

  const res = await fetch(apiUrl('/api/whatsapp/send'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ leadId, message }),
  })

  const contentType = res.headers.get('content-type') || ''
  let body = null
  if (contentType.includes('application/json')) {
    body = await res.json().catch(() => null)
  } else {
    const text = await res.text().catch(() => '')
    return {
      ok: false,
      status: res.status,
      error: text || `Unexpected response (${res.status})`,
    }
  }

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: body?.error || `WhatsApp send failed (${res.status})`,
    }
  }

  return { ok: true, data: body }
}
