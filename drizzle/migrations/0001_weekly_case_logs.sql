alter table public.case_logs
  add column if not exists week_ending date;

alter table public.case_logs
  alter column month drop not null;

alter table public.case_logs
  drop constraint if exists case_logs_month_or_week;
alter table public.case_logs
  add constraint case_logs_month_or_week
  check ((month is null) <> (week_ending is null));

alter table public.case_logs
  drop constraint if exists case_logs_week_ends_sunday;
alter table public.case_logs
  add constraint case_logs_week_ends_sunday
  check (week_ending is null or extract(isodow from week_ending) = 7);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'case_logs_one_per_week') then
    alter table public.case_logs
      add constraint case_logs_one_per_week unique (employee_id, week_ending);
  end if;
end $$;

create index if not exists case_logs_employee_week_idx
  on public.case_logs (employee_id, week_ending desc);

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