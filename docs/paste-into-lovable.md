Please run the following SQL against this project's database.

Do not change any application code, do not create or edit any React components,
and do not add anything to the app's UI. The code that uses these tables is
already on a branch and will be merged separately. Run the SQL exactly as
written, then tell me the numbers each SELECT returns.

It is safe to run twice — the second run changes nothing.

```sql
-- ===========================================================================
-- PART 1 of 2 — clear the old auto-scheduled touchpoints
-- ===========================================================================
-- ---------------------------------------------------------------------------
-- Before: what is about to go, and what is being kept
-- ---------------------------------------------------------------------------
select
  count(*) filter (
    where e.is_auto_generated
      and not e.is_manually_adjusted
      and not exists (
        select 1 from public.client_contacts c where c.calendar_event_id = e.id
      )
      and not exists (
        select 1 from public.client_contacts c
         where c.client_id = e.client_id
           and c.contact_date = (e.start_time at time zone 'America/New_York')::date
      )
  ) as will_be_deleted,
  count(*) filter (where e.is_manually_adjusted)   as kept_because_moved_by_hand,
  count(*) filter (where not e.is_auto_generated)  as kept_because_entered_by_a_person
from public.calendar_events e
where e.event_type = 'touch_point'
  and (e.start_time at time zone 'America/New_York')::date < date '2026-09-01';

-- ---------------------------------------------------------------------------
-- Delete them
-- ---------------------------------------------------------------------------
delete from public.calendar_events e
 where e.event_type = 'touch_point'
   and e.is_auto_generated
   and not e.is_manually_adjusted
   and (e.start_time at time zone 'America/New_York')::date < date '2026-09-01'
   and not exists (
     select 1 from public.client_contacts c where c.calendar_event_id = e.id
   )
   and not exists (
     select 1 from public.client_contacts c
      where c.client_id = e.client_id
        and c.contact_date = (e.start_time at time zone 'America/New_York')::date
   );

-- ---------------------------------------------------------------------------
-- After: expect 0. Running this script again is a no-op.
-- ---------------------------------------------------------------------------
select count(*) as unworked_suggestions_remaining
  from public.calendar_events e
 where e.event_type = 'touch_point'
   and e.is_auto_generated
   and not e.is_manually_adjusted
   and (e.start_time at time zone 'America/New_York')::date < date '2026-09-01'
   and not exists (
     select 1 from public.client_contacts c where c.calendar_event_id = e.id
   )
   and not exists (
     select 1 from public.client_contacts c
      where c.client_id = e.client_id
        and c.contact_date = (e.start_time at time zone 'America/New_York')::date
   );

-- ===========================================================================
-- PART 2 of 2 — the monthly HMIS Case Log
-- ===========================================================================
-- One log per case manager per month. `entries` is nullable on purpose: null
-- means the rows are read live from the touchpoints already logged in the app,
-- and a value means a person has written their own account of the month down.
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
```
