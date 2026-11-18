-- Intake calls: a new client waits for their intake call until someone
-- reaches them. Each call made is recorded, answered or not, so a supervisor
-- can see who has been called and how often.
--
-- clients.intake_call_status
--   'awaiting'  added or assigned, the intake call has not reached them yet
--   'reached'   the call was answered and the intake started
--   null        clients from before this existed, and everyone since reached
alter table public.clients
  add column if not exists intake_call_status text
  check (intake_call_status in ('awaiting', 'reached'));

create table if not exists public.intake_calls (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  called_by uuid references public.profiles(id) on delete set null,
  called_at timestamptz not null default now(),
  outcome text not null check (outcome in ('no_answer', 'voicemail', 'wrong_number', 'not_in_service', 'answered')),
  created_at timestamptz not null default now()
);
create index if not exists intake_calls_client on public.intake_calls (client_id, called_at desc);

alter table public.intake_calls enable row level security;

drop policy if exists "Staff read calls on their clients" on public.intake_calls;
create policy "Staff read calls on their clients" on public.intake_calls
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.is_assigned_to_client(auth.uid(), client_id));

drop policy if exists "Staff record calls on their clients" on public.intake_calls;
create policy "Staff record calls on their clients" on public.intake_calls
  for insert to authenticated
  with check (
    called_by = public.get_profile_id(auth.uid())
    and (public.is_admin(auth.uid()) or public.is_assigned_to_client(auth.uid(), client_id))
  );

drop policy if exists "Admins remove calls" on public.intake_calls;
create policy "Admins remove calls" on public.intake_calls
  for delete to authenticated using (public.is_admin(auth.uid()));

-- Starting a Client Intake means the call was answered, however the form was
-- opened.
create or replace function public.mark_intake_call_reached()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.form_type = 'Client Intake' then
    update public.clients set intake_call_status = 'reached'
    where id = new.client_id and intake_call_status = 'awaiting';
  end if;
  return new;
end;
$$;

drop trigger if exists client_intake_marks_call_reached on public.client_forms;
create trigger client_intake_marks_call_reached
  after insert on public.client_forms
  for each row execute function public.mark_intake_call_reached();

-- The active clients with no forms at all have not had their intake.
update public.clients c set intake_call_status = 'awaiting'
where c.status = 'active' and c.deleted_at is null and c.intake_call_status is null
  and not exists (select 1 from public.client_forms f where f.client_id = c.id);
