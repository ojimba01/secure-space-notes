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

-- Write: their own case, while it is open, and it stays theirs and open.
--
-- Closing is deliberately NOT reachable from here, because it cannot be.
-- Postgres applies a table's SELECT policies to the *new* row of an UPDATE:
-- you may not update a row into a state where you could no longer see it. The
-- read policy above hides a closed case from staff, so the moment it exists,
-- no staff UPDATE can ever turn a case closed -- with or without a WITH CHECK
-- of its own, which is what an earlier draft of this file got wrong. Closing
-- goes through close_case() below instead.

drop policy if exists "Employees can update their assigned clients" on public.clients;
create policy "Employees can update their assigned clients"
  on public.clients for update
  using (
    assigned_employee_id = public.get_profile_id(auth.uid())
    and status is distinct from 'closed'
    and workflow_stage is distinct from 'closed'
  )
  with check (
    assigned_employee_id = public.get_profile_id(auth.uid())
    and status is distinct from 'closed'
    and workflow_stage is distinct from 'closed'
  );

-- Closing a case: the one write that crosses the line, so it is the one write
-- that does not go through the table.
--
-- Security definer, so it is not bound by the read policy that is about to
-- hide the row from the person closing it. It checks for itself that the
-- caller is the case manager carrying the case or an administrator, which is
-- exactly what the UPDATE policy would have checked. Both columns are written
-- here, in one place, so a case can never again go closed by stage alone.
--
-- Reopening is not here on purpose: it is an ordinary admin update, and by
-- then staff cannot see the case to ask.

create or replace function public.close_case(
  _client_id uuid,
  _reason text,
  _closed_date date default null,
  _notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller uuid := auth.uid();
begin
  if _caller is null then
    raise exception 'Not signed in';
  end if;

  if not (
    public.is_admin(_caller)
    or exists (
      select 1
        from public.clients c
        join public.profiles p on p.id = c.assigned_employee_id
       where c.id = _client_id
         and p.user_id = _caller
         and p.active = true
    )
  ) then
    raise exception 'That is not your case to close';
  end if;

  update public.clients
     set status = 'closed',
         workflow_stage = 'closed',
         workflow_stage_updated_at = now(),
         closed_date = coalesce(_closed_date, current_date),
         reason_closed = _reason,
         notes = coalesce(nullif(btrim(_notes), ''), notes)
   where id = _client_id
     and deleted_at is null;

  if not found then
    raise exception 'No such client';
  end if;
end;
$$;

revoke all on function public.close_case(uuid, text, date, text) from public;
grant execute on function public.close_case(uuid, text, date, text) to authenticated;

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
-- Did it land?
-- ---------------------------------------------------------------------------
-- Expect one row reading: 0 stragglers, 4 functions, 11 policies.
-- Anything else means part of the script did not run. It is idempotent --
-- create-or-replace, drop-if-exists, and an update that matches nothing the
-- second time -- so the fix is always to run the whole thing again.

select
  (select count(*) from public.clients
    where deleted_at is null
      and workflow_stage = 'closed'
      and status is distinct from 'closed')      as still_open_but_closed,  -- expect 0

  -- All three names already existed, so the check is that each one's *body*
  -- now mentions the closed case. A name alone would pass without the script.
  (select count(*) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('is_case_closed', 'is_assigned_to_client',
                        'can_access_client_files', 'close_case')
      and pg_get_functiondef(p.oid) like '%closed%')  as functions_updated,  -- expect 4

  -- Same again: each of these policy names existed before, so what is counted
  -- is the ones whose rule now mentions the closed case. The insert policies
  -- keep their rule in with_check rather than qual, hence both.
  (select count(*) from pg_policies
    where coalesce(qual, '') || coalesce(with_check, '') like '%closed%'
      and ((schemaname, tablename, policyname) in (
      ('public', 'clients',              'Employees can view their assigned clients'),
      ('public', 'clients',              'Employees can update their assigned clients'),
      ('public', 'client_forms',         'Employees view their own forms'),
      ('public', 'client_form_versions', 'Employees view versions of their own forms'),
      ('public', 'client_notes',         'Employees can view notes for their clients'),
      ('public', 'client_notes',         'Employees can create notes for their clients'),
      ('public', 'client_notes',         'Employees can update their own notes'),
      ('public', 'client_files',         'Users can view files for their clients'),
      ('public', 'client_files',         'Users can upload files for their clients'),
      ('public', 'calendar_events',      'Users can view their own events')
    )
    or (schemaname = 'storage'
        and policyname = 'Users read form files they own or administer')))  as policies_updated;  -- expect 11
