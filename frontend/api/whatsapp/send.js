import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppToLead } from '../../src/lib/whatsappSend.js'

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
      error: 'Server is not configured (missing Supabase URL or service role key).',
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

  const result = await sendWhatsAppToLead(admin, {
    authHeader: req.headers.authorization,
    leadId: body.leadId,
    message: body.message,
    twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
    twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
    twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM || '',
  })

  if (!result.ok) {
    res.status(result.status).json({
      error: result.error,
      ...(result.data ? { partial: result.data } : {}),
    })
    return
  }

  res.status(200).json(result.data)
}
