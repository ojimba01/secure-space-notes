-- Auto-scheduled touchpoints outlive the cycle that made them.
--
-- The scheduler in src/lib/touchpoints.ts cleans up only the *current* billing
-- window: insertTouchpoints() deletes auto-generated events that fall inside
-- `window`, then writes fresh ones. Everything it suggested in a cycle that has
-- since rolled over is left where it is. Months of never-kept appointments
-- accumulate on the calendar and read as history, which they are not — nobody
-- attended them, and nothing downstream counts them. Compliance is read from
-- client_contacts alone.
--
-- This removes the suggestions that were never worked, from before September
-- 2026. Dates are compared in the agency's time zone (America/New_York), the
-- same one every date on screen is rendered in.
--
-- What it deliberately keeps:
--   * anything a person put on the calendar (is_auto_generated = false)
--   * anything staff moved by hand (is_manually_adjusted = true) — a moved
--     appointment is somebody's decision, not a guess
--   * any event a logged contact points at, or that sits on a day the client
--     was actually contacted. Those show work that happened. Deleting them
--     would erase the visible record of it from the calendar while the contact
--     row survives, which is the worst of both.
--
-- To remove the completed ones as well, delete the two `not exists` blocks.

-- ---------------------------------------------------------------------------
-- Before: what is about to go, and what is being kept
-- ---------------------------------------------------------------------------
select
  count(*) filter (
    where e.is_auto_generated
      and not e.is_manually_adjusted
      and not exists (
        select 1 from public.client_contacts c where c.calendar_event_id = e.id
      )
      and not exists (
        select 1 from public.client_contacts c
         where c.client_id = e.client_id
           and c.contact_date = (e.start_time at time zone 'America/New_York')::date
      )
  ) as will_be_deleted,
  count(*) filter (where e.is_manually_adjusted)   as kept_because_moved_by_hand,
  count(*) filter (where not e.is_auto_generated)  as kept_because_entered_by_a_person
from public.calendar_events e
where e.event_type = 'touch_point'
  and (e.start_time at time zone 'America/New_York')::date < date '2026-09-01';

-- ---------------------------------------------------------------------------
-- Delete them
-- ---------------------------------------------------------------------------
delete from public.calendar_events e
 where e.event_type = 'touch_point'
   and e.is_auto_generated
   and not e.is_manually_adjusted
   and (e.start_time at time zone 'America/New_York')::date < date '2026-09-01'
   and not exists (
     select 1 from public.client_contacts c where c.calendar_event_id = e.id
   )
   and not exists (
     select 1 from public.client_contacts c
      where c.client_id = e.client_id
        and c.contact_date = (e.start_time at time zone 'America/New_York')::date
   );

-- ---------------------------------------------------------------------------
-- After: expect 0. Running this script again is a no-op.
-- ---------------------------------------------------------------------------
select count(*) as unworked_suggestions_remaining
  from public.calendar_events e
 where e.event_type = 'touch_point'
   and e.is_auto_generated
   and not e.is_manually_adjusted
   and (e.start_time at time zone 'America/New_York')::date < date '2026-09-01'
   and not exists (
     select 1 from public.client_contacts c where c.calendar_event_id = e.id
   )
   and not exists (
     select 1 from public.client_contacts c
      where c.client_id = e.client_id
        and c.contact_date = (e.start_time at time zone 'America/New_York')::date
   );
