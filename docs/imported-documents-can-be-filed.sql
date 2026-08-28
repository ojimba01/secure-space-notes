-- An imported document can be filed on a client record.
--
-- Applied to production 2026-08-28, before the code change that goes with it.
--
-- The first real import failed on all 145 files. Both causes are permission
-- rules, not the importer's reading of the documents — the match was perfect:
-- 145 of 145 at high confidence, every one matched on a member ID from the
-- manifest, across 18 clients.
--
-- The first cause is storage, and it is fixed in code rather than here.
-- `commitImport` wrote to `client-files` under `imports/<batch>/`. Every insert
-- policy on that bucket requires the first path segment to be `forms`, the
-- caller's own id, or a client folder the caller can reach. `imports` is none
-- of them, so the upload was refused before the database was ever touched —
-- which is why no orphaned objects were left behind to explain it. The
-- importer now writes to `forms/<client>/`, the folder every other upload in
-- the app already uses.
--
-- The second cause is this policy. Bulk-imported documents are filed
-- `approved` on purpose: they are records of what was already sent to an MCO,
-- not work waiting on someone's review. The only insert policy on
-- `client_forms` allows `draft` and `submitted` and nothing else, so the
-- insert would have been refused next, for an admin as much as for anyone.
--
-- Narrow on purpose. It permits an administrator to file a document that the
-- importer produced, under their own name, and nothing else: a hand-uploaded
-- form still cannot enter approved, and a case manager still cannot file one.

drop policy if exists "Admins file imported documents" on public.client_forms;

create policy "Admins file imported documents"
  on public.client_forms
  for insert
  to authenticated
  with check (
    is_admin(auth.uid())
    and source = 'bulk_import'
    and status = 'approved'
    and employee_id = get_profile_id(auth.uid())
  );

-- Expect: insert_policies = 2 — the existing one for staff, and this one.
select count(*) as insert_policies
  from pg_policies
 where schemaname = 'public'
   and tablename = 'client_forms'
   and cmd = 'INSERT';
