-- Pre-September touchpoints that nobody worked.
--
-- A first version of this script required is_auto_generated = true and matched
-- nothing: every surviving pre-September event carries `false`. The flag was
-- added after those rows were written, and the events predate it. Measured on
-- the live database before this rewrite:
--
--   touchpoint_suggested   196 rows, 30-31 Aug, none with a contact
--   touch_point            190 rows, 4-22 Jul, none with a contact
--   client_visit            43 rows, 1-11 Jun, none with a contact
--
-- So the filter is the event's type and its date, not a flag that cannot be
-- trusted on old data.
--
-- What goes:
--   * every `touchpoint_suggested`. The retired compliance cron wrote them and
--     nothing in src/ has ever read that type — CaseManagerCalendar has no
--     colour or label for it, so they render as unlabelled dots. The cron was
--     retired on 2026-08-28 and `cron.job` is now empty, so nothing recreates
--     them.
--   * `touch_point` before September that no contact backs and staff never
--     moved by hand.
--
-- What stays:
--   * `client_visit` and every other type a person enters deliberately.
--   * anything staff dragged to a new date.
--   * anything a logged contact points at, or sitting on a day the client was
--     contacted — those show work that happened.

-- ---------------------------------------------------------------------------
-- Before: what is about to go
-- ---------------------------------------------------------------------------
select e.event_type,
       count(*) as will_be_deleted,
       min((e.start_time at time zone 'America/New_York')::date) as earliest,
       max((e.start_time at time zone 'America/New_York')::date) as latest
  from public.calendar_events e
 where (
         e.event_type = 'touchpoint_suggested'
         or (
           e.event_type = 'touch_point'
           and not e.is_manually_adjusted
           and (e.start_time at time zone 'America/New_York')::date < date '2026-09-01'
           and not exists (
             select 1 from public.client_contacts c where c.calendar_event_id = e.id
           )
           and not exists (
             select 1 from public.client_contacts c
              where c.client_id = e.client_id
                and c.contact_date = (e.start_time at time zone 'America/New_York')::date
           )
         )
       )
 group by e.event_type
 order by e.event_type;

-- ---------------------------------------------------------------------------
-- Delete them
-- ---------------------------------------------------------------------------
delete from public.calendar_events e
 where e.event_type = 'touchpoint_suggested';

delete from public.calendar_events e
 where e.event_type = 'touch_point'
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
-- After: expect two zeros. Running this again is a no-op.
-- ---------------------------------------------------------------------------
select
  (select count(*) from public.calendar_events
    where event_type = 'touchpoint_suggested') as suggested_remaining,
  (select count(*) from public.calendar_events e
    where e.event_type = 'touch_point'
      and not e.is_manually_adjusted
      and (e.start_time at time zone 'America/New_York')::date < date '2026-09-01'
      and not exists (
        select 1 from public.client_contacts c where c.calendar_event_id = e.id)
      and not exists (
        select 1 from public.client_contacts c
         where c.client_id = e.client_id
           and c.contact_date = (e.start_time at time zone 'America/New_York')::date)
  ) as unworked_touchpoints_remaining;
