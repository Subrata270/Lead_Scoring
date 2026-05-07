-- Reference schema expectations for Supabase Auth + multi-tenant CRM (run/adjust in Dashboard SQL editor).
-- Tables may already exist in your project; align policies with your security model.

-- Expected shapes (examples — adjust types/names to match your project):
--
-- create table public.organizations (
--   id uuid primary key default gen_random_uuid(),
--   name text not null,
--   created_at timestamptz not null default now()
-- );
--
-- create table public.profiles (
--   id uuid primary key references auth.users (id) on delete cascade,
--   full_name text,
--   role text not null default 'salesperson' check (role in ('admin','manager','salesperson')),
--   organization_id uuid not null references public.organizations (id) on delete cascade,
--   created_at timestamptz not null default now()
-- );
--
-- alter table public.leads add column if not exists organization_id uuid references public.organizations (id);
-- alter table public.leads add column if not exists created_by uuid references auth.users (id);
-- alter table public.tasks add column if not exists organization_id uuid references public.organizations (id);
-- alter table public.tasks add column if not exists created_by uuid references auth.users (id);
-- alter table public.scoring_configs add column if not exists organization_id uuid references public.organizations (id);

-- Unique scoring config per org + catalog keys:
-- create unique index if not exists scoring_configs_org_industry_bt_uidx
--   on public.scoring_configs (organization_id, industry_id, business_type_id);

-- RLS (outline): enable RLS on leads, tasks, scoring_configs, profiles, organizations.
-- Typical rule: select/insert/update where organization_id = (select organization_id from profiles where id = auth.uid());
-- Salesperson variant for leads: add condition assigned_to = (select full_name from profiles where id = auth.uid()).

-- Sign-up inserts from the SPA require policies allowing:
-- - authenticated user to insert their organization during registration (often handled via server/trigger instead), or
-- - service role only for org/profile provisioning via Edge Function.
