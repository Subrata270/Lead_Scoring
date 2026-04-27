-- Run in Supabase SQL editor if the tasks table does not exist yet.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  task_type text not null check (task_type in ('call', 'message', 'visit')),
  due_date timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists tasks_lead_id_idx on public.tasks (lead_id);
create index if not exists tasks_due_date_idx on public.tasks (due_date);
