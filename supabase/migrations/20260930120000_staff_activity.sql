-- Staff activity: where each person spends their time in the app.
--
-- The audit log already records every change a person makes — a client
-- edited, a form completed, a touchpoint logged. What it cannot say is how
-- long anything took, or where somebody was while nothing was being saved.
-- This records that: one row per page visit and one per task (filling out a
-- form, uploading a document), with the time spent actively working on it.
--
-- Only superadmins can read it. Nobody writes to the table directly: the app
-- calls start_staff_activity when a page or task opens and
-- touch_staff_activity every half minute while it stays open, and both only
-- ever touch the caller's own rows.
--
-- Also makes three accounts superadmins, the role the Staff activity page is
-- shown to: mdajimba@gmail.com, ojimba's accounts, and Shade Dickson.
--
-- Idempotent. Running it twice changes nothing.

create table if not exists public.staff_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid references public.profiles(id) on delete set null,
  -- 'page' is a screen somebody had open; 'task' is a piece of work within
  -- one, such as filling out a form.
  kind text not null check (kind in ('page', 'task')),
  -- Where it was: 'clients', 'client', 'forms', 'touchpoints', 'billing', …
  area text not null,
  -- What to call it on the Staff activity page: "Client record",
  -- "Filling out Housing Stabilization Plan (HSP)".
  label text not null,
  client_id uuid references public.clients(id) on delete set null,
  started_at timestamptz not null default now(),
  -- The last moment the page was open and in view.
  last_seen_at timestamptz not null default now(),
  -- Time actually spent on it: the tab in view and the person using it.
  -- A page left open while somebody is away stops counting after two minutes.
  active_seconds integer not null default 0,
  -- Tasks only: 'completed', 'draft' or 'closed' (closed without saving).
  outcome text check (outcome is null or outcome in ('completed', 'draft', 'closed'))
);

create index if not exists staff_activity_user_started
  on public.staff_activity (user_id, started_at desc);
create index if not exists staff_activity_started
  on public.staff_activity (started_at desc);

alter table public.staff_activity enable row level security;

drop policy if exists "Superadmins read staff activity" on public.staff_activity;
create policy "Superadmins read staff activity"
  on public.staff_activity for select
  using (public.is_superadmin(auth.uid()));

-- No insert, update or delete policies: rows are written only through the
-- two functions below, and never removed from the app.

create or replace function public.start_staff_activity(
  _kind text,
  _area text,
  _label text,
  _client_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;
  insert into public.staff_activity (user_id, profile_id, kind, area, label, client_id)
  values (
    auth.uid(),
    (select id from public.profiles where user_id = auth.uid() limit 1),
    _kind,
    left(_area, 60),
    left(_label, 200),
    -- A client id that does not exist (deleted since) is dropped, not an error.
    (select id from public.clients where id = _client_id)
  )
  returning id into _id;
  return _id;
end;
$$;

create or replace function public.touch_staff_activity(
  _id uuid,
  _add_seconds integer,
  _outcome text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.staff_activity
  set
    last_seen_at = now(),
    -- A ping covers at most a couple of minutes; anything larger is a clock
    -- or a tab that slept, and is not counted.
    active_seconds = active_seconds + greatest(0, least(coalesce(_add_seconds, 0), 120)),
    outcome = coalesce(_outcome, outcome)
  where id = _id
    and user_id = auth.uid()
    -- Only a visit still in progress can be extended.
    and started_at > now() - interval '1 day';
$$;

revoke all on function public.start_staff_activity(text, text, text, uuid) from public, anon;
revoke all on function public.touch_staff_activity(uuid, integer, text) from public, anon;
grant execute on function public.start_staff_activity(text, text, text, uuid) to authenticated;
grant execute on function public.touch_staff_activity(uuid, integer, text) to authenticated;

-- What each person changed, from the audit log, without the documents.
--
-- The audit log keeps a full copy of every row written, and a form's copy
-- includes all of its text — hundreds of pages, for some. The Staff activity
-- page needs only which record, which fields changed, and a few names to
-- describe it, so this hands back exactly that.
--
-- Everyone's changes over a period is for superadmins, on Staff activity.
-- One client's changes (_client_id given) is for admins too: it is that
-- client's History section.
drop function if exists public.staff_activity_changes(timestamptz, timestamptz);
create or replace function public.staff_activity_changes(
  _from timestamptz,
  _to timestamptz,
  _client_id uuid default null
)
returns table (
  id uuid,
  created_at timestamptz,
  user_id uuid,
  action text,
  table_name text,
  record_id uuid,
  client_id uuid,
  changed text[],
  details jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.created_at,
    a.user_id,
    a.action::text,
    a.table_name,
    a.record_id,
    case
      when a.table_name = 'clients' then a.record_id
      else nullif(coalesce(a.new_data, a.old_data) ->> 'client_id', '')::uuid
    end,
    case when a.action::text = 'UPDATE' then array(
      select n.key
      from jsonb_each(a.new_data) n
      where n.value is distinct from (a.old_data -> n.key)
    ) end,
    jsonb_strip_nulls(jsonb_build_object(
      'form_type', d ->> 'form_type',
      'title', d ->> 'title',
      'file_name', d ->> 'file_name',
      'source', d ->> 'source',
      'status', d ->> 'status',
      'old_status', a.old_data ->> 'status',
      'external_status', d ->> 'external_status',
      'old_external_status', a.old_data ->> 'external_status',
      'touchpoint_type', d ->> 'touchpoint_type',
      'modality', d ->> 'modality',
      'contact_date', d ->> 'contact_date',
      'first_name', case when a.table_name = 'clients' then d ->> 'first_name' end,
      'last_name', case when a.table_name = 'clients' then d ->> 'last_name' end
    ))
  from public.audit_logs a
  cross join lateral (select coalesce(a.new_data, a.old_data) as d) x
  where (
      public.is_superadmin(auth.uid())
      or (_client_id is not null and public.is_admin(auth.uid()))
    )
    and a.user_id is not null
    and (
      _client_id is null
      or (a.table_name = 'clients' and a.record_id = _client_id)
      or (coalesce(a.new_data, a.old_data) ->> 'client_id') = _client_id::text
    )
    and a.created_at >= _from
    and a.created_at < _to
  order by a.created_at desc
  limit 5000;
$$;

revoke all on function public.staff_activity_changes(timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.staff_activity_changes(timestamptz, timestamptz, uuid) to authenticated;

-- A client's history looks rows up by the client they belong to.
create index if not exists audit_logs_client_id
  on public.audit_logs ((coalesce(new_data, old_data) ->> 'client_id'));
create index if not exists audit_logs_user_created
  on public.audit_logs (user_id, created_at desc);

-- The three superadmins. Accounts are matched by email, and Shade Dickson by
-- name. An account that does not exist yet is skipped.
insert into public.user_roles (user_id, role)
select p.user_id, 'superadmin'::app_role
from public.profiles p
where (
    lower(p.email) in ('mdajimba@gmail.com', 'ojimba01@gmail.com', 'ojimba01@outlook.com')
    or (lower(trim(p.first_name)) = 'shade' and lower(trim(p.last_name)) = 'dickson')
  )
  and p.user_id is not null
  and not exists (
    select 1 from public.user_roles r
    where r.user_id = p.user_id and r.role = 'superadmin'
  );

-- Who is a superadmin now, to check against.
select p.first_name, p.last_name, p.email
from public.user_roles r
join public.profiles p on p.user_id = r.user_id
where r.role = 'superadmin'
order by p.first_name;
