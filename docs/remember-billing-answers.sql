-- Remember the per-client billing answers so they are not retyped every cycle.
--
-- Filling in Availity asks three things about the client that do not change
-- from one cycle to the next:
--
--   diagnosis code            already stored, on clients.diagnosis_code
--   patient gender            already stored, on client_intakes.gender
--   relationship to subscriber  had nowhere to live -- this adds it
--
-- Without this the relationship silently defaults to Self on every claim, so a
-- client whose subscriber is a parent or guardian has to be corrected by hand
-- each time, and nothing records that it was ever corrected.
--
-- Additive and nullable: nothing reads it until the code that sets it ships,
-- and existing rows are unaffected. To undo, drop the column.

alter table public.clients
  add column if not exists subscriber_relationship text;

comment on column public.clients.subscriber_relationship is
  'Patient relationship to the subscriber on an Availity claim. Null means Self.';

-- Verify: expect one row.
-- select column_name, data_type, is_nullable
-- from information_schema.columns
-- where table_schema='public' and table_name='clients'
--   and column_name='subscriber_relationship';
