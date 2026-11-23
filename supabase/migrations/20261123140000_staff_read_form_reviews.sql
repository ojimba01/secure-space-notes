-- Staff see which of their clients' forms an admin has reviewed, so the
-- Intake calls page shows a package as Reviewed for them too.
drop policy if exists "Staff read reviews of their clients' forms" on public.form_reviews;
create policy "Staff read reviews of their clients' forms" on public.form_reviews
  for select to authenticated
  using (exists (select 1 from public.client_forms f where f.id = client_form_id and public.is_assigned_to_client(auth.uid(), f.client_id)));
