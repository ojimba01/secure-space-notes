-- Support replies can carry formatting and images.
--
-- body stays the plain-text version (emails, previews, older readers);
-- body_rich, when present, is the formatted version the app shows:
-- [{ "kind": "p" | "li", "runs": [{ "text", "bold"?, "italic"?, "color"? }] }].
-- The app renders it as React elements, never as HTML, and only allows a
-- fixed set of colours.
--
-- Images support attaches live in support's own folder, which the person
-- could not read; they now can, for messages on their own tickets.

alter table public.support_ticket_messages add column if not exists body_rich jsonb;

drop policy if exists "Read support attachments on own tickets" on storage.objects;
create policy "Read support attachments on own tickets" on storage.objects for select to authenticated
  using (
    bucket_id = 'support-attachments'
    and exists (
      select 1
      from public.support_ticket_messages m
      join public.support_tickets t on t.id = m.ticket_id
      where t.created_by = auth.uid()
        and m.attachments @> jsonb_build_array(jsonb_build_object('path', storage.objects.name))
    )
  );
