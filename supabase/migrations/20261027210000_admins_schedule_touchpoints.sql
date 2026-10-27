-- Rebuilding a client's touchpoint schedule deletes the suggested touchpoints
-- and adds them back for the client's case manager. Administrators could
-- delete them but not add them back (only your own events could be created),
-- so an admin's save left that client with nothing scheduled.
drop policy if exists "Admins create events for staff" on public.calendar_events;
create policy "Admins create events for staff"
  on public.calendar_events for insert to authenticated
  with check (public.is_admin(auth.uid()));
