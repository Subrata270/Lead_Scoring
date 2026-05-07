-- Allow automated warm-lead tasks from the public lead API.
alter table public.tasks drop constraint if exists tasks_task_type_check;

alter table public.tasks
  add constraint tasks_task_type_check
  check (task_type in ('call', 'message', 'visit', 'follow-up'));
