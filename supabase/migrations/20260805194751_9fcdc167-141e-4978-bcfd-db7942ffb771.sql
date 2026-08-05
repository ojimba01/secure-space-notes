alter table public.clients alter column hsp_submitted drop not null, alter column hsp_submitted drop default, alter column auth_180_approved drop not null, alter column auth_180_approved drop default;
update public.clients set hsp_submitted = null where hsp_submitted = false;
update public.clients set auth_180_approved = null where auth_180_approved = false;

create or replace function public.sync_client_billing_cycles(p_client_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare c public.clients%rowtype; n integer; total integer; start_date date; amount numeric;
begin
  select * into c from public.clients where id=p_client_id;
  if not found then return 0; end if;
  update public.billing_cycles set is_active=false where client_id=p_client_id and is_active;
  if c.deleted_at is not null then return 0; end if;
  if coalesce(c.status,'') <> 'active' or not coalesce(c.hsp_submitted,false) or c.auth_150_start is null or public.billing_rate_for_level(c.level_of_need) is null then return 0; end if;
  amount:=public.billing_rate_for_level(c.level_of_need); total:=case when coalesce(c.auth_180_approved,false) then 11 else 5 end;
  for n in 1..total loop
    start_date:=c.auth_150_start+((n-1)*30);
    insert into public.billing_cycles(client_id,cycle_number,phase,cycle_start,cycle_end,billed_amount,is_auto_generated,is_active)
    values(p_client_id,n,case when n<=5 then '150-Day' else '180-Day' end,start_date,start_date+29,amount,true,true)
    on conflict(client_id,cycle_number) do update set phase=excluded.phase,cycle_start=excluded.cycle_start,cycle_end=excluded.cycle_end,billed_amount=excluded.billed_amount,is_active=true,updated_at=now()
    where public.billing_cycles.is_auto_generated=true;
  end loop;
  update public.billing_cycles set is_active=true where client_id=p_client_id and cycle_number between 1 and total;
  return total;
end; $$;