-- ============================================================
-- Which clients have a 150-day authorization that starts inside the
-- initial 30-day period?
--
-- Cycle 1 runs the full 30 days from auth_30_start. A continuation that
-- starts before that period ends covers the same days twice, and every
-- cycle after it is shifted. The usual cause is entering the date the
-- initial period ENDED as the date the continuation began.
--
-- Read-only. Run it in the Supabase SQL editor.
-- ============================================================

select
  first_name,
  last_name,
  auth_30_start                       as initial_start,
  auth_30_start + 29                  as initial_ends,
  auth_150_start                      as continuation_start,
  auth_150_start - auth_30_start      as days_after_initial_start,
  case
    when auth_150_start = auth_30_start + 29 then 'Starts on the initial period''s last day — the classic mistake'
    when auth_150_start = auth_30_start      then 'Same day: one continuous run, no separate initial cycle'
    when auth_150_start = auth_30_start + 30 then 'Day after the initial period: clean handoff'
    else 'Starts inside the initial period'
  end as reading
from public.clients
where deleted_at is null
  and status = 'active'
  and auth_30_start is not null
  and auth_150_start is not null
  and auth_150_start > auth_30_start
  and auth_150_start < auth_30_start + 30
order by last_name, first_name;

-- How many clients fall into each pattern, including the healthy ones.
select
  case
    when auth_150_start is null then 'No continuation recorded'
    when auth_150_start = auth_30_start then 'Same day as the initial period'
    when auth_150_start = auth_30_start + 29 then 'Initial period''s LAST day — suspect'
    when auth_150_start = auth_30_start + 30 then 'Day after the initial period'
    when auth_150_start > auth_30_start and auth_150_start < auth_30_start + 30
      then 'Somewhere inside the initial period — suspect'
    when auth_150_start > auth_30_start + 30 then 'A gap after the initial period'
    else 'Before the initial period'
  end as pattern,
  count(*)
from public.clients
where deleted_at is null and status = 'active' and auth_30_start is not null
group by 1
order by 2 desc;
