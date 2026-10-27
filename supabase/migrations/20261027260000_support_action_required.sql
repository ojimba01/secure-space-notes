-- Action required: support asked a follow-up question and waits on the person.
-- Their answer puts the ticket back to Open, the same as a reply to a
-- resolved one.
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check
  check (status in ('open', 'in_progress', 'action_required', 'resolved', 'closed'));

create or replace function public.support_message_touch_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.from_support then
    update public.support_tickets
      set last_support_reply_at = new.created_at, updated_at = now()
      where id = new.ticket_id;
  else
    perform set_config('app.support_reply', 'on', true);
    update public.support_tickets
      set updated_at = now(),
          status = case when status in ('resolved', 'closed', 'action_required') then 'open' else status end,
          resolved_at = case when status in ('resolved', 'closed') then null else resolved_at end
      where id = new.ticket_id;
    perform set_config('app.support_reply', '', true);
  end if;
  return new;
end; $$;
