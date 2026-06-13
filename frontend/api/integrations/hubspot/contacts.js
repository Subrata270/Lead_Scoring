import { createClient } from '@supabase/supabase-js'
import {
  authenticateHubSpotImport,
  syncHubSpotContacts,
} from '../../../src/lib/hubspotSync.js'

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

function getHubSpotToken() {
  return process.env.HUBSPOT_ACCESS_TOKEN || ''
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

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
  const hubspotToken = getHubSpotToken()

  if (!url || !serviceKey) {
    res.status(503).json({
      error: 'Server is not configured (missing Supabase URL or service role key).',
    })
    return
  }

  if (!hubspotToken) {
    res.status(503).json({
      error: 'HubSpot integration is not configured (set HUBSPOT_ACCESS_TOKEN).',
    })
    return
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const auth = await authenticateHubSpotImport(admin, req.headers.authorization)
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error })
    return
  }

  try {
    const result = await syncHubSpotContacts(admin, {
      hubspotAccessToken: hubspotToken,
      organizationId: auth.organizationId,
      userId: auth.userId,
    })

    res.status(200).json(result)
  } catch (e) {
    res.status(500).json({ error: e?.message ?? 'HubSpot import failed' })
  }
}
