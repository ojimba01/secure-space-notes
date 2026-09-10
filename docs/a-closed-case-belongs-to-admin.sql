-- A closed case is visible to Admin and Superadmin only.
--
-- NOT YET APPLIED. Run this alongside the code change that goes with it.
--
-- Closing a case already took the client off every list a case manager works
-- from. It did not take away their access: the record, the documents, the
-- notes, the files and the contact history were all still readable by whoever
-- was carrying the client, and anyone who kept a link could open the record
-- itself. Closed now means closed to staff. The people who carry the agency's
-- responsibility for a finished case -- administrators and superadmins -- keep
-- everything, because somebody has to be able to answer for it afterwards, and
-- an administrator can reopen the case when a client comes back.
--
-- Nothing is deleted and nothing is moved. This is a visibility rule.
--
-- Most of it is two functions. `is_assigned_to_client` and
-- `can_access_client_files` are what every staff-facing policy on a client's
-- data already asks, so teaching those two that a closed case is not theirs
-- carries the rule to contacts, compliance months, authorizations, the forms
-- checklist, progress notes, intakes, visit availability and the files in
-- storage without touching any of those policies. What is left below is the
-- handful of policies that reach a client's data another way -- through "I
-- filed this" or "this is my event" rather than "this client is mine".

-- ---------------------------------------------------------------------------
-- 1. The two rows that were closed before `status` was set with the stage
-- ---------------------------------------------------------------------------
-- Closing used to write workflow_stage alone. Both columns are read below, so
-- this is not required for correctness -- but leaving the two disagreeing
-- means every later reader has to remember to ask twice.

update public.clients
   set status = 'closed'
 where deleted_at is null
   and workflow_stage = 'closed'
   and status is distinct from 'closed';

-- ---------------------------------------------------------------------------
-- 2. One place that says what closed means
-- ---------------------------------------------------------------------------
-- Security definer: the policies below call this about clients the caller is
-- specifically not allowed to select, which is the whole point.

