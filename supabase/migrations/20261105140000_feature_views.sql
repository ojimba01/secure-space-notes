-- What's new: when each person was told about a new feature, and when they
-- first saw its "New" ribbon (src/lib/whatsNew.ts). Each person reads and
-- writes only their own rows.

create table if not exists public.feature_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  feature text not null,
  notified_at timestamptz,
  first_seen_at timestamptz,
  primary key (user_id, feature)
);

alter table public.feature_views enable row level security;

drop policy if exists "Own feature views: read" on public.feature_views;
create policy "Own feature views: read" on public.feature_views
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Own feature views: add" on public.feature_views;
create policy "Own feature views: add" on public.feature_views
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Own feature views: update" on public.feature_views;
create policy "Own feature views: update" on public.feature_views
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.feature_views to authenticated;
