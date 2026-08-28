-- Let a blank form be replaced from inside the app, and record which payer
-- each one belongs to.
--
-- Run this BEFORE merging the code that uses it. Idempotent.
--
-- WHY
-- ---
-- Two problems, one cause: the registry did not describe the templates staff
-- actually fill in.
--
-- 1. There was no way to replace a blank form. The six templates are files in
--    the repository under public/form-templates/, so replacing one meant a
--    code change. When the state or an MCO reissues a form — which they do —
--    nobody at the agency could put the new one in.
--
-- 2. The registry listed five rows, all statewide, and that was correct for
--    what it held: the IAT, the LON and the HSP are New Jersey state forms
--    used for every MCO. But the Aetna prior authorization and the Wellpoint
--    support services request were not in it at all. They were declared only
--    in code, so the registry could not say what it could not see.
--
-- A replaced template is uploaded into its own bucket rather than into
-- client-files. A blank form holds no client data, and the policies on
-- client-files are all keyed on a client id in the first path segment, which
-- a template has no business pretending to have.

-- 1. Somewhere to put them. Private: these are the agency's working copies,
--    some carrying its own provider block already filled in.
insert into storage.buckets (id, name, public)
values ('form-templates', 'form-templates', false)
on conflict (id) do nothing;

-- 2. Anyone signed in may read a blank form; only an admin may change one.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='Signed-in staff can read blank templates') then
    create policy "Signed-in staff can read blank templates"
      on storage.objects for select to authenticated
      using (bucket_id = 'form-templates');
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='Admins can upload blank templates') then
    create policy "Admins can upload blank templates"
      on storage.objects for insert to authenticated
      with check (bucket_id = 'form-templates' and public.is_admin(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='Admins can replace blank templates') then
    create policy "Admins can replace blank templates"
      on storage.objects for update to authenticated
      using (bucket_id = 'form-templates' and public.is_admin(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects'
                 and policyname='Admins can remove blank templates') then
    create policy "Admins can remove blank templates"
      on storage.objects for delete to authenticated
      using (bucket_id = 'form-templates' and public.is_admin(auth.uid()));
  end if;
end $$;

-- 3. Put the two payer-specific forms in the registry, with the payer named.
--    template_path stays pointed at the file shipped in the repository; an
--    upload replaces it with a storage key and the app prefers whichever is
--    recorded here.
insert into public.form_template_registry
  (mco, workflow_purpose, form_type, template_path, template_version, required, active)
select v.mco, v.purpose, v.form_type, v.path, v.version, true, true
from (values
  ('Aetna',     'initial_authorization', 'Prior Authorization Request',
   '/form-templates/aetna-prior-authorization.pdf',        'repo'),
  ('Wellpoint', 'initial_authorization', 'Prior Authorization Request',
   '/form-templates/wellpoint-support-services-request.pdf','repo')
) as v(mco, purpose, form_type, path, version)
where not exists (
  select 1 from public.form_template_registry r
   where r.mco = v.mco and r.form_type = v.form_type
);

-- Verify: seven rows, five statewide and two naming their payer.
select coalesce(mco, 'All MCOs (statewide)') as mco, form_type, workflow_purpose,
       template_path, template_version, active
  from public.form_template_registry
 order by mco nulls first, form_type, workflow_purpose;

select policyname from pg_policies
 where schemaname='storage' and tablename='objects' and policyname ilike '%blank template%'
 order by policyname;
