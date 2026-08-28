-- Retire the billing cycles that ended more than six months ago.
--
-- Why this exists
-- ---------------
-- The billing cycles were generated on 2026-07-01 and backfilled to cover
-- Feb 2025 - Apr 2028. 226 of them were ALREADY past their six-month filing
-- deadline on the day the app created them: the agency had been filing those
-- claims in Availity long before this system existed, and the app has no
-- record of it.
--
-- The result was 229 cycles sitting in the billing queue asking someone to act
-- on work that was either already done elsewhere or was never recoverable.
-- That is the main reason Billing read as confusing and alarming.
--
-- 'Filed before this app' is an approval state meaning "handled outside this
-- system". Like 'Approved' and 'Closed' it makes a cycle resolved, so it drops
-- out of Needs attention, out of the six-month-window list, and out of the
-- billable totals -- without asserting the money was lost, which 'Closed'
-- would imply.
--
-- The rule, as agreed on 2026-08-28: retire any cycle that ended more than six
-- months ago. Nothing still inside its filing window is touched.
--
-- Measured on production immediately before running this:
--   cycles matching        229   (cycle_end 2025-02-05 .. 2026-02-27)
--   clients affected        78
--   scheduled amount   $56,960
--   already carrying a state  0   -- nothing is overwritten
--   already Submitted         0
--
-- To undo: set approval_state back to null where it equals the new value.
-- No other column is written, so the reversal is exact.

begin;

alter table public.billing_cycles
  drop constraint if exists billing_cycles_approval_state_check;

alter table public.billing_cycles
  add constraint billing_cycles_approval_state_check
  check (
    approval_state is null
    or approval_state = any (array[
      'Approved'::text,
      'Closed'::text,
      'Denied (will resubmit)'::text,
      'Filed before this app'::text
    ])
  );

update public.billing_cycles
set approval_state = 'Filed before this app'
where cycle_end < current_date - interval '6 months'
  and approval_state is null;

commit;

-- Verify: expect 229 retired, and 0 cycles left past the filing window.
-- select
--   count(*) filter (where approval_state = 'Filed before this app') as retired,
--   count(*) filter (where approval_state is null
--                      and cycle_end < current_date - interval '6 months') as still_stranded
-- from public.billing_cycles;
