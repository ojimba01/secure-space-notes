-- Any staff member can add a new client: anyone can do the intake.
--
-- A client a staff member adds is assigned to them, so they can carry on with
-- the intake, forms and touchpoints (all of which follow the assignment). An
-- administrator can reassign it afterwards.
drop policy if exists "Staff add clients to their own caseload" on public.clients;
create policy "Staff add clients to their own caseload"
  on public.clients for insert to authenticated
  with check (assigned_employee_id = public.get_profile_id(auth.uid()));

-- Adding a client with its authorization dates records those authorizations,
-- and so does editing the dates on a client of their own.
drop policy if exists "Assigned staff record their clients' authorizations" on public.client_authorizations;
create policy "Assigned staff record their clients' authorizations"
  on public.client_authorizations for insert to authenticated
  with check (public.is_assigned_to_client(auth.uid(), client_id));

drop policy if exists "Assigned staff update their clients' authorizations" on public.client_authorizations;
create policy "Assigned staff update their clients' authorizations"
  on public.client_authorizations for update to authenticated
  using (public.is_assigned_to_client(auth.uid(), client_id))
  with check (public.is_assigned_to_client(auth.uid(), client_id));
