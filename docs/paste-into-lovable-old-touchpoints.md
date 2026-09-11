Please run the following SQL against this project's database.

Do not change any application code, do not create or edit any React components,
and do not add anything to the app's UI. Run the SQL exactly as written, then
tell me the numbers from the first SELECT and the last one.

It is safe to run twice — the second run deletes nothing.

```sql
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
```
