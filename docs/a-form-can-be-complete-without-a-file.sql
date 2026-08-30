-- A form can be recorded as complete without a file.
--
-- NOT YET APPLIED.
--
-- "Mark as complete" has never once worked. It writes a client_forms row with
-- status 'approved' and no file, for a form done on paper or in Availity, and
-- no insert policy allows that shape:
--
--   Employees create forms for assigned clients  -> draft or submitted only
--   Admins file imported documents               -> source 'bulk_import' only
--
-- Production agrees: of 1,876 documents, 1,875 are bulk imports and one is a
-- submitted form. Not a single row was ever recorded this way.
--
-- Narrow on purpose. It permits exactly the shape that button writes: a form
-- with no file, on a client the person is answerable for, under their own
-- name. A form WITH a file still cannot enter approved this way, so nothing
-- can skip review by attaching a document to it.

drop policy if exists "Staff record a form completed elsewhere" on public.client_forms;

create policy "Staff record a form completed elsewhere"
  on public.client_forms
  for insert
  to authenticated
  with check (
    employee_id = get_profile_id(auth.uid())
    and (is_assigned_to_client(auth.uid(), client_id) or is_admin(auth.uid()))
    and status = 'approved'
    and source = 'created_in_app'
    and file_path is null
  );

-- Expect: insert_policies = 3.
select count(*) as insert_policies
  from pg_policies
 where schemaname = 'public' and tablename = 'client_forms' and cmd = 'INSERT';
