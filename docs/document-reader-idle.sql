-- Only wake the document reader when there is something to read.
--
-- The schedule in docs/document-reader-cron.sql called the edge function every
-- 10 seconds whether or not a document was waiting: 8,640 calls a day, almost
-- all of them to find an empty queue once the backlog is read. This asks the
-- database first, which is one indexed lookup
-- (idx_client_forms_processing covers exactly these two statuses), and
-- calls the function only when a document is waiting, or when one was left
-- mid-read long enough ago to be handed back (the function does the handing
-- back; 15 minutes matches STALE_CLAIM_MINUTES in _shared/documentReading.ts).
--
-- On a quiet day that is no function calls at all, and an upload is still read
-- within about 10 seconds. The schedule itself is unchanged.
--
-- Idempotent.

create or replace function public.call_document_reader()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.client_forms
    where processing_status = 'pending'
       or (processing_status = 'processing'
           and (processing_started_at is null
                or processing_started_at < now() - interval '15 minutes'))
  ) then
    return;
  end if;

  perform net.http_post(
    url := 'https://gotwcbjywtdlyrtfjqnw.supabase.co/functions/v1/document-reader',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.call_document_reader() from public, anon, authenticated;

-- How much is waiting right now. While this is above zero the reader is called;
-- at zero it is not.
select
  (select count(*) from public.client_forms where processing_status = 'pending')    as waiting,
  (select count(*) from public.client_forms where processing_status = 'processing') as being_read;
