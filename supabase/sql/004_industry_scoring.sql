-- Industry-based scoring: run in Supabase SQL editor (or migrate).
-- Adjust RLS policies for your project; anon access is not configured here.

create table if not exists public.industries (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.business_types (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid not null references public.industries (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index if not exists business_types_industry_id_idx on public.business_types (industry_id);

create table if not exists public.scoring_configs (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid not null references public.industries (id) on delete cascade,
  business_type_id uuid not null references public.business_types (id) on delete cascade,
  high_budget numeric not null default 50000,
  medium_budget numeric not null default 20000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint scoring_configs_medium_lte_high check (medium_budget <= high_budget)
);

create unique index if not exists scoring_configs_industry_business_uidx
  on public.scoring_configs (industry_id, business_type_id);

alter table public.leads
  add column if not exists industry_id uuid references public.industries (id) on delete set null;

alter table public.leads
  add column if not exists business_type_id uuid references public.business_types (id) on delete set null;

create index if not exists leads_industry_id_idx on public.leads (industry_id);
create index if not exists leads_business_type_id_idx on public.leads (business_type_id);

-- Optional sample rows (uncomment after tables exist):
-- insert into public.industries (name) values ('Software') on conflict (name) do nothing;
-- insert into public.business_types (industry_id, name)
--   select i.id, 'SaaS' from public.industries i where i.name = 'Software' limit 1;
