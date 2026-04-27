-- In Supabase Dashboard: Database → Replication → enable `leads` for `supabase_realtime` if needed.
--
-- Optional: store when status first moved off "new" (bonus: time to first action).
alter table public.leads
  add column if not exists first_status_changed_at timestamptz;

-- So Realtime UPDATE payloads include the previous row (for hot-transition detection).
alter table public.leads replica identity full;
