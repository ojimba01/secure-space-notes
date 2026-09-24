-- Read uploaded documents on the server, on a schedule.
--
-- Calls the document-reader edge function every 10 seconds. Each call reads up
-- to three queued documents and stops, so this works through a backlog of
-- about 1,700 in a couple of hours, and after that reads each new upload
-- within seconds whether or not anybody has the app open.
--
-- An empty queue costs one count query per call and nothing else.
--
-- To stop it:   select cron.unschedule('document-reader');
--
-- Idempotent. Running it again replaces the schedule rather than adding one.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.call_document_reader()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://gotwcbjywtdlyrtfjqnw.supabase.co/functions/v1/document-reader',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end;
$$;
revoke all on function public.call_document_reader() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'document-reader') then
    perform cron.unschedule('document-reader');
  end if;
  -- Every 10 seconds where pg_cron allows it (1.5 and later); every minute
  -- where it does not, which is slower but gets there.
  begin
    perform cron.schedule('document-reader', '10 seconds', 'select public.call_document_reader();');
  exception when others then
    perform cron.schedule('document-reader', '* * * * *', 'select public.call_document_reader();');
  end;
end $$;

-- Did it land? Expect one row, and its schedule.
select jobname, schedule, active from cron.job where jobname = 'document-reader';
