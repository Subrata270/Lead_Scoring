import { createClient } from '@supabase/supabase-js'
import { fetchInvitationById } from '../../src/lib/inviteOnboarding.js'

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

export default async function handler(req, res) {
  sendCors(res)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const url = getSupabaseUrl()
  const serviceKey = getServiceKey()
  if (!url || !serviceKey) {
    res.status(503).json({
      error: 'Server is not configured for invitation onboarding.',
    })
    return
  }

  const inviteId = String(req.query?.inviteId || '').trim()
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const result = await fetchInvitationById(admin, inviteId)
  if (!result.ok) {
    res.status(result.status).json({ error: result.error })
    return
  }

  res.status(200).json({ invitation: result.data })
}
