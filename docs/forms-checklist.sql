-- A client's forms are a checklist, not a pile.
--
-- NOT YET APPLIED. Run this before merging the code change that goes with it.
--
-- The Forms tab listed whatever documents happened to exist. What a person
-- looking at a client actually wants to know is which of the forms that client
-- should have are in hand — and some of them were done on paper, or filed in
-- Availity years before this app, and will never be uploaded here.
--
-- So a form type can be ticked with no document behind it. This table is where
-- a tick with nothing holding it up is recorded. A tick that a document *is*
-- holding up is not stored at all — it is read off client_forms, so filing a
-- document ticks its box and deleting the document unticks it, with no second
-- copy of the truth to drift.

create table if not exists public.client_form_checklist (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  form_type text not null,
  marked_by uuid references public.profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (client_id, form_type)
);

create index if not exists client_form_checklist_client_idx
  on public.client_form_checklist (client_id);

alter table public.client_form_checklist enable row level security;

-- Same reach as the client record itself: the person carrying the client, and
-- administrators. Ticking a box is ordinary case work, not an admin act.
drop policy if exists "Staff read the checklist for their clients" on public.client_form_checklist;
create policy "Staff read the checklist for their clients"
  on public.client_form_checklist for select
  to authenticated
  using (is_assigned_to_client(auth.uid(), client_id) or is_admin(auth.uid()));

drop policy if exists "Staff tick the checklist for their clients" on public.client_form_checklist;
create policy "Staff tick the checklist for their clients"
  on public.client_form_checklist for insert
  to authenticated
  with check (
    (is_assigned_to_client(auth.uid(), client_id) or is_admin(auth.uid()))
    and marked_by = get_profile_id(auth.uid())
  );

drop policy if exists "Staff untick the checklist for their clients" on public.client_form_checklist;
create policy "Staff untick the checklist for their clients"
  on public.client_form_checklist for delete
  to authenticated
  using (is_assigned_to_client(auth.uid(), client_id) or is_admin(auth.uid()));

-- Expect: table 1, policies 3.
select
  (select count(*) from information_schema.tables
    where table_schema='public' and table_name='client_form_checklist') as table_present,
  (select count(*) from pg_policies
    where schemaname='public' and tablename='client_form_checklist') as policies;
