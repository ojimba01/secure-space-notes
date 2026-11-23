-- Tracked changes and the inbox.
--
-- form_corrections: every answer an admin changed on someone else's form, with
-- the answer before and after. The person who filled the form sees them in
-- their Inbox; kept as rows so the most common corrections can later be
-- suggested to staff as they fill in a form.
--
-- notifications.details: what a notice is about, in full (the changes made).
-- form_submitted: a staff member submitted a form; every admin is told.
create table if not exists public.form_corrections (
  id uuid primary key default gen_random_uuid(),
  client_form_id uuid not null references public.client_forms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  form_type text not null,
  field text not null,
  field_label text,
  before_value text,
  after_value text,
  corrected_by uuid references public.profiles(id) on delete set null,
  recipient_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists form_corrections_form on public.form_corrections (client_form_id, created_at);
create index if not exists form_corrections_type_field on public.form_corrections (form_type, field);

alter table public.form_corrections enable row level security;

drop policy if exists "Read corrections" on public.form_corrections;
create policy "Read corrections" on public.form_corrections
  for select to authenticated
  using (public.is_admin(auth.uid()) or recipient_id = public.get_profile_id(auth.uid()));

drop policy if exists "Admins record corrections" on public.form_corrections;
create policy "Admins record corrections" on public.form_corrections
  for insert to authenticated
  with check (public.is_admin(auth.uid()) and corrected_by = public.get_profile_id(auth.uid()));

alter table public.notifications add column if not exists details jsonb;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('form_comment', 'form_corrected', 'intake_assigned', 'form_submitted'));

-- A staff member submits a form (first submission or a resubmission): every
-- admin but the one who saved it gets a notice. Drafts and autosaves do not.
create or replace function public.notify_admins_form_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := public.get_profile_id(auth.uid());
  actor_name text;
  client_name text;
begin
  if auth.uid() is null or public.is_admin(auth.uid()) then return new; end if;
  if new.status <> 'submitted' or new.form_type = 'Referral' then return new; end if;
  if tg_op = 'UPDATE' and old.status = new.status and old.signed_at is not distinct from new.signed_at then return new; end if;
  select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into actor_name from profiles where id = actor;
  select trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')) into client_name from clients where id = new.client_id;
  insert into notifications (recipient_id, kind, title, body, client_id, client_form_id, actor_id)
  select p.id, 'form_submitted',
         coalesce(nullif(actor_name, ''), 'A staff member') || case when tg_op = 'INSERT' or old.status = 'draft' then ' submitted the ' else ' updated the ' end || new.form_type,
         client_name, new.client_id, new.id, actor
  from profiles p
  join user_roles r on r.user_id = p.user_id and r.role = 'admin'
  where p.active and p.id is distinct from actor;
  return new;
end;
$$;

drop trigger if exists client_form_submitted_notifies_admins on public.client_forms;
create trigger client_form_submitted_notifies_admins
  after insert or update of status, signed_at on public.client_forms
  for each row execute function public.notify_admins_form_submitted();
