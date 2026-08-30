-- The two cases that were closed but never went inactive.
--
-- NOT YET APPLIED.
--
-- Closing a case set workflow_stage to 'closed' and left status as 'active'.
-- Every screen that hides a closed client reads status, so closing one closed
-- it on paper and left them in the client list, in billing, and in every place
-- a client can be chosen. The code is fixed; these two rows were written
-- before the fix.

update public.clients
   set status = 'closed'
 where deleted_at is null
   and workflow_stage = 'closed'
   and status is distinct from 'closed';

-- Expect: 0.
select count(*) as still_open_but_closed
  from public.clients
 where deleted_at is null and workflow_stage = 'closed' and status is distinct from 'closed';
