update public.calendar_events
   set title = regexp_replace(title, '^Touchpoint\s*[—–-]\s*', '')
 where event_type = 'touch_point'
   and is_auto_generated = true
   and title ~ '^Touchpoint\s*[—–-]\s*';

select count(*) as still_prefixed
  from public.calendar_events
 where event_type = 'touch_point'
   and title ~ '^Touchpoint\s*[—–-]\s*';