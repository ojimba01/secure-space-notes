-- 1. Workflow / referral fields on clients (non-destructive)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS workflow_stage text NOT NULL DEFAULT 'referred',
  ADD COLUMN IF NOT EXISTS workflow_stage_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS referral_source text,
  ADD COLUMN IF NOT EXISTS referral_channel text,
  ADD COLUMN IF NOT EXISTS referral_received_date date,
  ADD COLUMN IF NOT EXISTS referred_by text,
  ADD COLUMN IF NOT EXISTS intake_status text NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS intake_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS initial_authorization_status text,
  ADD COLUMN IF NOT EXISTS continuation_authorization_status text,
  ADD COLUMN IF NOT EXISTS lon_score integer,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS njhmis_id text,
  ADD COLUMN IF NOT EXISTS diagnosis_code text;

-- Back-fill a sensible workflow stage for existing records
UPDATE public.clients SET workflow_stage = CASE
  WHEN closed_date IS NOT NULL OR coalesce(status,'') = 'closed' THEN 'closed'
  WHEN coalesce(auth_180_approved,false) THEN 'active_authorization'
  WHEN auth_150_start IS NOT NULL THEN 'active_authorization'
  WHEN auth_30_start IS NOT NULL THEN 'initial_30_active'
  WHEN iat_date IS NOT NULL THEN 'initial_auth_pending'
  ELSE 'referred' END
WHERE workflow_stage = 'referred';

UPDATE public.clients
SET intake_status = 'complete', intake_completed_at = coalesce(intake_completed_at, (intake_date::timestamptz))
WHERE intake_date IS NOT NULL AND intake_status = 'not_started';

-- 2. Billing hold support
ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS on_hold boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hold_reason text;

-- 3. Never erase human-entered authorization dates
CREATE OR REPLACE FUNCTION public.set_billing_authorization_dates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- derive the 150-day end only when it was not supplied
  if new.auth_150_end is null and new.auth_150_start is not null then
    new.auth_150_end := new.auth_150_start + 149;
  end if;

  -- derive 180-day dates only when approved AND not already supplied.
  -- explicit dates from an MCO notice are never cleared or overwritten.
  if coalesce(new.auth_180_approved,false) and new.auth_150_start is not null then
    if new.auth_180_start is null then
      new.auth_180_start := new.auth_150_start + 150;
    end if;
    if new.auth_180_end is null then
      new.auth_180_end := coalesce(new.auth_180_start, new.auth_150_start + 150) + 179;
    end if;
  end if;

  return new;
end;
$function$;

-- keep the older duplicate trigger function in sync (same safe behaviour)
CREATE OR REPLACE FUNCTION public.set_authorization_dates_and_sync_cycles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if new.auth_150_end is null and new.auth_150_start is not null then
    new.auth_150_end := new.auth_150_start + 149;
  end if;
  if coalesce(new.auth_180_approved,false) and new.auth_150_start is not null then
    if new.auth_180_start is null then new.auth_180_start := new.auth_150_start + 150; end if;
    if new.auth_180_end is null then new.auth_180_end := coalesce(new.auth_180_start, new.auth_150_start + 150) + 179; end if;
  end if;
  return new;
end;
$function$;

-- 4. Authoritative cycle generation: initial 30-day period is Cycle 1
CREATE OR REPLACE FUNCTION public.sync_client_billing_cycles(p_client_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  c public.clients%rowtype;
  amount numeric;
  service_start date;
  cont_start date;
  has_initial boolean := false;
  n integer := 0;
  k integer;
  s date;
  e date;
  ph text;
  hold boolean;
  reason text;
  total integer := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if not found then return 0; end if;

  update public.billing_cycles set is_active = false where client_id = p_client_id and is_active;
  if c.deleted_at is not null then return 0; end if;
  if coalesce(c.status,'') <> 'active' then return 0; end if;

  service_start := coalesce(c.auth_30_start, c.auth_150_start);
  if service_start is null then return 0; end if;

  amount := public.billing_rate_for_level(c.level_of_need);
  has_initial := c.auth_30_start is not null
                 and (c.auth_150_start is null or c.auth_150_start > c.auth_30_start);

  -- Cycle 1 = initial 30-day service period (billable, may be on hold)
  if has_initial then
    n := 1;
    s := c.auth_30_start;
    e := s + 29;
    hold := (c.auth_150_start is null) or (amount is null);
    reason := case
      when c.auth_150_start is null and amount is null then 'On hold — awaiting continuation authorization and LoN rate confirmation'
      when c.auth_150_start is null then 'On hold — awaiting continuation authorization'
      when amount is null then 'On hold — awaiting LoN rate confirmation'
      else null end;
    insert into public.billing_cycles(client_id,cycle_number,phase,cycle_start,cycle_end,billed_amount,is_auto_generated,is_active,on_hold,hold_reason)
    values (p_client_id, n, 'Initial 30-Day', s, e, amount, true, true, hold, reason)
    on conflict (client_id,cycle_number) do update
      set phase = excluded.phase, cycle_start = excluded.cycle_start, cycle_end = excluded.cycle_end,
          billed_amount = excluded.billed_amount, is_active = true,
          on_hold = excluded.on_hold, hold_reason = excluded.hold_reason, updated_at = now()
      where public.billing_cycles.is_auto_generated = true;
  end if;

  cont_start := c.auth_150_start;
  if cont_start is null then
    total := n;
    update public.billing_cycles set is_active = true
      where client_id = p_client_id and cycle_number between 1 and greatest(total,1) and total > 0;
    return total;
  end if;

  -- continuation (150-day) periods, then the 180-day extension when approved
  for k in 1..(case when coalesce(c.auth_180_approved,false) then 11 else 5 end) loop
    n := n + 1;
    s := cont_start + ((k - 1) * 30);
    e := s + 29;
    ph := case when k <= 5 then '150-Day' else '180-Day' end;
    hold := amount is null;
    reason := case when amount is null then 'On hold — awaiting LoN rate confirmation' else null end;
    insert into public.billing_cycles(client_id,cycle_number,phase,cycle_start,cycle_end,billed_amount,is_auto_generated,is_active,on_hold,hold_reason)
    values (p_client_id, n, ph, s, e, amount, true, true, hold, reason)
    on conflict (client_id,cycle_number) do update
      set phase = excluded.phase, cycle_start = excluded.cycle_start, cycle_end = excluded.cycle_end,
          billed_amount = excluded.billed_amount, is_active = true,
          on_hold = excluded.on_hold, hold_reason = excluded.hold_reason, updated_at = now()
      where public.billing_cycles.is_auto_generated = true;
  end loop;

  total := n;
  update public.billing_cycles set is_active = true
    where client_id = p_client_id and cycle_number between 1 and total;
  update public.billing_cycles set is_active = false
    where client_id = p_client_id and cycle_number > total and is_auto_generated = true;
  return total;
end;
$function$;

-- 5. Permission-safe server-side regeneration for staff workflows
GRANT EXECUTE ON FUNCTION public.sync_client_billing_cycles(uuid) TO authenticated;