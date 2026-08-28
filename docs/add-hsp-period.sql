-- The Housing Stabilization Plan has a period, not just a deadline.
--
-- Run this BEFORE merging the code that uses it. Idempotent, additive.
--
-- The client record held one HSP date: hsp_due_date, the deadline for getting
-- the plan submitted, thirty days from the authorization start. Staff need the
-- period the plan itself covers, which is a different thing and was nowhere.
--
-- hsp_due_date is left exactly as it is. It drives hspDueDateFor() and the
-- HSP_WINDOW_DAYS logic, and it is a deadline rather than an end date; making
-- one column mean both is how "approval status" went wrong.
alter table public.clients
  add column if not exists hsp_start_date date,
  add column if not exists hsp_end_date   date;

comment on column public.clients.hsp_start_date is
  'First day the Housing Stabilization Plan covers. Not the submission deadline — that is hsp_due_date.';
comment on column public.clients.hsp_end_date is
  'Last day the Housing Stabilization Plan covers.';

select column_name, data_type from information_schema.columns
 where table_schema='public' and table_name='clients'
   and column_name in ('hsp_start_date','hsp_end_date','hsp_due_date')
 order by column_name;
