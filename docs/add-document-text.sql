-- Make stored documents searchable.
--
-- Run this BEFORE merging the code that reads these columns.
-- Idempotent: safe to run twice.
--
-- WHAT THIS IS FOR
-- ----------------
-- A document in client_forms is a file. The app can hand it to you, but it
-- cannot read it, so "which client's paperwork mentions a warrant of removal"
-- is a question nobody can ask. These columns hold the words on the page.
--
-- WHERE THE TEXT COMES FROM
-- -------------------------
-- In the browser, never on a server. Most PDFs already carry a text layer,
-- which pdf.js reads in milliseconds. Only a file with almost no text is a
-- scan, and those go through the Tesseract engine already self-hosted in
-- public/tesseract/. No client document is transmitted anywhere to be read —
-- see docs/ocr.md.
--
-- ocrmypdf, which the agency used on the archive overnight, is a Python
-- program driving Ghostscript and Tesseract. Supabase edge functions run Deno
-- and have none of those, so there is no server-side equivalent to deploy.

alter table public.client_forms
  add column if not exists extracted_text     text,
  add column if not exists text_char_count    integer,
  add column if not exists page_count         integer,
  -- True when the words came from reading the picture rather than from a text
  -- layer. Worth knowing: OCR of a bad scan is the least reliable text here.
  add column if not exists ocr_applied        boolean not null default false,
  -- Set when a long document was read only as far as the page cap, so a search
  -- that finds nothing in one can say why.
  add column if not exists text_truncated     boolean not null default false,
  add column if not exists processing_status  text not null default 'pending',
  add column if not exists processing_error   text,
  add column if not exists processed_at       timestamptz;

-- pending    queued, nothing read yet
-- processing claimed by a browser that is reading it now
-- done       read, whether or not it produced any words
-- failed     tried and could not be read; processing_error says why
-- skipped    not a PDF, so there is nothing to extract
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_forms_processing_status_check'
  ) then
    alter table public.client_forms
      add constraint client_forms_processing_status_check
      check (processing_status in ('pending','processing','done','failed','skipped'));
  end if;
end $$;

-- A row claimed by a tab that was then closed would sit in 'processing'
-- forever. This is what lets the queue take it back.
alter table public.client_forms
  add column if not exists processing_started_at timestamptz;

-- The searchable form of the text. Generated, so it can never drift from the
-- column it summarises. The title and the original filename are included
-- because a scan that OCR could not read is often still findable by the name a
-- person gave it.
alter table public.client_forms
  add column if not exists text_search tsvector
  generated always as (
    to_tsvector(
      'english',
      coalesce(extracted_text, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(source_filename, '')
    )
  ) stored;

create index if not exists idx_client_forms_text_search
  on public.client_forms using gin (text_search);

-- The queue reads exactly this: the oldest thing not yet done.
create index if not exists idx_client_forms_processing
  on public.client_forms (processing_status, created_at)
  where processing_status in ('pending', 'processing');

-- The review queue: anything the classifier could not place, or could not read.
create index if not exists idx_client_forms_needs_review
  on public.client_forms (created_at desc)
  where form_type = 'Unsorted' or processing_status = 'failed';

-- No new RLS is needed. These are columns on client_forms, so the table's
-- existing policies already decide who can see them, and the text is exactly
-- as sensitive as the file it was read from.

-- Verify.
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'client_forms'
   and column_name in ('extracted_text','text_char_count','page_count','ocr_applied',
                       'text_truncated','processing_status','processing_error',
                       'processed_at','processing_started_at','text_search')
 order by column_name;

select indexname from pg_indexes
 where schemaname = 'public' and tablename = 'client_forms'
   and indexname like 'idx_client_forms_%';
