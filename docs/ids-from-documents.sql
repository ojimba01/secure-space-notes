-- Medicaid and NJ HMIS IDs, taken from the documents already on file.
--
-- The reader has been storing the Medicaid number it finds on each document
-- (client_forms.field_medicaid_id); it now finds the NJ HMIS ID too and keeps
-- it in field_njhmis_id. This:
--
--   1. adds that column;
--   2. fills an empty Medicaid ID from the documents straight away, but only
--      where every document that names one names the same one — two different
--      numbers are a question for a person, not a pick for the database;
--   3. puts the documents of clients still missing either ID back in the
--      reader's queue, so the app reads them again and fills the blanks the
--      same way it does for a new upload. Documents that needed OCR are left
--      out: the queue reads text layers only, and re-reading one would replace
--      its OCR'd text with nothing.
--
-- Nothing already on a client record is overwritten.
-- Idempotent. Running it twice changes nothing more.

alter table public.client_forms
  add column if not exists field_njhmis_id text;

-- 2. Medicaid IDs the documents already agree on.
with agreed as (
  select client_id, min(field_medicaid_id) as medicaid_id
  from public.client_forms
  where client_id is not null
    and nullif(trim(field_medicaid_id), '') is not null
  group by client_id
  having count(distinct field_medicaid_id) = 1
)
update public.clients c
set medicaid_id = a.medicaid_id
from agreed a
where c.id = a.client_id
  and nullif(trim(c.medicaid_id), '') is null;

-- 3. Read again what might hold a missing ID.
update public.client_forms f
set processing_status = 'pending',
    processing_started_at = null
from public.clients c
where f.client_id = c.id
  and f.processing_status = 'done'
  and coalesce(f.ocr_applied, false) = false
  and lower(coalesce(f.file_path, '')) like '%.pdf'
  and (nullif(trim(c.njhmis_id), '') is null or nullif(trim(c.medicaid_id), '') is null);

-- ---------------------------------------------------------------------------
-- What happened. documents_queued is how many the app will now re-read.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.clients where nullif(trim(medicaid_id), '') is not null) as clients_with_medicaid_id,
  (select count(*) from public.clients where nullif(trim(njhmis_id), '') is not null)   as clients_with_hmis_id,
  (select count(*) from public.client_forms where processing_status = 'pending')         as documents_queued;
