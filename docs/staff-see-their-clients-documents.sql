-- A case manager can see the documents on their own clients.
--
-- NOT YET APPLIED. Run this before merging the code change that goes with it.
--
-- Until now a member of staff could see a form only if their own name was on
-- it. Every document the bulk import files is filed under the importing
-- administrator, so of the 145 UHC documents, 76 — belonging to 7 clients —
-- would have been invisible to the case manager carrying that client.
--
-- Misky's decision, 2026-08-28: staff see the documents on their clients, and
-- an administrator picks the types that stay out of sight. One list, chosen in
-- Advanced Tools, rather than a rule maintained in two places. A document type
-- added later is visible unless somebody hides it, which is the safer default:
-- a new type going unnoticed shows too much to the person already carrying the
-- client, rather than silently hiding their own client's paperwork from them.

-- ---------------------------------------------------------------------------
-- 1. A cast that throws, in four live policies
-- ---------------------------------------------------------------------------
-- Four policies on `client-files` read the first path segment and cast it to a
-- uuid, on the assumption that every object sits in a folder named for a
-- client. Forms do not: they sit under `forms/<client>/...`, and 'forms' is not
-- a uuid. The cast raises
--
--     invalid input syntax for type uuid: "forms"
--
-- which fails the whole statement rather than the one policy. Whether it fires
-- depends on the order the planner evaluates an OR in, which is why this has
-- been survivable so far — there were two objects under `forms/`. The UHC
-- import adds 145 more, and staff reading them is the whole point of this file.
--
-- safe_uuid returns null instead of raising. can_access_client_files(uid, null)
-- is false for staff, so the policies keep the meaning they were written with.

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

-- ---------------------------------------------------------------------------
-- 2. The types an administrator has hidden from staff
-- ---------------------------------------------------------------------------
-- Kept where every other setting is kept. Empty to begin with: nothing is
-- hidden until somebody decides it should be.

insert into public.compliance_settings (key, value, description)
values (
  'staff_hidden_form_types',
  '{"types": []}'::jsonb,
  'Document types a case manager cannot see on their own clients. Chosen in Advanced Tools. Admins always see everything.'
)
on conflict (key) do nothing;

-- Security definer so the policy can read the setting whoever is asking.
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

-- ---------------------------------------------------------------------------
-- 3. Staff read the documents on their own clients
-- ---------------------------------------------------------------------------
-- Additive. "Employees view their own forms" stays exactly as it is, so a
-- member of staff never loses sight of something they filed themselves, and an
-- administrator still sees everything including the hidden types.

drop policy if exists "Staff read documents on their own clients" on public.client_forms;
create policy "Staff read documents on their own clients"
  on public.client_forms for select
  to authenticated
  using (
    is_assigned_to_client(auth.uid(), client_id)
    and not public.form_type_hidden_from_staff(form_type)
  );

-- The row is only half of it: opening the document reads the file. Scoped
-- through client_forms so the same hidden-type rule decides both, rather than
-- a folder rule that would drift away from it.
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

-- Expect: hidden_types = 0, and the two new policies present.
select
  (select jsonb_array_length(value -> 'types') from public.compliance_settings
    where key = 'staff_hidden_form_types') as hidden_types,
  (select count(*) from pg_policies where schemaname='public'
     and tablename='client_forms' and policyname='Staff read documents on their own clients') as forms_policy,
  (select count(*) from pg_policies where schemaname='storage'
     and policyname='Staff read form files on their own clients') as storage_policy;
