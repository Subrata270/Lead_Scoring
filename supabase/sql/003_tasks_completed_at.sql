-- Optional: exact task completion time for lead timelines.
alter table public.tasks
  add column if not exists completed_at timestamptz;
