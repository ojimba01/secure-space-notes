create table if not exists public.calendar_feed_subscriptions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz,
  access_count integer not null default 0
);

create index if not exists idx_calendar_feed_token
  on public.calendar_feed_subscriptions(token);

grant select, insert, update, delete on public.calendar_feed_subscriptions to authenticated;
grant all on public.calendar_feed_subscriptions to service_role;
alter table public.calendar_feed_subscriptions enable row level security;

drop policy if exists "A person manages their own calendar feed"
  on public.calendar_feed_subscriptions;
create policy "A person manages their own calendar feed"
  on public.calendar_feed_subscriptions for all to authenticated
  using (profile_id = public.get_profile_id(auth.uid()))
  with check (profile_id = public.get_profile_id(auth.uid()));

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

select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'calendar_feed_subscriptions') as table_present,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'calendar_feed_subscriptions')                               as policies,
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rotate_calendar_feed_token')      as rotate_fn,
  (select count(*) from public.calendar_feed_subscriptions)                       as subscriptions;