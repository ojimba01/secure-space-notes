-- Client files and Forms, linked.
--
-- A file uploaded to Client files (FileManager) used to stay there only, so a
-- form marked complete in Forms could show no file while its PDF sat in
-- Client files. The app now reads each Client file with the same reader as
-- Upload documents (src/lib/documentRecognition.ts) and, when it recognises
-- the document, files it under that form in Forms as well. The file is not
-- copied: the Forms entry points at the same stored file.
--
-- sorted_at marks a file as read, whether or not it was recognised, so it is
-- read once. sorted_as is the form type it was filed under, if any.

alter table public.client_files add column if not exists sorted_at timestamptz;
alter table public.client_files add column if not exists sorted_as text;

-- File one Client file under a form type (or, with _form_type null, just mark
-- it read). The Forms entry keeps the uploader and the upload date, so it says
-- who really added it. Anyone who can see the client's files may run it.
create or replace function public.file_client_file_as_form(_file_id uuid, _form_type text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f public.client_files%rowtype;
  existing uuid;
  created uuid;
begin
  select * into f from public.client_files where id = _file_id;
  if not found then
    raise exception 'File not found';
  end if;
  if not (public.is_admin(auth.uid()) or public.can_access_client_files(auth.uid(), f.client_id)) then
    raise exception 'You cannot file documents for this client';
  end if;

  if _form_type is null or btrim(_form_type) = '' or _form_type in ('Unsorted', 'Blank Form or Template') then
    update public.client_files set sorted_at = now() where id = _file_id;
    return null;
  end if;

  select id into existing from public.client_forms where file_path = f.file_path limit 1;
  if existing is null then
    insert into public.client_forms (
      client_id, employee_id, form_type, title, file_path, original_file_path,
      file_size, status, source, source_filename, created_at
    ) values (
      f.client_id, f.uploaded_by, _form_type, f.file_name, f.file_path, f.file_path,
      f.file_size, 'submitted', 'manual_upload', f.file_name, f.created_at
    )
    returning id into created;
    existing := created;
  end if;

  update public.client_files set sorted_at = now(), sorted_as = _form_type where id = _file_id;
  return existing;
end;
$function$;

grant execute on function public.file_client_file_as_form(uuid, text) to authenticated;
