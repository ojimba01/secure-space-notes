-- ============================================================
-- Who made the contact, and who typed it in, are two different people.
--
-- A supervisor entering a visit a case manager made needs the record to say
-- so. Overwriting employee_id with the supervisor would misattribute the
-- contact; leaving it silent would hide that the note is second-hand. Both
-- matter on a record that documents care.
--
-- employee_id  = who had the contact with the client (unchanged meaning)
-- entered_by   = who keyed it in, when that is somebody else. Null is the
--                normal case: the person who made the contact entered it.
--
-- Cycle compliance is counted per client, not per employee, so this changes
-- no billing or touchpoint maths.
-- ============================================================

alter table public.client_contacts
  add column if not exists entered_by uuid references public.profiles(id);

comment on column public.client_contacts.entered_by is
  'Set only when someone other than the contacting employee recorded this — '
  'e.g. a supervisor entering a visit on a case manager''s behalf. '
  'Null means employee_id both made and recorded the contact.';

-- The staged NJHMIS note carries the same distinction, so an export or a
-- manual keying session can show who to ask about it.
alter table public.njhmis_progress_notes
  add column if not exists entered_by uuid references public.profiles(id);

comment on column public.njhmis_progress_notes.entered_by is
  'Set only when someone other than the contacting employee recorded this. '
  'Null means employee_id both made and recorded the contact.';

create index if not exists idx_client_contacts_entered_by
  on public.client_contacts(entered_by) where entered_by is not null;
