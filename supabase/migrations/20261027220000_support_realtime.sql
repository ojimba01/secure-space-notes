-- Replies and status changes reach the person who asked as they happen, so the
-- app can show them a pop-up straight away. Row-level security still decides
-- who receives which change.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'support_tickets') then
    alter publication supabase_realtime add table public.support_tickets;
  end if;
end $$;
