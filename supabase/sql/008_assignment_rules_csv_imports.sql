-- Assignment rules + CSV import history (run in Supabase SQL editor)

create table if not exists public.assignment_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_type text not null check (rule_type in ('industry', 'budget', 'source')),
  condition_field text not null,
  condition_value text not null,
  assigned_user text not null,
  created_at timestamptz not null default now()
);

create index if not exists assignment_rules_org_idx on public.assignment_rules (organization_id);

create table if not exists public.csv_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  failed_rows integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists csv_imports_org_idx on public.csv_imports (organization_id);
