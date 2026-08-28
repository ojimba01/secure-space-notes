-- Move the standalone client notes onto the client profile.
--
-- The Notes section and the Notes tab are gone. Every note written in this app
-- was really a note about a visit, and visit notes belong with the touchpoint
-- that produced them -- but the two notes that exist predate touchpoints, so
-- they go where a person will actually find them: the Summary on the client's
-- Overview tab, which reads clients.notes.
--
-- Checked against production on 2026-08-28 before writing this:
--   client_notes                     2 rows, across 2 clients
--   both clients' clients.notes      already filled  -> this APPENDS, never overwrites
--   calendar_events.note_id          0 of 603 events linked  -> nothing else points at them
--
-- Run this BEFORE merging the code that removes the Notes section, so the
-- content is on the profile before the screen that shows it disappears.
--
-- Safe to re-run: a client whose Summary already carries the marker is skipped.
-- client_notes is deliberately NOT dropped -- it stays as the backup until
-- someone has looked at the migrated text and is happy with it.

begin;

update public.clients c
set notes = concat_ws(
      E'\n\n',
      nullif(btrim(c.notes), ''),
      m.migrated
    )
from (
  select
    n.client_id,
    '[migrated from Notes]' || E'\n' ||
    string_agg(
      to_char(coalesce(n.visit_date, n.created_at), 'YYYY-MM-DD') || ' — ' || n.title
        || coalesce(E'\n' || nullif(btrim(n.content), ''), ''),
      E'\n\n' order by coalesce(n.visit_date, n.created_at)
    ) as migrated
  from public.client_notes n
  group by n.client_id
) m
where m.client_id = c.id
  and position('[migrated from Notes]' in coalesce(c.notes, '')) = 0;

commit;

-- Verify: expect 2 rows, each ending in the migrated block.
-- select count(*) as migrated_clients
-- from public.clients
-- where notes like '%[migrated from Notes]%';
