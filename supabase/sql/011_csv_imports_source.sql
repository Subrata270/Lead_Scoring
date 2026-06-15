-- Add source label to import history (run in Supabase SQL editor)

alter table public.csv_imports
  add column if not exists source text not null default 'csv';

create index if not exists csv_imports_org_created_idx
  on public.csv_imports (organization_id, created_at desc);
