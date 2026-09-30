-- Staff activity: leave out automatic touchpoint schedule rebuilds, and leave
-- out deactivated staff.
--
-- Saving a client rebuilds its touchpoint schedule: the auto-generated
-- calendar events are deleted and created again. The audit log credits the
-- person who saved, so their timeline filled with "Scheduled" / "Removed from
-- the calendar" pairs they never did. Events someone added or moved by hand
-- still show.

create or replace function public.staff_activity_changes(_from timestamp with time zone, _to timestamp with time zone, _client_id uuid default null::uuid)
 returns table(id uuid, created_at timestamp with time zone, user_id uuid, action text, table_name text, record_id uuid, client_id uuid, changed text[], details jsonb)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select a.id, a.created_at, a.user_id, a.action::text, a.table_name, a.record_id,
    case when a.table_name = 'clients' then a.record_id
         else nullif(coalesce(a.new_data, a.old_data) ->> 'client_id', '')::uuid end,
    case when a.action::text = 'UPDATE' then array(
      select n.key from jsonb_each(a.new_data) n where n.value is distinct from (a.old_data -> n.key)) end,
    jsonb_strip_nulls(jsonb_build_object(
      'form_type', d ->> 'form_type', 'title', d ->> 'title', 'file_name', d ->> 'file_name',
      'source', d ->> 'source', 'status', d ->> 'status', 'old_status', a.old_data ->> 'status',
      'external_status', d ->> 'external_status', 'old_external_status', a.old_data ->> 'external_status',
      'touchpoint_type', d ->> 'touchpoint_type', 'modality', d ->> 'modality', 'contact_date', d ->> 'contact_date',
      'first_name', case when a.table_name = 'clients' then d ->> 'first_name' end,
      'last_name', case when a.table_name = 'clients' then d ->> 'last_name' end))
  from public.audit_logs a
  cross join lateral (select coalesce(a.new_data, a.old_data) as d) x
  where (public.can_view_staff_activity(auth.uid()) or (_client_id is not null and public.is_admin(auth.uid())))
    and a.user_id is not null
    and not (
      a.table_name = 'calendar_events'
      and a.action::text in ('INSERT', 'DELETE')
      and coalesce((d ->> 'is_auto_generated')::boolean, false)
      and not coalesce((d ->> 'is_manually_adjusted')::boolean, false)
    )
    and (_client_id is null
         or (a.table_name = 'clients' and a.record_id = _client_id)
         or (coalesce(a.new_data, a.old_data) ->> 'client_id') = _client_id::text)
    and a.created_at >= _from and a.created_at < _to
  order by a.created_at desc
  limit 5000;
$function$;

create or replace function public.staff_activity_people()
 returns table(id uuid, user_id uuid, first_name text, last_name text, email text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select p.id, p.user_id, p.first_name, p.last_name, p.email
  from public.profiles p
  where public.can_view_staff_activity(auth.uid())
    -- Superadmins are the ones reading Staff activity, not the people it is about.
    and not public.is_superadmin(p.user_id)
    -- Deactivated staff are hidden; they can be reactivated in Advanced tools.
    and coalesce(p.active, true);
$function$;
