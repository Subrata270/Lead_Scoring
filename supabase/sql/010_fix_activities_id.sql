-- Fix broken activities.id foreign key.
-- activities.id was incorrectly constrained to profiles(id), so inserts with
-- gen_random_uuid() failed with: activities_id_fkey — Key (id) not in profiles.
-- Run this in the Supabase SQL editor.

alter table public.activities
  drop constraint if exists activities_id_fkey;

alter table public.activities
  alter column id set default gen_random_uuid();
