import { createClient } from '@supabase/supabase-js'
import { acceptInvitationForUser } from '../../src/lib/inviteOnboarding.js'

function getSupabaseUrl() {
  return (
    process.env.VITE_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  )
}

function getServiceKey() {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || ''
}

function sendCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req, res) {
  sendCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const supabaseUrl = getSupabaseUrl()
  const serviceKey = getServiceKey()
  if (!supabaseUrl || !serviceKey) {
    res.status(503).json({
      error: 'Server is not configured for invitation onboarding.',
    })
    return
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token.' })
    return
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}')
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' })
      return
    }
  }

  const inviteId = String(body?.inviteId || '').trim()
  const fullName = String(body?.fullName || '').trim()
  if (!inviteId || !fullName) {
    res.status(400).json({ error: 'inviteId and fullName are required.' })
    return
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user?.id) {
    console.error('[invite] auth token invalid', userErr)
    res.status(401).json({ error: 'Invalid or expired session.' })
    return
  }

  const user = userData.user
  const result = await acceptInvitationForUser(admin, {
    inviteId,
    userId: user.id,
    userEmail: user.email || '',
    fullName,
  })

  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }

  res.status(200).json(result.data)
}
