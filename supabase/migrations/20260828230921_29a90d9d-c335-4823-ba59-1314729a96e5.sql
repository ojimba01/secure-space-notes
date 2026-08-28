create or replace function public.safe_uuid(_text text)
returns uuid
language plpgsql
immutable
as $$
begin
  return _text::uuid;
exception when others then
  return null;
end;
$$;

drop policy if exists "Users can view assigned client files" on storage.objects;
create policy "Users can view assigned client files"
  on storage.objects for select
  using (
    bucket_id = 'client-files'
    and (
      can_access_client_files(auth.uid(), public.safe_uuid((storage.foldername(name))[1]))
      or is_admin(auth.uid())
    )
  );

drop policy if exists "Users can update assigned client files" on storage.objects;
create policy "Users can update assigned client files"
  on storage.objects for update
  using (
    bucket_id = 'client-files'
    and (
      can_access_client_files(auth.uid(), public.safe_uuid((storage.foldername(name))[1]))
      or is_admin(auth.uid())
    )
  );

drop policy if exists "Users can delete assigned client files" on storage.objects;
create policy "Users can delete assigned client files"
  on storage.objects for delete
  using (
    bucket_id = 'client-files'
    and (
      can_access_client_files(auth.uid(), public.safe_uuid((storage.foldername(name))[1]))
      or is_admin(auth.uid())
    )
  );

drop policy if exists "Users can upload to assigned client folders" on storage.objects;
create policy "Users can upload to assigned client folders"
  on storage.objects for insert
  with check (
    bucket_id = 'client-files'
    and (
      can_access_client_files(auth.uid(), public.safe_uuid((storage.foldername(name))[1]))
      or is_admin(auth.uid())
    )
  );

insert into public.compliance_settings (key, value, description)
values (
  'staff_hidden_form_types',
  '{"types": []}'::jsonb,
  'Document types a case manager cannot see on their own clients. Chosen in Advanced Tools. Admins always see everything.'
)
on conflict (key) do nothing;

create or replace function public.form_type_hidden_from_staff(_form_type text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select jsonb_exists(value -> 'types', _form_type)
       from public.compliance_settings
      where key = 'staff_hidden_form_types'),
    false
  )
$$;

drop policy if exists "Staff read documents on their own clients" on public.client_forms;
create policy "Staff read documents on their own clients"
  on public.client_forms for select
  to authenticated
  using (
    is_assigned_to_client(auth.uid(), client_id)
    and not public.form_type_hidden_from_staff(form_type)
  );

drop policy if exists "Staff read form files on their own clients" on storage.objects;
create policy "Staff read form files on their own clients"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'client-files'
    and (storage.foldername(name))[1] = 'forms'
    and exists (
      select 1 from public.client_forms cf
       where (cf.file_path = objects.name or cf.original_file_path = objects.name)
         and is_assigned_to_client(auth.uid(), cf.client_id)
         and not public.form_type_hidden_from_staff(cf.form_type)
    )
  );