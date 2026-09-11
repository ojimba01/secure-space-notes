-- The monthly HMIS Case Log, one per case manager per month.
--
-- The log is derived from client_contacts until somebody edits it, which is why
-- `entries` is nullable: null means "read it from the touchpoints", and a value
-- means a person has written their own account of the month down. Submitting
-- always writes the rows, because "submitted" has to name the thing that was
-- actually submitted rather than a query that keeps changing afterwards.
--
-- Idempotent. Running it twice changes nothing.

create table if not exists public.case_logs (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.profiles(id) on delete cascade,
  month         date not null,
  entries       jsonb,
  status        text not null default 'draft',
  submitted_at  timestamptz,
  submitted_by  uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint case_logs_status_check check (status in ('draft', 'submitted')),
  constraint case_logs_month_is_first check (extract(day from month) = 1),
  constraint case_logs_one_per_month unique (employee_id, month)
);

create index if not exists case_logs_employee_month_idx
  on public.case_logs (employee_id, month desc);

-- Keep updated_at honest; the app never sets it.
create or replace function public.touch_case_log()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists case_logs_touch on public.case_logs;
create trigger case_logs_touch
  before update on public.case_logs
  for each row execute function public.touch_case_log();

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------
-- A case manager owns their own logs and no one else's. Admins read every log,
-- which is the whole reason the feature exists: somebody has to check the
-- month before it is filed.
--
-- Note the shape of the update policy. Postgres applies a table's SELECT policy
-- to the NEW row of an UPDATE, so a policy that hid rows by status would make
-- it impossible to submit one. Nothing here reads `status`, on purpose.

alter table public.case_logs enable row level security;

drop policy if exists "Staff read their own case logs" on public.case_logs;
create policy "Staff read their own case logs"
  on public.case_logs for select
  using (employee_id = public.get_profile_id(auth.uid()));

drop policy if exists "Admins read every case log" on public.case_logs;
create policy "Admins read every case log"
  on public.case_logs for select
  using (public.is_admin(auth.uid()) or public.is_superadmin(auth.uid()));

drop policy if exists "Staff create their own case logs" on public.case_logs;
create policy "Staff create their own case logs"
  on public.case_logs for insert
  with check (employee_id = public.get_profile_id(auth.uid()));

drop policy if exists "Staff edit their own case logs" on public.case_logs;
create policy "Staff edit their own case logs"
  on public.case_logs for update
  using (employee_id = public.get_profile_id(auth.uid()))
  with check (employee_id = public.get_profile_id(auth.uid()));

-- Admins can reopen a log a case manager filed too early. They do not write
-- somebody else's rows; the author corrects it and files it again.
drop policy if exists "Admins edit any case log" on public.case_logs;
create policy "Admins edit any case log"
  on public.case_logs for update
  using (public.is_admin(auth.uid()) or public.is_superadmin(auth.uid()))
  with check (public.is_admin(auth.uid()) or public.is_superadmin(auth.uid()));

-- Nobody deletes a filed log. A month that happened stays on the record.

-- ---------------------------------------------------------------------------
-- Did it land? Expect one row saying true.
-- ---------------------------------------------------------------------------
select
  to_regclass('public.case_logs') is not null as table_exists,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'case_logs') as policy_count;
