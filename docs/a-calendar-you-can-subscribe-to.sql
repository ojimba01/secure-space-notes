-- A calendar a case manager can subscribe to from Outlook, Google or Apple.
--
-- NOT YET APPLIED. Run this, then deploy the calendar-feed edge function.
--
-- The app's calendar is the only place a touchpoint appears, so it is the only
-- place anyone can be reminded by it. This publishes one read-only feed per
-- person, at a secret URL they can paste into whatever calendar they already
-- live in. Their calendar app re-fetches it on its own schedule -- hours, not
-- seconds, and not something we control -- so the feed is a reminder, never
-- the record.
--
-- The URL is the credential. Anyone holding it reads that person's calendar
-- without signing in, which is why:
--
--   * it is off until somebody turns it on, and one click revokes it;
--   * client names are OFF by default. A subscribed feed is fetched by
--     Google's or Microsoft's servers, and a personal gmail.com or
--     outlook.com account is covered by no BAA at all. Redacted, an event
--     says "Touchpoint (In person)" and nothing about who;
--   * administrators cannot read these rows. An admin can already see every
--     event in the app, so this is not about hiding the work -- it is that a
--     token is a credential, and one account being able to read another's
--     credential is how a leak becomes untraceable.

create table if not exists public.calendar_feed_subscriptions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  -- Off by default, and deliberately a decision a person has to make.
  show_client_names boolean not null default false,
  created_at timestamptz not null default now(),
  -- So a person can see their feed is being read, and roughly by how often.
  -- A link that was never meant to be shared being fetched hourly from
  -- somewhere is the one signal that it leaked.
  last_accessed_at timestamptz,
  access_count integer not null default 0
);

create index if not exists idx_calendar_feed_token
  on public.calendar_feed_subscriptions(token);

grant select, insert, update, delete on public.calendar_feed_subscriptions to authenticated;
grant all on public.calendar_feed_subscriptions to service_role;
alter table public.calendar_feed_subscriptions enable row level security;

-- Yours and nobody else's -- no admin branch, on purpose (see the header).
drop policy if exists "A person manages their own calendar feed"
  on public.calendar_feed_subscriptions;
create policy "A person manages their own calendar feed"
  on public.calendar_feed_subscriptions for all to authenticated
  using (profile_id = public.get_profile_id(auth.uid()))
  with check (profile_id = public.get_profile_id(auth.uid()));

-- Turning it on, and turning it over.
--
-- One function for both: switching a leaked link off is the same act as
-- getting a working one back, and a person who has just realised they pasted
-- the link somewhere public should not have to find two buttons.

create or replace function public.rotate_calendar_feed_token()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _profile uuid := public.get_profile_id(auth.uid());
  _token uuid;
begin
  if _profile is null then
    raise exception 'Not signed in';
  end if;

  insert into public.calendar_feed_subscriptions (profile_id)
       values (_profile)
  on conflict (profile_id) do update
          set token = gen_random_uuid(),
              created_at = now(),
              last_accessed_at = null,
              access_count = 0
    returning token into _token;

  return _token;
end;
$$;

revoke all on function public.rotate_calendar_feed_token() from public;
grant execute on function public.rotate_calendar_feed_token() to authenticated;

-- Expect: table 1, policy 1, function 1, and no subscriptions yet.
select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'calendar_feed_subscriptions') as table_present,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'calendar_feed_subscriptions')                               as policies,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rotate_calendar_feed_token')      as rotate_fn,
  (select count(*) from public.calendar_feed_subscriptions)                       as subscriptions;
