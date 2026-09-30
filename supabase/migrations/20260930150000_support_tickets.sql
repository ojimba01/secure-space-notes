-- Support tickets: the Support button in the bottom-right corner.
--
-- Anyone signed in can open a ticket describing a problem, with a marked-up
-- screenshot, a screen recording or a file. Superadmins see every ticket on
-- the Support tickets page, reply, and set its status; the person who opened
-- it sees the replies under Support. Each new ticket and each reply from the
-- person is emailed to support by the support-notify edge function.
--
-- Idempotent. Running it twice changes nothing.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid(),
  profile_id uuid references public.profiles(id) on delete set null,
  message text not null,
  -- Where the person was when they asked for help.
  page_url text,
  user_agent text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  -- Screenshots, recordings and files: [{ path, kind, name }].
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- When the person last read the ticket, and when support last replied, so
  -- the button can show that there is something new.
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

-- Support changes the status; the person only marks it read.
drop policy if exists "Update support tickets" on public.support_tickets;
create policy "Update support tickets" on public.support_tickets for update
  using (created_by = auth.uid() or public.is_superadmin(auth.uid()))
  with check (created_by = auth.uid() or public.is_superadmin(auth.uid()));

create or replace function public.guard_support_ticket_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The person who opened it may only mark it read. A reply from them
  -- reopening a resolved ticket comes through support_message_touch_ticket,
  -- which says so.
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

-- A reply from support marks the ticket as having something new; a reply
-- from the person reopens a ticket support had resolved.
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

-- Screenshots and recordings. Private: each person uploads into a folder
-- named for their own login, and reads only their own; superadmins read all.
insert into storage.buckets (id, name, public)
values ('support-attachments', 'support-attachments', false)
on conflict (id) do nothing;

drop policy if exists "Upload support attachments" on storage.objects;
create policy "Upload support attachments" on storage.objects for insert to authenticated
  with check (bucket_id = 'support-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Read support attachments" on storage.objects;
create policy "Read support attachments" on storage.objects for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_superadmin(auth.uid()))
  );
