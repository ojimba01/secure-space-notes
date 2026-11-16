-- Files uploaded from the client record are stored under the uploader's own
-- folder (`<uploader auth id>/<client id>/...`). When someone else (an admin,
-- or a previous case manager) uploaded them, the assigned case manager could
-- see the file in the list but could not open it. Let anyone who can access
-- the client's files read every file recorded for that client.
create policy "Staff read files on their assigned clients" on storage.objects for select to authenticated
  using (
    bucket_id = 'client-files'
    and exists (
      select 1 from public.client_files f
       where f.file_path = objects.name
         and public.can_access_client_files(auth.uid(), f.client_id)
    )
  );
