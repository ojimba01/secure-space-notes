-- Calendar entries say who, not what kind.
--
-- NOT YET APPLIED.
--
-- Auto-scheduled touchpoints were titled "Touchpoint — Jane Doe". In a week
-- view every one of them starts with the same nine characters, so the column
-- reads as a wall of the word Touchpoint and the names -- the only part that
-- differs, and the only part anyone is looking for -- get pushed along and
-- truncated. The code now writes the name alone; this fixes the rows written
-- before it.
--
-- Only auto-generated touchpoint titles are touched. A title somebody typed
-- themselves is left exactly as they typed it, even if it happens to start
-- with the same word.

update public.calendar_events
   set title = regexp_replace(title, '^Touchpoint\s*[—–-]\s*', '')
 where event_type = 'touch_point'
   and is_auto_generated = true
   and title ~ '^Touchpoint\s*[—–-]\s*';

-- Expect: 0 left carrying the prefix.
select count(*) as still_prefixed
  from public.calendar_events
 where event_type = 'touch_point'
   and title ~ '^Touchpoint\s*[—–-]\s*';
