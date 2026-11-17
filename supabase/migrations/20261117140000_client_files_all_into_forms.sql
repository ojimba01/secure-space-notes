-- Client files is removed from the client record. Every file in it is now
-- filed in Forms: a recognised one under its form, any other one under Other
-- documents (form type Unsorted), so nothing is left only in Client files.

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
  kind text;
begin
  select * into f from public.client_files where id = _file_id;
  if not found then
    raise exception 'File not found';
  end if;
  if not (public.is_admin(auth.uid()) or public.can_access_client_files(auth.uid(), f.client_id)) then
    raise exception 'You cannot file documents for this client';
  end if;

  -- A file the reader did not recognise is filed under Other documents.
  kind := coalesce(nullif(btrim(_form_type), ''), 'Unsorted');

  select id into existing from public.client_forms where file_path = f.file_path limit 1;
  if existing is null then
    insert into public.client_forms (
      client_id, employee_id, form_type, title, file_path, original_file_path,
      file_size, status, source, source_filename, created_at
    ) values (
      f.client_id, f.uploaded_by, kind, f.file_name, f.file_path, f.file_path,
      f.file_size, 'submitted', 'manual_upload', f.file_name, f.created_at
    )
    returning id into created;
    existing := created;
  end if;

  update public.client_files set sorted_at = now(), sorted_as = kind where id = _file_id;
  return existing;
end;
$function$;
