create table if not exists public.staff_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('page', 'task')),
  area text not null,
  label text not null,
  client_id uuid references public.clients(id) on delete set null,
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active_seconds integer not null default 0,
  outcome text check (outcome is null or outcome in ('completed', 'draft', 'closed'))
);
create index if not exists staff_activity_user_started on public.staff_activity (user_id, started_at desc);
create index if not exists staff_activity_started on public.staff_activity (started_at desc);
alter table public.staff_activity enable row level security;
drop policy if exists "Superadmins read staff activity" on public.staff_activity;
create policy "Superadmins read staff activity" on public.staff_activity for select
  using (public.is_superadmin(auth.uid()));

create or replace function public.start_staff_activity(_kind text, _area text, _label text, _client_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if auth.uid() is null then return null; end if;
  insert into public.staff_activity (user_id, profile_id, kind, area, label, client_id)
  values (auth.uid(), (select id from public.profiles where user_id = auth.uid() limit 1),
          _kind, left(_area, 60), left(_label, 200), (select id from public.clients where id = _client_id))
  returning id into _id;
  return _id;
end; $$;

create or replace function public.touch_staff_activity(_id uuid, _add_seconds integer, _outcome text default null)
returns void language sql security definer set search_path = public as $$
  update public.staff_activity
  set last_seen_at = now(),
      active_seconds = active_seconds + greatest(0, least(coalesce(_add_seconds, 0), 120)),
      outcome = coalesce(_outcome, outcome)
  where id = _id and user_id = auth.uid() and started_at > now() - interval '1 day';
$$;

revoke all on function public.start_staff_activity(text, text, text, uuid) from public, anon;
revoke all on function public.touch_staff_activity(uuid, integer, text) from public, anon;
grant execute on function public.start_staff_activity(text, text, text, uuid) to authenticated;
grant execute on function public.touch_staff_activity(uuid, integer, text) to authenticated;

drop function if exists public.staff_activity_changes(timestamptz, timestamptz);
create or replace function public.staff_activity_changes(_from timestamptz, _to timestamptz, _client_id uuid default null)
returns table (id uuid, created_at timestamptz, user_id uuid, action text, table_name text,
               record_id uuid, client_id uuid, changed text[], details jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.created_at, a.user_id, a.action::text, a.table_name, a.record_id,
    case when a.table_name = 'clients' then a.record_id
         else nullif(coalesce(a.new_data, a.old_data) ->> 'client_id', '')::uuid end,
    case when a.action::text = 'UPDATE' then array(
      select n.key from jsonb_each(a.new_data) n where n.value is distinct from (a.old_data -> n.key)) end,
    jsonb_strip_nulls(jsonb_build_object(
      'form_type', d ->> 'form_type', 'title', d ->> 'title', 'file_name', d ->> 'file_name',
      'source', d ->> 'source', 'status', d ->> 'status', 'old_status', a.old_data ->> 'status',
      'external_status', d ->> 'external_status', 'old_external_status', a.old_data ->> 'external_status',
      'touchpoint_type', d ->> 'touchpoint_type', 'modality', d ->> 'modality', 'contact_date', d ->> 'contact_date',
      'first_name', case when a.table_name = 'clients' then d ->> 'first_name' end,
      'last_name', case when a.table_name = 'clients' then d ->> 'last_name' end))
  from public.audit_logs a
  cross join lateral (select coalesce(a.new_data, a.old_data) as d) x
  where (public.is_superadmin(auth.uid()) or (_client_id is not null and public.is_admin(auth.uid())))
    and a.user_id is not null
    and (_client_id is null
         or (a.table_name = 'clients' and a.record_id = _client_id)
         or (coalesce(a.new_data, a.old_data) ->> 'client_id') = _client_id::text)
    and a.created_at >= _from and a.created_at < _to
  order by a.created_at desc
  limit 5000;
$$;
revoke all on function public.staff_activity_changes(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.staff_activity_changes(timestamptz, timestamptz, uuid) to authenticated;

create index if not exists audit_logs_client_id on public.audit_logs ((coalesce(new_data, old_data) ->> 'client_id'));
create index if not exists audit_logs_user_created on public.audit_logs (user_id, created_at desc);

create table if not exists public.touchpoint_reminders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  sent_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  snoozed_until timestamptz,
  completed_at timestamptz,
  completed_how text check (completed_how is null or completed_how in ('logged', 'marked_done'))
);
create index if not exists touchpoint_reminders_open on public.touchpoint_reminders (employee_id) where completed_at is null;
alter table public.touchpoint_reminders enable row level security;
drop policy if exists "Admins manage touchpoint reminders" on public.touchpoint_reminders;
create policy "Admins manage touchpoint reminders" on public.touchpoint_reminders for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
drop policy if exists "Case managers see their reminders" on public.touchpoint_reminders;
create policy "Case managers see their reminders" on public.touchpoint_reminders for select
  using (employee_id in (select id from public.profiles where user_id = auth.uid()));
drop policy if exists "Case managers answer their reminders" on public.touchpoint_reminders;
create policy "Case managers answer their reminders" on public.touchpoint_reminders for update
  using (employee_id in (select id from public.profiles where user_id = auth.uid()))
  with check (employee_id in (select id from public.profiles where user_id = auth.uid()));

create or replace function public.close_touchpoint_reminders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.touchpoint_reminders set completed_at = now(), completed_how = 'logged'
  where client_id = new.client_id and completed_at is null;
  return new;
end; $$;
drop trigger if exists close_touchpoint_reminders on public.client_contacts;
create trigger close_touchpoint_reminders after insert on public.client_contacts
  for each row execute function public.close_touchpoint_reminders();