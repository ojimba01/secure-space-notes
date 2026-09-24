-- lovable-cron-fallback-reviewed: user explicitly requested this exact 10-second schedule to drain a 1,665-document backlog and read new uploads within seconds
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
  begin
    perform cron.schedule('document-reader', '10 seconds', 'select public.call_document_reader();');
  exception when others then
    perform cron.schedule('document-reader', '* * * * *', 'select public.call_document_reader();');
  end;
end $$;

select jobname, schedule, active from cron.job where jobname = 'document-reader';

select exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'client_forms' and column_name = 'field_njhmis_id'
) as hmis_column_exists;