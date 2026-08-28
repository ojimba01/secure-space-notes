-- Retire the monthly compliance cron and its orphan calendar events.
--
-- Applied to production 2026-08-28, with Misky's approval, after measuring.
--
-- WHY
-- ---
-- Four pg_cron jobs called the compliance-cron edge function on a schedule.
-- One of its jobs wrote calendar events of type 'touchpoint_suggested'. No
-- code in src/ has ever read that event type -- the app schedules touchpoints
-- itself, in src/lib/touchpoints.ts, as event_type 'touch_point'.
--
-- So two schedulers were running against the same calendar:
--
--   touchpoint_suggested   212 events, 106 clients, still being written
--   touch_point            348 events,  98 clients, the one the app uses
--
--   97 of the 98 clients held both. 23 pairs landed on the same client on the
--   same day. 190 of the suggested events were dated in the future.
--
-- They were not invisible: CaseManagerCalendar has no colour or label entry
-- for the type, so they rendered as unlabelled grey dots beside the teal
-- touchpoints -- not draggable, not completable, and ignored by the coverage
-- calculation.
--
-- The same cron also raised compliance_escalations against a calendar-month
-- model the rest of the app abandoned for rolling 30-day cycles. 143 of the
-- 151 open escalations were for July 2026, raised on 1 August, for a month
-- before the 2026-09-01 go-live. The monthly job was due to run again at
-- 05:00 on 2026-09-01 -- go-live morning -- and raise a fresh batch for
-- August on the same principle.
--
-- WHAT THIS DOES NOT DO
-- ---------------------
-- No table is dropped. client_month_compliance (294 rows) and
-- compliance_escalations (151 rows) are left exactly as they are, so the
-- history stays readable and this is reversible. The edge function itself is
-- left in place; it is simply no longer called.
--
-- To reverse: re-run the schedule statements in
-- supabase/migrations/20260630233651_a2a00406-37ff-4d92-9f70-c76d39a8236e.sql.

-- 1. Stop the four scheduled jobs.
select cron.unschedule('compliance-daily-recompute');
select cron.unschedule('compliance-monthly-emergency');
select cron.unschedule('compliance-monthly-generate');
select cron.unschedule('compliance-weekly-audit');

-- 2. Remove the orphan events. Measured before running:
--      212 rows to delete, 394 to keep
--      0 of them completed, 0 of them manually moved by staff
--    client_contacts.calendar_event_id is the only column referencing a
--    calendar event, it carries no foreign key, and the table has 0 rows.
delete from public.calendar_events where event_type = 'touchpoint_suggested';

-- 3. Verify.
select event_type, count(*) from public.calendar_events group by event_type;
select count(*) as remaining_jobs from cron.job where active;
