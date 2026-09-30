-- Touchpoint reminders: an administrator asks a case manager to complete a
-- client's touchpoint, and it pops up for them when they open Clients.
--
-- A reminder stays open until the case manager logs a touchpoint for that
-- client (closed automatically, below) or says it has been completed. "Remind
-- me later" hides it for a few hours.
--
-- Idempotent. Running it twice changes nothing.

create table if not exists public.touchpoint_reminders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  -- The case manager being reminded.
  employee_id uuid not null references public.profiles(id) on delete cascade,
  sent_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  snoozed_until timestamptz,
  completed_at timestamptz,
  -- 'logged': a touchpoint was recorded. 'marked_done': the case manager said
  -- it had already been completed.
  completed_how text check (completed_how is null or completed_how in ('logged', 'marked_done'))
);

create index if not exists touchpoint_reminders_open
  on public.touchpoint_reminders (employee_id)
  where completed_at is null;

alter table public.touchpoint_reminders enable row level security;

drop policy if exists "Admins manage touchpoint reminders" on public.touchpoint_reminders;
create policy "Admins manage touchpoint reminders"
  on public.touchpoint_reminders for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

drop policy if exists "Case managers see their reminders" on public.touchpoint_reminders;
create policy "Case managers see their reminders"
  on public.touchpoint_reminders for select
  using (employee_id in (select id from public.profiles where user_id = auth.uid()));

drop policy if exists "Case managers answer their reminders" on public.touchpoint_reminders;
create policy "Case managers answer their reminders"
  on public.touchpoint_reminders for update
  using (employee_id in (select id from public.profiles where user_id = auth.uid()))
  with check (employee_id in (select id from public.profiles where user_id = auth.uid()));

-- Logging a touchpoint for a client closes any reminder about that client.
create or replace function public.close_touchpoint_reminders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.touchpoint_reminders
  set completed_at = now(), completed_how = 'logged'
  where client_id = new.client_id
    and completed_at is null;
  return new;
end;
$$;

drop trigger if exists close_touchpoint_reminders on public.client_contacts;
create trigger close_touchpoint_reminders
  after insert on public.client_contacts
  for each row execute function public.close_touchpoint_reminders();
