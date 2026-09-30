-- Staff activity access, apart from the superadmin role.
--
-- docs/staff-activity.sql made Shade Dickson a superadmin so she could open
-- Staff activity. The superadmin role also hides an account from regular
-- admins' staff lists and from case assignment, and Shade carries her own
-- caseload. This takes the role back off her and gives her the page alone.
--
-- Superadmins keep access. Anyone else is given it by adding them to
-- staff_activity_viewers.
--
-- Idempotent. Running it twice changes nothing.

create table if not exists public.staff_activity_viewers (
  user_id uuid primary key,
  added_at timestamptz not null default now()
);
alter table public.staff_activity_viewers enable row level security;
drop policy if exists "Superadmins read staff activity viewers" on public.staff_activity_viewers;
create policy "Superadmins read staff activity viewers" on public.staff_activity_viewers for select
  using (public.is_superadmin(auth.uid()));

create or replace function public.can_view_staff_activity(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin(_user_id)
      or exists (select 1 from public.staff_activity_viewers v where v.user_id = _user_id);
$$;
revoke all on function public.can_view_staff_activity(uuid) from public, anon;
grant execute on function public.can_view_staff_activity(uuid) to authenticated;

-- Reading the activity follows the same rule.
drop policy if exists "Superadmins read staff activity" on public.staff_activity;
drop policy if exists "Staff activity viewers read staff activity" on public.staff_activity;
create policy "Staff activity viewers read staff activity" on public.staff_activity for select
  using (public.can_view_staff_activity(auth.uid()));

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
  where (public.can_view_staff_activity(auth.uid()) or (_client_id is not null and public.is_admin(auth.uid())))
    and a.user_id is not null
    and (_client_id is null
         or (a.table_name = 'clients' and a.record_id = _client_id)
         or (coalesce(a.new_data, a.old_data) ->> 'client_id') = _client_id::text)
    and a.created_at >= _from and a.created_at < _to
  order by a.created_at desc
  limit 5000;
$$;

-- Names for the page. A viewer who is not an administrator cannot read every
-- profile or client directly, so the page asks for names through these.
create or replace function public.staff_activity_people()
returns table (id uuid, user_id uuid, first_name text, last_name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.user_id, p.first_name, p.last_name, p.email
  from public.profiles p
  where public.can_view_staff_activity(auth.uid());
$$;

create or replace function public.staff_activity_client_names(_ids uuid[])
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select c.id, trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
  from public.clients c
  where public.can_view_staff_activity(auth.uid()) and c.id = any(_ids);
$$;

revoke all on function public.staff_activity_people() from public, anon;
revoke all on function public.staff_activity_client_names(uuid[]) from public, anon;
grant execute on function public.staff_activity_people() to authenticated;
grant execute on function public.staff_activity_client_names(uuid[]) to authenticated;

-- Shade Dickson: Staff activity access, and her superadmin role taken back
-- off, so she is listed and assignable like before. Her original role is
-- untouched.
insert into public.staff_activity_viewers (user_id)
select p.user_id from public.profiles p
where lower(trim(p.first_name)) = 'shade' and lower(trim(p.last_name)) = 'dickson'
  and p.user_id is not null
on conflict (user_id) do nothing;

delete from public.user_roles r
using public.profiles p
where r.user_id = p.user_id
  and r.role = 'superadmin'
  and lower(trim(p.first_name)) = 'shade' and lower(trim(p.last_name)) = 'dickson';

-- To check: Shade's roles now, and who can open Staff activity.
select p.first_name, p.last_name, r.role
from public.profiles p join public.user_roles r on r.user_id = p.user_id
where lower(trim(p.first_name)) = 'shade' and lower(trim(p.last_name)) = 'dickson';
