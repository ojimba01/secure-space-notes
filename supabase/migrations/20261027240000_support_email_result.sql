-- What happened to the support email for a ticket: written by support-notify.
alter table public.support_tickets
  add column if not exists email_result text,
  add column if not exists email_result_at timestamptz;
