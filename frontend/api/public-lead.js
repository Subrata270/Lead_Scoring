import { createClient } from '@supabase/supabase-js'
import { createPublicLead } from '../src/lib/createPublicLead.js'

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const url = getSupabaseUrl()
  const serviceKey = getServiceKey()
  if (!url || !serviceKey) {
    res.status(503).json({
      error: 'Server is not configured for public lead intake (missing Supabase URL or service role key).',
    })
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

  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Expected a JSON object' })
    return
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const result = await createPublicLead(admin, body, { defaultSource: 'api' })

  if (!result.ok) {
    res.status(result.status).json({
      error: result.error,
      ...(result.details ? { details: result.details } : {}),
    })
    return
  }

  res.status(201).json(result.data)
}