create or replace function public.is_case_closed(_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.clients c
     where c.id = _client_id
       and (c.status = 'closed' or c.workflow_stage = 'closed')
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. The two questions every staff-facing policy already asks
-- ---------------------------------------------------------------------------
-- Both keep their existing meaning exactly, with the closed case removed. Both
-- cover writes as well as reads, so a closed case stops accepting new contacts,
-- documents and files from staff at the same moment it stops being visible to
-- them.

create or replace function public.is_assigned_to_client(_user_id uuid, _client_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.clients c
      join public.profiles p on p.id = c.assigned_employee_id
     where c.id = _client_id
       and p.user_id = _user_id
       and p.active = true
       and c.status is distinct from 'closed'
       and c.workflow_stage is distinct from 'closed'
  )
$$;

create or replace function public.can_access_client_files(_user_id uuid, _client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(_user_id)
      or exists (
        select 1
          from public.profiles p
          join public.clients c on c.assigned_employee_id = p.id
         where p.user_id = _user_id
           and c.id = _client_id
           and p.active = true
           and c.status is distinct from 'closed'
           and c.workflow_stage is distinct from 'closed'
      )
$$;

-- ---------------------------------------------------------------------------
-- 4. The client record itself
-- ---------------------------------------------------------------------------
-- Read: an administrator, or the case manager carrying an open case.

drop policy if exists "Employees can view their assigned clients" on public.clients;
create policy "Employees can view their assigned clients"
  on public.clients for select
  using (
    public.is_admin(auth.uid())
    or (
      assigned_employee_id = public.get_profile_id(auth.uid())
      and status is distinct from 'closed'
      and workflow_stage is distinct from 'closed'
    )
  );

-- Write: the same, with one deliberate exception. A case manager may still
-- close their own case, and closing it is an update whose *new* row is closed.
-- Postgres reuses a policy's USING expression as its WITH CHECK when none is
-- given, so without the explicit WITH CHECK below the closing write would fail
-- on the row it had just written. USING decides what they may edit -- an open
-- case of theirs -- and WITH CHECK decides what they may leave behind, which
-- is their own client, open or closed. Reopening is not among them: the case
-- is invisible to them by then, and only an administrator can undo it.

drop policy if exists "Employees can update their assigned clients" on public.clients;
create policy "Employees can update their assigned clients"
  on public.clients for update
  using (
    assigned_employee_id = public.get_profile_id(auth.uid())
    and status is distinct from 'closed'
    and workflow_stage is distinct from 'closed'
  )
  with check (assigned_employee_id = public.get_profile_id(auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. The policies that reach a client's data without asking whose client it is
-- ---------------------------------------------------------------------------
-- Each of these says "mine because I filed it" or "mine because it is my
-- calendar". Filing a document is not a claim on the client after the case has
-- closed, so each one now asks about the case as well.

-- Documents. "Staff read documents on their own clients" needs no change: it
-- goes through is_assigned_to_client, which has already stopped saying yes.
drop policy if exists "Employees view their own forms" on public.client_forms;
create policy "Employees view their own forms"
  on public.client_forms for select to authenticated
  using (
    public.is_admin(auth.uid())
    or (
      employee_id = public.get_profile_id(auth.uid())
      and not public.is_case_closed(client_id)
    )
  );

drop policy if exists "Employees view versions of their own forms" on public.client_form_versions;
create policy "Employees view versions of their own forms"
  on public.client_form_versions for select to authenticated
  using (exists (
    select 1
      from public.client_forms f
      join public.profiles p on p.id = f.employee_id
     where f.id = client_form_id
       and p.user_id = auth.uid()
       and not public.is_case_closed(f.client_id)
  ));

-- The row is only half of a document: opening it reads the file.
drop policy if exists "Users read form files they own or administer" on storage.objects;
create policy "Users read form files they own or administer"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = 'forms'
    and (
      public.is_admin(auth.uid())
      or exists (
        select 1
          from public.client_forms cf
         where (cf.file_path = storage.objects.name or cf.original_file_path = storage.objects.name)
           and cf.employee_id = public.get_profile_id(auth.uid())
           and not public.is_case_closed(cf.client_id)
      )
    )
  );

-- Notes.
drop policy if exists "Employees can view notes for their clients" on public.client_notes;
create policy "Employees can view notes for their clients"
  on public.client_notes for select
  using (
    public.is_admin(auth.uid())
    or (
      not public.is_case_closed(client_id)
      and (
        employee_id = public.get_profile_id(auth.uid())
        or exists (
          select 1 from public.clients
           where id = client_id
             and assigned_employee_id = public.get_profile_id(auth.uid())
        )
      )
    )
  );

-- Files attached to the record.
drop policy if exists "Users can view files for their clients" on public.client_files;
create policy "Users can view files for their clients"
  on public.client_files for select
  using (
    public.is_admin(auth.uid())
    or (
      not public.is_case_closed(client_id)
      and (
        uploaded_by = public.get_profile_id(auth.uid())
        or exists (
          select 1 from public.clients
           where id = client_id
             and assigned_employee_id = public.get_profile_id(auth.uid())
        )
      )
    )
  );

-- The calendar. An event with no client on it is somebody's own diary entry
-- and stays exactly where it is.
drop policy if exists "Users can view their own events" on public.calendar_events;
create policy "Users can view their own events"
  on public.calendar_events for select
  using (
    public.is_admin(auth.uid())
    or (
      employee_id = public.get_profile_id(auth.uid())
      and (client_id is null or not public.is_case_closed(client_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 6. The same rule on the way in
-- ---------------------------------------------------------------------------
-- A case manager who cannot see a closed case should not be able to write to
-- one either. Everything filed through is_assigned_to_client already refuses;
-- these three ask about the client inline, so they are the exceptions again.

drop policy if exists "Users can upload files for their clients" on public.client_files;
create policy "Users can upload files for their clients"
  on public.client_files for insert
  with check (
    uploaded_by = public.get_profile_id(auth.uid())
    and exists (
      select 1 from public.clients
       where id = client_id
         and (assigned_employee_id = public.get_profile_id(auth.uid()) or public.is_admin(auth.uid()))
         and (
           public.is_admin(auth.uid())
           or (status is distinct from 'closed' and workflow_stage is distinct from 'closed')
         )
    )
  );

drop policy if exists "Employees can create notes for their clients" on public.client_notes;
create policy "Employees can create notes for their clients"
  on public.client_notes for insert
  with check (
    employee_id = public.get_profile_id(auth.uid())
    and exists (
      select 1 from public.clients
       where id = client_id
         and (assigned_employee_id = public.get_profile_id(auth.uid()) or public.is_admin(auth.uid()))
         and (
           public.is_admin(auth.uid())
           or (status is distinct from 'closed' and workflow_stage is distinct from 'closed')
         )
    )
  );

drop policy if exists "Employees can update their own notes" on public.client_notes;
create policy "Employees can update their own notes"
  on public.client_notes for update
  using (
    public.is_admin(auth.uid())
    or (
      employee_id = public.get_profile_id(auth.uid())
      and not public.is_case_closed(client_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Expect: still_open_but_closed = 0, and every policy below present (1 each).
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.clients
    where deleted_at is null and workflow_stage = 'closed'
      and status is distinct from 'closed')                     as still_open_but_closed,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'clients'
     and policyname = 'Employees can view their assigned clients')       as clients_select,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'clients'
     and policyname = 'Employees can update their assigned clients')     as clients_update,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'client_forms'
     and policyname = 'Employees view their own forms')                  as forms_select,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'client_form_versions'
     and policyname = 'Employees view versions of their own forms')      as versions_select,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'client_notes'
     and policyname = 'Employees can view notes for their clients')      as notes_select,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'client_files'
     and policyname = 'Users can view files for their clients')          as files_select,
  (select count(*) from pg_policies where schemaname = 'public'
     and tablename = 'calendar_events'
     and policyname = 'Users can view their own events')                 as events_select,
  (select count(*) from pg_policies where schemaname = 'storage'
     and policyname = 'Users read form files they own or administer')    as storage_select;
