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

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  profile_id uuid references public.profiles(id) on delete set null,
  message text not null,
  page_url text,
  user_agent text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  requester_seen_at timestamptz not null default now(),
  last_support_reply_at timestamptz
);

create table if not exists public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author uuid not null default auth.uid(),
  body text not null,
  from_support boolean not null default false,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_created_by on public.support_tickets (created_by, created_at desc);
create index if not exists support_tickets_status on public.support_tickets (status, created_at desc);
create index if not exists support_ticket_messages_ticket on public.support_ticket_messages (ticket_id, created_at);

alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;

drop policy if exists "Open a support ticket" on public.support_tickets;
create policy "Open a support ticket" on public.support_tickets for insert
  with check (created_by = auth.uid());

drop policy if exists "Read own or all support tickets" on public.support_tickets;
create policy "Read own or all support tickets" on public.support_tickets for select
  using (created_by = auth.uid() or public.is_superadmin(auth.uid()));

drop policy if exists "Update support tickets" on public.support_tickets;
create policy "Update support tickets" on public.support_tickets for update
  using (created_by = auth.uid() or public.is_superadmin(auth.uid()))
  with check (created_by = auth.uid() or public.is_superadmin(auth.uid()));

create or replace function public.guard_support_ticket_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin(auth.uid())
     and coalesce(current_setting('app.support_reply', true), '') <> 'on' then
    new.status := old.status;
    new.message := old.message;
    new.attachments := old.attachments;
    new.resolved_at := old.resolved_at;
    new.last_support_reply_at := old.last_support_reply_at;
  end if;
  if new.status in ('resolved', 'closed') and old.status not in ('resolved', 'closed') then
    new.resolved_at := now();
  elsif new.status not in ('resolved', 'closed') then
    new.resolved_at := null;
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists guard_support_ticket_update on public.support_tickets;
create trigger guard_support_ticket_update before update on public.support_tickets
  for each row execute function public.guard_support_ticket_update();

drop policy if exists "Reply on a support ticket" on public.support_ticket_messages;
create policy "Reply on a support ticket" on public.support_ticket_messages for insert
  with check (
    author = auth.uid()
    and (
      (from_support = false and exists (
        select 1 from public.support_tickets t where t.id = ticket_id and t.created_by = auth.uid()))
      or (from_support = true and public.is_superadmin(auth.uid()))
    )
  );

drop policy if exists "Read support ticket messages" on public.support_ticket_messages;
create policy "Read support ticket messages" on public.support_ticket_messages for select
  using (exists (
    select 1 from public.support_tickets t
    where t.id = ticket_id and (t.created_by = auth.uid() or public.is_superadmin(auth.uid()))
  ));

create or replace function public.support_message_touch_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.from_support then
    update public.support_tickets
      set last_support_reply_at = new.created_at, updated_at = now()
      where id = new.ticket_id;
  else
    perform set_config('app.support_reply', 'on', true);
    update public.support_tickets
      set updated_at = now(),
          status = case when status in ('resolved', 'closed') then 'open' else status end,
          resolved_at = case when status in ('resolved', 'closed') then null else resolved_at end
      where id = new.ticket_id;
    perform set_config('app.support_reply', '', true);
  end if;
  return new;
end; $$;

drop trigger if exists support_message_touch_ticket on public.support_ticket_messages;
create trigger support_message_touch_ticket after insert on public.support_ticket_messages
  for each row execute function public.support_message_touch_ticket();

drop policy if exists "Upload support attachments" on storage.objects;
create policy "Upload support attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'support-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Read support attachments" on storage.objects;
create policy "Read support attachments" on storage.objects for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_superadmin(auth.uid()))
  );