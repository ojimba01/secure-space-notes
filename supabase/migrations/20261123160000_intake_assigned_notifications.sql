-- A notification when an admin sends an intake call to a staff member, from
-- the Intake calls page ("Send to staff").
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('form_comment', 'form_corrected', 'intake_assigned'));
