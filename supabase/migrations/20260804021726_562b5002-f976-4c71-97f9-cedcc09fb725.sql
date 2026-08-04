alter table public.clients
  add column if not exists hsp_submitted boolean not null default false,
  add column if not exists auth_180_approved boolean not null default false,
  add column if not exists billing_tracking_start date not null default current_date;

alter table public.billing_cycles
  add column if not exists is_active boolean not null default true;

update public.clients
set hsp_submitted = true
where auth_150_start is not null
  and hsp_submitted = false;

update public.clients
set auth_180_approved = true
where nullif(trim(auth_180_number), '') is not null
  and auth_180_approved = false;

create or replace function public.billing_rate_for_level(p_level text)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case lower(trim(coalesce(p_level, '')))
    when 'low' then 320
    when 'low level' then 320
    when 'high' then 640
    when 'high level' then 640
    else null
  end;
$$;

create or replace function public.sync_client_billing_cycles(p_client_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.clients%rowtype;
  cycle_count integer := 0;
  n integer;
  cycle_start_date date;
  amount numeric;
begin
  select * into c
  from public.clients
  where id = p_client_id;

  if not found then
    return 0;
  end if;

  update public.billing_cycles
  set is_active = false
  where client_id = p_client_id
    and is_active = true;

  if c.status <> 'active'
     or not c.hsp_submitted
     or c.auth_150_start is null
     or public.billing_rate_for_level(c.level_of_need) is null then
    return 0;
  end if;

  amount := public.billing_rate_for_level(c.level_of_need);
  cycle_count := case when c.auth_180_approved then 11 else 5 end;

  for n in 1..cycle_count loop
    cycle_start_date := c.auth_150_start + ((n - 1) * 30);

    insert into public.billing_cycles (
      client_id,
      cycle_number,
      phase,
      cycle_start,
      cycle_end,
      billed_amount,
      is_auto_generated,
      is_active
    ) values (
      p_client_id,
      n,
      case when n <= 5 then '150-Day' else '180-Day' end,
      cycle_start_date,
      cycle_start_date + 29,
      amount,
      true,
      true
    )
    on conflict (client_id, cycle_number) do update
    set phase = excluded.phase,
        cycle_start = excluded.cycle_start,
        cycle_end = excluded.cycle_end,
        billed_amount = excluded.billed_amount,
        is_active = true,
        updated_at = now()
    where public.billing_cycles.is_auto_generated = true;
  end loop;

  update public.billing_cycles
  set is_active = true
  where client_id = p_client_id
    and cycle_number between 1 and cycle_count;

  return cycle_count;
end;
$$;

create or replace function public.set_authorization_dates_and_sync_cycles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.auth_150_start is not null then
    new.auth_150_end := new.auth_150_start + 149;
  else
    new.auth_150_end := null;
  end if;

  if new.auth_180_approved and new.auth_150_start is not null then
    new.auth_180_start := new.auth_150_start + 150;
    new.auth_180_end := new.auth_150_start + 329;
  else
    new.auth_180_start := null;
    new.auth_180_end := null;
  end if;

  return new;
end;
$$;

drop trigger if exists set_authorization_dates_before_save on public.clients;
create trigger set_authorization_dates_before_save
before insert or update of auth_150_start, auth_180_approved
on public.clients
for each row
execute function public.set_authorization_dates_and_sync_cycles();

create or replace function public.sync_cycles_after_client_save()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_client_billing_cycles(new.id);
  return new;
end;
$$;

drop trigger if exists sync_billing_cycles_after_client_save on public.clients;
create trigger sync_billing_cycles_after_client_save
after insert or update of status, hsp_submitted, auth_150_start,
  auth_180_approved, level_of_need
on public.clients
for each row
execute function public.sync_cycles_after_client_save();

drop policy if exists "Superadmins can manage billing" on public.billing_cycles;
drop policy if exists "Admins can manage billing" on public.billing_cycles;
create policy "Admins can manage billing"
on public.billing_cycles
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

create index if not exists idx_billing_cycles_active_deadline
on public.billing_cycles (is_active, cycle_end);

do $$
declare
  client_record record;
begin
  for client_record in select id from public.clients loop
    perform public.sync_client_billing_cycles(client_record.id);
  end loop;
end;
$$;