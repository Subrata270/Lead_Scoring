/**
 * Template-based outbound copy (no LLM). Modular by category + vertical hints.
 */

export const MESSAGE_CHANNEL = {
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
  FOLLOW_UP: 'follow-up',
}

/** Alias for UI labels / imports that prefer “types” wording */
export const MESSAGE_TYPES = MESSAGE_CHANNEL

/** @typedef {'real_estate'|'clinic'|'gym'|'saas'|'generic'} VerticalKey */

/**
 * @param {string | undefined | null} industryName
 * @param {string | undefined | null} businessTypeName
 * @returns {VerticalKey}
 */
export function detectVertical(industryName, businessTypeName) {
  const s = `${industryName || ''} ${businessTypeName || ''}`.toLowerCase()
  if (/(real\s*estate|realtor|property|brokerage|housing|land)/.test(s)) return 'real_estate'
  if (/(clinic|medical|dental|health|hospital|physician|patient)/.test(s)) return 'clinic'
  if (/(gym|fitness|workout|training|sports?\b|athletic)/.test(s)) return 'gym'
  if (/(saas|software|cloud|platform|subscription|b2b\s*tech|api)/.test(s)) return 'saas'
  return 'generic'
}

const VERTICAL_OPEN = {
  real_estate:
    'Thanks for your interest — I’d love to help you move forward with the right next step.',
  clinic:
    'Thank you for reaching out. We’re here to make scheduling and care questions simple.',
  gym: 'Great to hear from you — let’s find a membership or program option that fits your goals.',
  saas: 'Thanks for your interest. I’d be happy to show you how we can support your team’s workflow.',
  generic: 'Thank you for getting in touch — I’d like to learn more about what you’re looking for.',
}

const VERTICAL_CLOSE = {
  real_estate: 'Would a quick call this week work to discuss listings or timelines?',
  clinic: 'Would you like me to share available slots or answer any questions before you decide?',
  gym: 'Are you open to a short call or trial visit so we can match you with the best plan?',
  saas: 'Would a 15-minute walkthrough help you evaluate fit for your use case?',
  generic: 'Would you be open to a brief call so I can tailor the next steps for you?',
}

/**
 * @param {string | undefined | null} urgency
 */
function urgencyPhrase(urgency) {
  const u = (urgency || '').toLowerCase()
  if (u === 'high') return 'Given your timeline, I want to prioritize you today.'
  if (u === 'low') return 'Whenever it’s convenient, I’m happy to follow up at your pace.'
  return 'I can move quickly if you’d like to connect in the next day or two.'
}

/**
 * @param {'hot'|'warm'|'cold'} bucket
 * @param {VerticalKey} vertical
 */
function categoryBlock(bucket, vertical) {
  const open = VERTICAL_OPEN[vertical]
  const close = VERTICAL_CLOSE[vertical]

  if (bucket === 'hot') {
    return {
      subject: 'Quick follow-up — next steps',
      body: `${open}\n\n${close}`,
      whatsapp: `${open} ${close}`.replace(/\n\n/g, ' '),
    }
  }
  if (bucket === 'warm') {
    return {
      subject: 'Following up on your inquiry',
      body: `${open}\n\nI wanted to follow up and see if you still have questions or timing in mind.\n\n${close}`,
      whatsapp: `${open} Following up — still interested? ${close}`.replace(/\s+/g, ' ').trim(),
    }
  }
  return {
    subject: 'Staying in touch',
    body: `${open}\n\nI’ll keep this light: if now isn’t the right time, I can add you to our nurture sequence with useful updates and check back when you’re ready.\n\nReply anytime if you’d prefer to speak sooner.`,
    whatsapp: `${open} Happy to stay in touch with helpful updates — reply if you’d like to chat sooner.`,
  }
}

/**
 * @param {object} params
 * @param {Record<string, unknown>} params.lead
 * @param {string} params.channel — MESSAGE_CHANNEL.*
 */
export function generateSalesMessage({ lead, channel }) {
  const name = String(lead.name || 'there').trim() || 'there'
  const first = name.split(/\s+/)[0]
  const industry = lead.industries?.name ?? lead.industry_name ?? ''
  const businessType = lead.business_types?.name ?? lead.business_type_name ?? ''
  const vertical = detectVertical(industry, businessType)
  const cat = (lead.category || 'warm').toLowerCase()
  const bucket = cat === 'hot' ? 'hot' : cat === 'cold' ? 'cold' : 'warm'
  const urgency = lead.urgency

  const { subject, body, whatsapp } = categoryBlock(bucket, vertical)

  const greeting = channel === MESSAGE_CHANNEL.EMAIL ? `Hi ${first},` : `Hi ${first}!`
  const context =
    industry || businessType
      ? ` I saw your interest${industry ? ` in ${industry}` : ''}${businessType ? ` (${businessType})` : ''}.`
      : ''

  if (channel === MESSAGE_CHANNEL.WHATSAPP) {
    const u = urgencyPhrase(urgency)
    const core = `${greeting}${context} ${whatsapp}`.replace(/\s+/g, ' ').trim()
    return `${core} ${u}`.replace(/\s+/g, ' ').trim()
  }

  if (channel === MESSAGE_CHANNEL.EMAIL) {
    const u = urgencyPhrase(urgency)
    return {
      subject,
      body: `${greeting}${context}\n\n${body}\n\n${u}\n\nBest regards`,
    }
  }

  // Follow-up note (CRM-style, channel-agnostic script)
  return {
    subject: `Follow-up: ${first}`,
    body: `${greeting}${context}\n\n${body}\n\n${urgencyPhrase(urgency)}\n\nNext step: propose a specific time window and confirm preferred channel (call / WhatsApp / email).`,
  }
}

/**
 * Plain string for copy box (email and follow-up include subject line).
 * @param {object} params
 * @param {Record<string, unknown>} params.lead
 * @param {string} params.channel
 */
export function formatMessageForCopy({ lead, channel }) {
  const out = generateSalesMessage({ lead, channel })
  if (typeof out === 'string') return out
  if (out.subject && out.body) {
    return `Subject: ${out.subject}\n\n${out.body}`
  }
  return out.body || ''
}
