-- A short title for each support request, shown in the ticket lists.
alter table public.support_tickets add column if not exists title text;
