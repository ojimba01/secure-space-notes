-- A 2nd (3rd, ...) authorization for a client whose earlier authorization
-- lapsed. Each authorization round gets its own billing cycles, numbered after
-- the earlier rounds' cycles, so starting a new round never overwrites a cycle
-- that was already billed.

alter table public.clients add column if not exists billing_round integer not null default 1;
alter table public.billing_cycles add column if not exists round integer not null default 1;

create or replace function public.sync_client_billing_cycles(p_client_id uuid)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c public.clients%rowtype;
  r integer;
  base integer;
  amount numeric;
  service_start date;
  cont_start date;
  has_initial boolean := false;
  n integer;
  k integer;
  s date;
  e date;
  ph text;
  hold boolean;
  reason text;
  total integer;
begin
  select * into c from public.clients where id = p_client_id;
  if not found then return 0; end if;

  -- A closed or deleted case bills nothing, in any round.
  if c.deleted_at is not null or coalesce(c.status,'') <> 'active' then
    update public.billing_cycles set is_active = false where client_id = p_client_id and is_active;
    return 0;
  end if;

  r := greatest(coalesce(c.billing_round, 1), 1);
  -- This round's cycles are numbered after every cycle of the earlier rounds.
  select coalesce(max(cycle_number), 0) into base
    from public.billing_cycles where client_id = p_client_id and round < r;
  n := base;

  update public.billing_cycles set is_active = false
    where client_id = p_client_id and round = r and is_active;

  service_start := coalesce(c.auth_30_start, c.auth_150_start);
  if service_start is null then return 0; end if;

  amount := public.billing_rate_for_level(c.level_of_need);
  has_initial := c.auth_30_start is not null
                 and (c.auth_150_start is null or c.auth_150_start > c.auth_30_start);

  -- First cycle = initial 30-day service period (billable, may be on hold)
  if has_initial then
    n := n + 1;
    s := c.auth_30_start;
    e := s + 29;
    hold := (c.auth_150_start is null) or (amount is null);
    reason := case
      when c.auth_150_start is null and amount is null then 'On hold — awaiting continuation authorization and LoN rate confirmation'
      when c.auth_150_start is null then 'On hold — awaiting continuation authorization'
      when amount is null then 'On hold — awaiting LoN rate confirmation'
      else null end;
    insert into public.billing_cycles(client_id,round,cycle_number,phase,cycle_start,cycle_end,billed_amount,is_auto_generated,is_active,on_hold,hold_reason)
    values (p_client_id, r, n, 'Initial 30-Day', s, e, amount, true, true, hold, reason)
    on conflict (client_id,cycle_number) do update
      set round = excluded.round, phase = excluded.phase, cycle_start = excluded.cycle_start, cycle_end = excluded.cycle_end,
          billed_amount = excluded.billed_amount, is_active = true,
          on_hold = excluded.on_hold, hold_reason = excluded.hold_reason, updated_at = now()
      where public.billing_cycles.is_auto_generated = true;
  end if;

  cont_start := c.auth_150_start;
  if cont_start is not null then
    -- continuation (150-day) periods, then the 180-day extension when approved
    for k in 1..(case when coalesce(c.auth_180_approved,false) then 11 else 5 end) loop
      n := n + 1;
      s := cont_start + ((k - 1) * 30);
      e := s + 29;
      ph := case when k <= 5 then '150-Day' else '180-Day' end;
      hold := amount is null;
      reason := case when amount is null then 'On hold — awaiting LoN rate confirmation' else null end;
      insert into public.billing_cycles(client_id,round,cycle_number,phase,cycle_start,cycle_end,billed_amount,is_auto_generated,is_active,on_hold,hold_reason)
      values (p_client_id, r, n, ph, s, e, amount, true, true, hold, reason)
      on conflict (client_id,cycle_number) do update
        set round = excluded.round, phase = excluded.phase, cycle_start = excluded.cycle_start, cycle_end = excluded.cycle_end,
            billed_amount = excluded.billed_amount, is_active = true,
            on_hold = excluded.on_hold, hold_reason = excluded.hold_reason, updated_at = now()
        where public.billing_cycles.is_auto_generated = true;
    end loop;
  end if;

  total := n;
  update public.billing_cycles set is_active = true
    where client_id = p_client_id and round = r and cycle_number between base + 1 and total and total > base;
  update public.billing_cycles set is_active = false
    where client_id = p_client_id and round = r and cycle_number > total and is_auto_generated = true;
  return total - base;
end;
$function$;
