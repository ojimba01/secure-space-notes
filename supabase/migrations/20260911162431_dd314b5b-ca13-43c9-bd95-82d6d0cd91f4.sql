update public.clients
   set status = 'closed'
 where deleted_at is null
   and workflow_stage = 'closed'
   and status is distinct from 'closed';

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