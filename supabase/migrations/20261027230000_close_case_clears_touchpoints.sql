-- Closing a case also takes its scheduled touchpoints off the calendar: the
-- not-yet-done ones from the day after the closing date. Logged touchpoints
-- and other events stay. Reopening the case schedules them again.
create or replace function public.close_case(_client_id uuid, _reason text, _closed_date date default null::date, _notes text default null::text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _caller uuid := auth.uid();
  _closed date := coalesce(_closed_date, current_date);
begin
  if _caller is null then
    raise exception 'Not signed in';
  end if;

  if not (
    public.is_admin(_caller)
    or exists (
      select 1
        from public.clients c
        join public.profiles p on p.id = c.assigned_employee_id
       where c.id = _client_id
         and p.user_id = _caller
         and p.active = true
    )
  ) then
    raise exception 'That is not your case to close';
  end if;

  update public.clients
     set status = 'closed',
         workflow_stage = 'closed',
         workflow_stage_updated_at = now(),
         closed_date = _closed,
         reason_closed = _reason,
         notes = coalesce(nullif(btrim(_notes), ''), notes)
   where id = _client_id
     and deleted_at is null;

  if not found then
    raise exception 'No such client';
  end if;

  delete from public.calendar_events
   where client_id = _client_id
     and event_type = 'touch_point'
     and coalesce(status, 'scheduled') <> 'completed'
     and start_time >= (_closed + 1)::timestamp;
end;
$function$;

-- Touchpoints already left behind on cases closed before this.
delete from public.calendar_events e
 using public.clients c
 where c.id = e.client_id
   and (c.status = 'closed' or c.workflow_stage = 'closed')
   and e.event_type = 'touch_point'
   and coalesce(e.status, 'scheduled') <> 'completed'
   and e.start_time >= now();
