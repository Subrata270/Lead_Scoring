import { supabase } from '../lib/supabaseClient'
import { calculateLeadScore, SCORING_DEFAULT_BUDGETS } from '../utils/leadScoring'
import { fetchScoringConfigRow } from '../hooks/useScoringConfig'
import { ACTIVITY_TYPES } from '../constants/activityTypes'
import { recordActivity } from './activityEngine'
import { recordInitialScore } from './rescoreLead'
import { resolveLeadAssignee, recordAssignmentOutcome } from './assignmentEngine'
import {
  createHotLeadNotification,
  createImportCompletedNotification,
} from './notificationService'
import { isHotCategory } from '../utils/leadHot'

const ALLOWED_SOURCES = new Set(['website', 'referral', 'ads', 'event', 'other', 'csv', 'api', 'public_form', 'hubspot'])
const ALLOWED_URGENCY = new Set(['low', 'medium', 'high'])

export function validateMappedRow(row, catalog) {
  const errors = []
  const { industryMap, businessTypeMap } = catalog

  if (!row.name?.trim()) errors.push('Name is required')
  if (!row.phone?.trim()) errors.push('Phone is required')
  if (!row.industry?.trim()) errors.push('Industry is required')
  else if (!industryMap.has(row.industry.trim().toLowerCase())) {
    errors.push(`Unknown industry: ${row.industry}`)
  }

  if (!row.business_type?.trim()) errors.push('Business type is required')
  else if (row.industry?.trim()) {
    const indKey = row.industry.trim().toLowerCase()
    const indId = industryMap.get(indKey)
    const btKey = `${indId}::${row.business_type.trim().toLowerCase()}`
    if (indId && !businessTypeMap.has(btKey)) {
      errors.push(`Unknown business type for industry: ${row.business_type}`)
    }
  }

  if (row.budget != null && row.budget !== '') {
    const b = Number(String(row.budget).replace(/[^\d.]/g, ''))
    if (!Number.isFinite(b) || b < 0) errors.push('Invalid budget')
  }

  return { valid: errors.length === 0, errors }
}

export async function loadIndustryCatalog(client) {
  const db = client ?? supabase
  const { data: industries } = await db.from('industries').select('id, name')
  const { data: businessTypes } = await db.from('business_types').select('id, name, industry_id')

  const industryMap = new Map()
  for (const ind of industries ?? []) {
    industryMap.set(ind.name.trim().toLowerCase(), ind.id)
  }

  const businessTypeMap = new Map()
  const industryNameById = Object.fromEntries((industries ?? []).map((i) => [i.id, i.name]))
  for (const bt of businessTypes ?? []) {
    const key = `${bt.industry_id}::${bt.name.trim().toLowerCase()}`
    businessTypeMap.set(key, { id: bt.id, industry_id: bt.industry_id, name: bt.name })
  }

  return { industryMap, businessTypeMap, industryNameById }
}

function normalizeSource(raw) {
  const s = String(raw || 'csv').trim().toLowerCase() || 'csv'
  return ALLOWED_SOURCES.has(s) ? s : 'csv'
}

function normalizeUrgency(raw) {
  const u = String(raw || 'medium').trim().toLowerCase()
  return ALLOWED_URGENCY.has(u) ? u : 'medium'
}

export async function fetchCsvImportHistory(
  organizationId,
  { limit = 10, offset = 0, sourceFilter = '' } = {},
) {
  let q = supabase
    .from('csv_imports')
    .select(
      'id, file_name, total_rows, imported_rows, failed_rows, created_at, created_by, source',
      { count: 'exact' },
    )
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })

  if (sourceFilter) {
    q = q.eq('source', sourceFilter)
  }

  q = q.range(offset, offset + limit - 1)

  const { data, error, count } = await q

  if (error?.message?.includes('source') || error?.code === '42703') {
    let fallbackQ = supabase
      .from('csv_imports')
      .select(
        'id, file_name, total_rows, imported_rows, failed_rows, created_at, created_by',
        { count: 'exact' },
      )
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
    if (sourceFilter) fallbackQ = fallbackQ.eq('source', sourceFilter)
    fallbackQ = fallbackQ.range(offset, offset + limit - 1)
    const fallback = await fallbackQ
    if (fallback.error) return { data: [], error: fallback.error, total: 0 }
    const enrichedFallback = (fallback.data ?? []).map((r) => ({
      ...r,
      source: 'csv',
      imported_by: '—',
      skipped_rows: r.failed_rows ?? 0,
    }))
    return { data: enrichedFallback, error: null, total: fallback.count ?? enrichedFallback.length }
  }

  const rows = data ?? []
  const creatorIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))]
  let nameById = {}

  if (creatorIds.length) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', creatorIds)
    nameById = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name]))
  }

  const enriched = rows.map((r) => ({
    ...r,
    source: r.source ?? 'csv',
    imported_by: nameById[r.created_by] ?? (r.created_by ? 'Team member' : '—'),
    skipped_rows: r.failed_rows ?? 0,
  }))

  return { data: enriched, error, total: count ?? enriched.length }
}

