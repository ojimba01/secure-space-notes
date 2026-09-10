-- A closed case belongs to the administrators.
--
-- NOT YET APPLIED. Run this before merging the code change that goes with it.
--
-- Closing a case ends the work but keeps the record: the client, their forms,
-- notes, documents and billing history all stay exactly where they are. Who
-- may still look at them is what changes here. Once a case is closed the case
-- manager who carried it can no longer see it, or anything hanging off it.
-- Only an administrator can, and only an administrator can reopen it.
--
-- This is enforced in the database rather than in the screens. Hiding a closed
-- client from a list still leaves every row reachable through the API with the
-- same session, which is not a rule, only a habit.
--
-- Closed means what the app means by closed (`displayStage` in
-- src/lib/workflow.ts): status 'closed' or workflow_stage 'closed'. Closing
-- sets both; reopening clears both.

-- ---------------------------------------------------------------- predicates

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

comment on function public.is_case_closed(uuid) is
  'True once a case has been closed. Closed cases are visible to administrators only.';

-- Who may see a client at all: an administrator always, the assigned case
-- manager while the case is open. Every client-scoped policy that is not
-- already routed through is_assigned_to_client goes through this.
create or replace function public.can_see_client(_user_id uuid, _client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin(_user_id)
      or (
        public.is_assigned_to_client(_user_id, _client_id)
        and not public.is_case_closed(_client_id)
      )
$$;

comment on function public.can_see_client(uuid, uuid) is
  'Administrator, or the assigned case manager of a case that is still open.';

-- ------------------------------------------------------------- the two hubs
--
-- Nearly every client-scoped policy in the schema asks one of these two
-- questions, so answering "no" here for a closed case closes the same door
-- everywhere at once: contacts, household members, intakes, compliance,
-- progress notes, the form checklist, authorizations, the documents a staff
-- member may read, and the files in storage behind them.
--
-- Both keep their names: what they mean is "assigned to a case this person may
-- still work", and a closed case is nobody's work but an administrator's.

create or replace function public.is_assigned_to_client(_user_id uuid, _client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    join public.profiles p on p.id = c.assigned_employee_id
    where c.id = _client_id
      and p.user_id = _user_id
      and p.active = true
      -- A closed case is not theirs any more, whoever carried it.
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
  select exists (
    select 1
    from public.profiles p
    join public.clients c on c.assigned_employee_id = p.id
    where p.user_id = _user_id
      and c.id = _client_id
      and p.active = true
      and c.status is distinct from 'closed'
      and c.workflow_stage is distinct from 'closed'
  )
  or public.is_admin(_user_id)
$$;

-- ------------------------------------------------------------------ clients

-- Written out against the row rather than through can_see_client, which would
-- re-read the same client through a function for every row of the list.
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

-- Closing is still ordinary case work, and this is the update that does it:
-- USING is read against the row as it stands, which is open at that moment, so
-- the close goes through and every update after it is an administrator's.
--
-- The WITH CHECK is written out rather than left to default to the USING
-- clause, which is what a policy without one does. Defaulted, it would be read
-- against the row being written — the closed one — and refuse the very update
-- that closes the case.
drop policy if exists "Employees can update their assigned clients" on public.clients;
create policy "Employees can update their assigned clients"
  on public.clients for update
  using (
    assigned_employee_id = public.get_profile_id(auth.uid())
    and not public.is_case_closed(id)
  )
  with check (assigned_employee_id = public.get_profile_id(auth.uid()));

-- -------------------------------------------------------------- client_notes
--
-- The author branch is the leak these rewrites close: a note, file or document
-- a case manager created stayed readable by them through their own authorship,
-- whatever happened to the client afterwards.

drop policy if exists "Employees can view notes for their clients" on public.client_notes;
create policy "Employees can view notes for their clients"
  on public.client_notes for select
  using (public.can_see_client(auth.uid(), client_id));

drop policy if exists "Employees can create notes for their clients" on public.client_notes;
create policy "Employees can create notes for their clients"
  on public.client_notes for insert
  with check (
    employee_id = public.get_profile_id(auth.uid())
    and public.can_see_client(auth.uid(), client_id)
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

drop policy if exists "Note authors can delete recent notes, admins anytime" on public.client_notes;
create policy "Note authors can delete recent notes, admins anytime"
  on public.client_notes for delete
  using (
    public.is_admin(auth.uid())
    or (
      employee_id = public.get_profile_id(auth.uid())
      and created_at > now() - interval '24 hours'
      and not public.is_case_closed(client_id)
    )
  );

-- -------------------------------------------------------------- client_files

drop policy if exists "Users can view files for their clients" on public.client_files;
create policy "Users can view files for their clients"
  on public.client_files for select
  using (public.can_see_client(auth.uid(), client_id));

drop policy if exists "Users can upload files for their clients" on public.client_files;
create policy "Users can upload files for their clients"
  on public.client_files for insert
  with check (
    uploaded_by = public.get_profile_id(auth.uid())
    and public.can_see_client(auth.uid(), client_id)
  );

drop policy if exists "File owners and admins can delete files" on public.client_files;
create policy "File owners and admins can delete files"
  on public.client_files for delete
  using (
    public.is_admin(auth.uid())
    or (
      uploaded_by = public.get_profile_id(auth.uid())
      and not public.is_case_closed(client_id)
    )
  );

-- -------------------------------------------------------------- client_forms
--
-- "Staff read documents on their own clients" already goes through
-- is_assigned_to_client and needs no change. This is the other way in: the
-- documents a case manager filed themselves.

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

drop policy if exists "Employees update their own unapproved forms" on public.client_forms;
create policy "Employees update their own unapproved forms"
  on public.client_forms for update to authenticated
  using (
    employee_id = public.get_profile_id(auth.uid())
    and status <> 'approved'
    and not public.is_case_closed(client_id)
  )
  with check (employee_id = public.get_profile_id(auth.uid()));

drop policy if exists "Employees delete their own drafts" on public.client_forms;
create policy "Employees delete their own drafts"
  on public.client_forms for delete to authenticated
  using (
    public.is_admin(auth.uid())
    or (
      employee_id = public.get_profile_id(auth.uid())
      and status in ('draft','changes_requested')
      and not public.is_case_closed(client_id)
    )
  );

-- ------------------------------------------------------ client_form_versions

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

-- ----------------------------------------------------------- calendar_events
--
-- A staff calendar carries the client's name on every visit it schedules, so
-- the events on a closed case go with the case.

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

drop policy if exists "Users can update their own events" on public.calendar_events;
create policy "Users can update their own events"
  on public.calendar_events for update
  using (
    public.is_admin(auth.uid())
    or (
      employee_id = public.get_profile_id(auth.uid())
      and (client_id is null or not public.is_case_closed(client_id))
    )
  );

drop policy if exists "Users can delete their own events" on public.calendar_events;
create policy "Users can delete their own events"
  on public.calendar_events for delete
  using (
    public.is_admin(auth.uid())
    or (
      employee_id = public.get_profile_id(auth.uid())
      and (client_id is null or not public.is_case_closed(client_id))
    )
  );

-- ------------------------------------------------------------- verification
--
-- Expect: is_case_closed 1, can_see_client 1, hubs_updated 2, the client list
-- policy 1, policies_updated 15. The last column is not a check but a count:
-- how many closed cases have just moved out of staff reach.
select
  (select count(*) from pg_proc where proname = 'is_case_closed') as is_case_closed,
  (select count(*) from pg_proc where proname = 'can_see_client') as can_see_client,
  (select count(*) from pg_proc
    where proname in ('is_assigned_to_client','can_access_client_files')
      and prosrc like '%closed%') as hubs_updated,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'clients'
      and cmd = 'SELECT' and qual like '%workflow_stage%') as client_list_policy,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and (qual like '%is_case_closed%' or qual like '%can_see_client%'
        or with_check like '%is_case_closed%' or with_check like '%can_see_client%')) as policies_updated,
  (select count(*) from public.clients
    where status = 'closed' or workflow_stage = 'closed') as closed_cases;
