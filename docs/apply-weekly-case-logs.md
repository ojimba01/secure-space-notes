# Applying the weekly case log migration through Lovable

The HMIS Case Log went from monthly to weekly. The app's code for that is on
the branch; this is the database half, and it has to run **before** the branch
merges — the new code reads and writes `case_logs.week_ending`, which does not
exist until this runs.

Paste everything below the line into Lovable's chat, in one message. Same
approach as `docs/lovable-apply-migrations.md`: it tells Lovable to run SQL
and change nothing else, because the screens are already written.

---

Please run the following SQL against this project's database. Do not change any
application code, do not create or edit any React components, and do not add
anything to the app's UI — the screens that use this column already exist on a
branch and will be merged separately. Run the SQL exactly as written and tell
me the result of the final select.

The SQL is idempotent, so it is safe if any part has already been applied.

```sql
alter table public.case_logs
  add column if not exists week_ending date;

alter table public.case_logs
  alter column month drop not null;

-- A row is a month or a week, never both and never neither.
alter table public.case_logs
  drop constraint if exists case_logs_month_or_week;
alter table public.case_logs
  add constraint case_logs_month_or_week
  check ((month is null) <> (week_ending is null));

-- A work week runs Monday to Sunday, so every week ends on a Sunday.
alter table public.case_logs
  drop constraint if exists case_logs_week_ends_sunday;
alter table public.case_logs
  add constraint case_logs_week_ends_sunday
  check (week_ending is null or extract(isodow from week_ending) = 7);

-- One log per person per week. Not a partial index: the app upserts on
-- (employee_id, week_ending), which needs a real unique constraint, and
-- monthly rows carry a null week_ending, which never collides.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'case_logs_one_per_week') then
    alter table public.case_logs
      add constraint case_logs_one_per_week unique (employee_id, week_ending);
  end if;
end $$;

create index if not exists case_logs_employee_week_idx
  on public.case_logs (employee_id, week_ending desc);

-- Carry hand-edited months into their weeks.
insert into public.case_logs (employee_id, week_ending, entries)
select
  l.employee_id,
  (date_trunc('week', (e ->> 'date')::date) + interval '6 days')::date as week_ending,
  jsonb_agg(e order by e ->> 'date')
from public.case_logs l
cross join lateral jsonb_array_elements(l.entries) as e
where l.month is not null
  and l.entries is not null
  and jsonb_typeof(l.entries) = 'array'
  and coalesce(e ->> 'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
group by l.employee_id, 2
on conflict (employee_id, week_ending) do nothing;

-- ---------------------------------------------------------------------------
-- Did it land? Expect week_ending_exists true and the monthly count unchanged.
-- ---------------------------------------------------------------------------
select
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'case_logs'
            and column_name = 'week_ending') as week_ending_exists,
  (select count(*) from public.case_logs where month is not null) as monthly_logs,
  (select count(*) from public.case_logs where week_ending is not null) as weekly_logs;
```
