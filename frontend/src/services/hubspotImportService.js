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
 * Import HubSpot contacts as leads (skips existing emails in the org).
 * @param {string} accessToken Supabase session access token
 */
export async function importFromHubSpot(accessToken) {
  const token = String(accessToken || '').trim()
  if (!token) {
    return { ok: false, status: 401, error: 'You must be signed in to import from HubSpot.' }
  }

  const res = await fetch(apiUrl('/api/integrations/hubspot/contacts'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
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
      error: body?.error || `Import failed (${res.status})`,
    }
  }

  return {
    ok: true,
    imported: body?.imported ?? 0,
    skipped: body?.skipped ?? 0,
    total: body?.total ?? 0,
  }
}
