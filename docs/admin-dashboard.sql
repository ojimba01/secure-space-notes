-- What Shade's dashboard needs to know.
--
-- NOT YET APPLIED. Run this before merging the code change that goes with it.
--
-- Three questions, from Shade on 2026-08-28: are staff doing their touchpoints,
-- which billing cycles are running out of time to submit, and are Housing
-- Stabilization Plans going in on time. Two of the three already have their
-- data. This adds what the third needs, and what a staged rollout needs.

-- ---------------------------------------------------------------------------
-- 1. When a plan was submitted, recorded without anybody typing a date
-- ---------------------------------------------------------------------------
-- `hsp_submitted` is a yes or no. It can say a plan went in; it cannot say
-- whether it went in by day 25, which is the question actually being asked
-- about staff.
--
-- The timestamp is written by a trigger rather than by the screens, because
-- the flag is set from three places: the billing grid, the document reader
-- when it finds a 150 or 180-day authorization number, and SQL. A trigger
-- catches all three and cannot be forgotten by a fourth.
--
-- Existing rows keep a null timestamp. That means "submitted, date unknown",
-- which is the truth: nothing recorded it at the time and inventing one would
-- make every plan look punctual.

alter table public.clients
  add column if not exists hsp_submitted_at timestamptz;

create or replace function public.stamp_hsp_submitted()
returns trigger
language plpgsql
as $$
begin
  -- Only the transition into true. Editing an already-submitted client must
  -- not move the date, or the record of when it happened is lost.
  if new.hsp_submitted is true
     and (tg_op = 'INSERT' or old.hsp_submitted is distinct from true)
     and new.hsp_submitted_at is null then
    new.hsp_submitted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_hsp_submitted on public.clients;
create trigger stamp_hsp_submitted
  before insert or update on public.clients
  for each row execute function public.stamp_hsp_submitted();

-- ---------------------------------------------------------------------------
-- 2. Touchpoints start per person, not for everybody on the same day
-- ---------------------------------------------------------------------------
-- On 2026-09-01, 159 touchpoints fall due across 111 clients and not one
-- touchpoint has ever been logged, because nobody has been shown how. Turning
-- that on at once would tell every case manager they are already behind.
--
-- The obligation stays real: the events exist and are counted, and no client
-- is hidden from the person carrying them. What is staged is expectation.
-- Before a case manager's go-live date their clients read "not yet expected"
-- rather than "overdue", and Shade sets that date once they have been trained.
--
-- Deliberately not per client. An opt-in a case manager makes one client at a
-- time would mean a client nobody opens is a client nobody is answerable for,
-- which is the caseload bug that hid 22 clients from their own case managers.

alter table public.profiles
  add column if not exists touchpoint_go_live_date date,
  add column if not exists touchpoint_tutorial_acknowledged_at timestamptz;

comment on column public.profiles.touchpoint_go_live_date is
  'The day this person''s touchpoints begin to count. Null means not yet started. Set by an administrator.';
comment on column public.profiles.touchpoint_tutorial_acknowledged_at is
  'When this person confirmed they have been shown how touchpoints work. Set by them, once.';

-- Existing policies already cover both: staff update their own profile, which
-- is the acknowledgement, and admins update any profile, which is the date.

-- Expect: hsp_submitted_at 1, go_live 1, acknowledged 1, trigger 1,
-- and already_submitted showing how many clients carry an unknown date.
select
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='clients' and column_name='hsp_submitted_at') as hsp_submitted_at,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='touchpoint_go_live_date') as go_live,
  (select count(*) from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='touchpoint_tutorial_acknowledged_at') as acknowledged,
  (select count(*) from pg_trigger where tgname='stamp_hsp_submitted') as trigger_present,
  (select count(*) from public.clients where hsp_submitted is true and hsp_submitted_at is null) as already_submitted;
