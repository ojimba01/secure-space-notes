-- Keep what a document says, as data rather than prose.
--
-- Run this BEFORE merging the code that reads these columns.
-- Idempotent: safe to run twice. Depends on docs/add-document-text.sql.
--
-- WHY
-- ---
-- The reading step puts the words of a document into extracted_text, which
-- makes it searchable. That answers "which paperwork mentions this?" but not
-- "what is the authorization number on it?" — for that, someone still has to
-- open the letter and copy the number across by hand.
--
-- These columns hold the handful of facts worth lifting out of the text.
-- They record WHAT THE DOCUMENT SAYS, which is not the same as what is true:
-- the client record is only filled in from them where it is empty, and a
-- disagreement is reported rather than resolved. A document is evidence, and
-- overwriting a human's entry with a regex would be the wrong way round.
--
-- Everything here is nullable, because most documents carry only a few of
-- these and a missing field is the normal case, not a failure.

alter table public.client_forms
  -- The claim
  add column if not exists field_authorization_number text,
  add column if not exists field_service_start        date,
  add column if not exists field_service_end          date,
  add column if not exists field_total_charges        numeric(12,2),
  -- Who it is about. field_member_name is kept so the name printed on the
  -- document can be checked against the client it was filed under: a billing
  -- memo was once filed on the wrong client, and two clients held each other's
  -- claim receipts.
  add column if not exists field_member_name          text,
  add column if not exists field_member_id            text,
  add column if not exists field_medicaid_id          text,
  add column if not exists field_member_dob           date,
  add column if not exists field_icd10_code           text,
  -- When the MCO wrote, and when the agency filed
  add column if not exists field_notice_date          date,
  add column if not exists field_submission_date      date,
  -- Bookkeeping
  add column if not exists fields_extracted_at        timestamptz,
  -- Every field whose value disagrees with what the client record already
  -- holds, as {column: {document: x, record: y}}. Nothing is overwritten;
  -- this is the report.
  add column if not exists fields_conflict            jsonb;

-- The one check worth being able to ask for directly: documents whose printed
-- name does not look like the client they are filed under.
--   null  = no name could be read, so nothing to compare
--   true  = the names agree
--   false = they do not, and someone should look
alter table public.client_forms
  add column if not exists name_matches_client boolean;

create index if not exists idx_client_forms_name_mismatch
  on public.client_forms (created_at desc)
  where name_matches_client = false;

-- Documents carrying an authorization number, for reconciling against
-- client_authorizations.
create index if not exists idx_client_forms_auth_number
  on public.client_forms (field_authorization_number)
  where field_authorization_number is not null;

-- No new RLS. These are columns on client_forms and its existing policies
-- already decide who can see the document they were read from.

-- Verify.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'client_forms'
   and (column_name like 'field_%' or column_name like 'fields_%'
        or column_name = 'name_matches_client')
 order by column_name;