/**
 * Import valid mapped rows into leads.
 */
export async function bulkImportLeads({
  organizationId,
  userId,
  fileName,
  rows,
  catalog,
  rules,
}) {
  const imported = []
  const failed = []

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const { valid, errors } = validateMappedRow(row, catalog)
    if (!valid) {
      failed.push({ rowIndex: i + 1, row, errors })
      continue
    }

    try {
      const lead = await importSingleLead({
        row,
        organizationId,
        userId,
        catalog,
        rules,
      })
      imported.push(lead)
    } catch (err) {
      failed.push({ rowIndex: i + 1, row, errors: [err?.message ?? 'Import failed'] })
    }
  }

  const { data: importRecord, error: importErr } = await supabase
    .from('csv_imports')
    .insert({
      organization_id: organizationId,
      file_name: fileName,
      source: 'csv',
      total_rows: rows.length,
      imported_rows: imported.length,
      failed_rows: failed.length,
      created_by: userId,
    })
    .select()
    .single()

  if (importErr) {
    console.error('[csvImport] history record failed:', importErr.message)
  }

  if (imported.length > 0) {
    await createImportCompletedNotification(
      {
        organizationId,
        userId,
        fileName,
        importedCount: imported.length,
        failedCount: failed.length,
        importId: importRecord?.id,
      },
      supabase,
    )
  }

  return { imported, failed, importRecord }
}

async function importSingleLead({ row, organizationId, userId, catalog, rules }) {
  const { industryMap, businessTypeMap, industryNameById } = catalog

  const industryId = industryMap.get(row.industry.trim().toLowerCase())
  const btKey = `${industryId}::${row.business_type.trim().toLowerCase()}`
  const bt = businessTypeMap.get(btKey)
  const industryName = industryNameById[industryId]

  const budget =
    row.budget != null && row.budget !== ''
      ? Number(String(row.budget).replace(/[^\d.]/g, '')) || 0
      : 0

  const { row: configRow } = await fetchScoringConfigRow(
    industryId,
    bt.id,
    organizationId,
  )

  const highBudget = configRow?.high_budget ?? SCORING_DEFAULT_BUDGETS.highBudget
  const mediumBudget = configRow?.medium_budget ?? SCORING_DEFAULT_BUDGETS.mediumBudget

  const source = normalizeSource(row.source)
  const urgency = normalizeUrgency(row.urgency)

  const { score, category } = calculateLeadScore({
    source,
    responded: false,
    budget,
    urgency,
    highBudget,
    mediumBudget,
  })

  const draftLead = {
    source,
    budget,
    urgency,
    industry_id: industryId,
    business_type_id: bt.id,
  }

  const { assignee, matchedRule, method } = await resolveLeadAssignee(
    {
      lead: draftLead,
      industryName,
      organizationId,
      rules,
    },
    supabase,
  )

  const leadRow = {
    name: row.name.trim(),
    phone: row.phone.trim(),
    email: row.email?.trim() || null,
    source,
    budget,
    urgency,
    responded: false,
    industry_id: industryId,
    business_type_id: bt.id,
    score,
    category,
    status: 'new',
    assigned_to: assignee,
    organization_id: organizationId,
    created_by: userId,
  }

  const { data: inserted, error } = await supabase.from('leads').insert(leadRow).select().single()
  if (error) throw error

  await recordActivity({
    leadId: inserted.id,
    organizationId,
    userId,
    activityType: ACTIVITY_TYPES.LEAD_CREATED,
    description: `Lead created: ${inserted.name}`,
    metadata: { source, score, category, via: 'csv' },
  })

  await recordActivity({
    leadId: inserted.id,
    organizationId,
    userId,
    activityType: ACTIVITY_TYPES.CSV_IMPORTED,
    description: `Lead imported from CSV`,
    metadata: { file_field: row.name },
  })

  await recordInitialScore(inserted, userId)

  if (assignee) {
    await recordAssignmentOutcome(
      {
        lead: inserted,
        assignee,
        matchedRule,
        organizationId,
        userId,
        method,
      },
      supabase,
    )
  }

  if (isHotCategory(category)) {
    await createHotLeadNotification(inserted)
  }

  return inserted
}
