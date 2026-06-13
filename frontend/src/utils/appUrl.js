/**
 * Public app base URL for shareable links (invites, etc.).
 * Prefer VITE_APP_URL; fall back to current origin in the browser.
 */
export function getAppBaseUrl() {
  const configured = import.meta.env.VITE_APP_URL
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim().replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

/** Build signup URL for a team invitation id. */
export function buildInviteSignupUrl(inviteId) {
  const base = getAppBaseUrl()
  const id = encodeURIComponent(String(inviteId || '').trim())
  return `${base}/signup?invite=${id}`
}
