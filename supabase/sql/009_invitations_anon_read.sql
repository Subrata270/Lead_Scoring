-- Allow unauthenticated signup page to read a pending invitation by UUID (invite link).
-- Run in Supabase SQL editor if invite lookup returns null for anon users in production.

alter table public.invitations enable row level security;

drop policy if exists "anon_read_pending_invitation_by_id" on public.invitations;
create policy "anon_read_pending_invitation_by_id"
  on public.invitations
  for select
  to anon, authenticated
  using (lower(status) = 'pending');
