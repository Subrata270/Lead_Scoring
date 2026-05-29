export const RULE_TYPES = {
  INDUSTRY: 'industry',
  BUDGET: 'budget',
  SOURCE: 'source',
}

export const RULE_TYPE_LABELS = {
  [RULE_TYPES.INDUSTRY]: 'Industry based',
  [RULE_TYPES.BUDGET]: 'Budget based',
  [RULE_TYPES.SOURCE]: 'Source based',
}

export const CRM_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'phone', label: 'Phone', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'budget', label: 'Budget', required: false },
  { key: 'urgency', label: 'Urgency', required: false },
  { key: 'source', label: 'Source', required: false },
  { key: 'industry', label: 'Industry', required: true },
  { key: 'business_type', label: 'Business type', required: true },
]

export const FIELD_ALIASES = {
  name: ['name', 'customer name', 'full name', 'lead name', 'contact name'],
  phone: ['phone', 'mobile', 'mobile number', 'phone number', 'tel', 'contact'],
  email: ['email', 'e-mail', 'email address'],
  budget: ['budget', 'budget amount', 'amount', 'deal value'],
  urgency: ['urgency', 'priority'],
  source: ['source', 'lead source', 'channel'],
  industry: ['industry', 'sector', 'vertical'],
  business_type: ['business type', 'business_type', 'type', 'segment'],
}
