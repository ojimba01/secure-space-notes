-- Every client is Low Level unless somebody records otherwise, so a blank level
-- of need bills at the Low rate instead of putting the cycle on hold. A value
-- that is neither Low nor High is still unknown and still held.
create or replace function public.billing_rate_for_level(p_level text)
returns numeric
language sql
immutable
set search_path to 'public'
as $$
  select case lower(trim(coalesce(p_level, '')))
    when '' then 320
    when 'low' then 320 when 'low level' then 320
    when 'high' then 640 when 'high level' then 640
    else null end;
$$;

-- Rebuild the cycles held only for a missing level of need.
do $$
declare r record;
begin
  for r in
    select c.id from public.clients c
    where c.status = 'active' and c.deleted_at is null and coalesce(trim(c.level_of_need), '') = ''
  loop
    perform public.sync_client_billing_cycles(r.id);
  end loop;
end $$;
