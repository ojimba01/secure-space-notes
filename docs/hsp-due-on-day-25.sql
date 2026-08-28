-- The Housing Stabilization Plan is due on day 25, not day 30.
--
-- Applied to production 2026-08-28.
--
-- The initial authorization runs 30 days and is billed as 30 days. The plan
-- has to be submitted by the 25th of them. Those are different deadlines, and
-- the shorter one is the only one staff can act on: a plan submitted on day 28
-- is late even though the authorization is still running.
--
-- Counted inclusively — day 1 is the authorization's own start date — so the
-- due date is auth_30_start + 24.
--
-- Before: 142 clients had a 30-day start, 133 of them had no due date at all,
-- and the 9 that did were computed on the old 30-day basis. None matched.

-- hsp_start_date and hsp_end_date were added earlier the same day and never
-- used. A plan has a deadline, not a period, so they go.
alter table public.clients
  drop column if exists hsp_start_date,
  drop column if exists hsp_end_date;

update public.clients
   set hsp_due_date = auth_30_start + 24
 where deleted_at is null
   and auth_30_start is not null
   and (hsp_due_date is null or hsp_due_date <> auth_30_start + 24);

-- Expect: with_start = due_date_correct, still_null = 0.
select
  count(*) filter (where auth_30_start is not null) as with_start,
  count(*) filter (where auth_30_start is not null and hsp_due_date = auth_30_start + 24) as due_date_correct,
  count(*) filter (where auth_30_start is not null and hsp_due_date is null) as still_null
from public.clients where deleted_at is null;
