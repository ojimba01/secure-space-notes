-- Ticks made by hand on the forms checklist belong to a round too, so a restart
-- starts with its forms unticked while the earlier round keeps its ticks.

alter table public.client_form_checklist add column if not exists round integer not null default 1;

alter table public.client_form_checklist drop constraint if exists client_form_checklist_client_id_form_type_key;
create unique index if not exists client_form_checklist_client_type_round_key
  on public.client_form_checklist (client_id, form_type, round);

create or replace function public.client_form_checklist_set_round()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.round is null or new.round = 1 then
    select coalesce(billing_round, 1) into new.round from public.clients where id = new.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists client_form_checklist_set_round on public.client_form_checklist;
create trigger client_form_checklist_set_round before insert on public.client_form_checklist
  for each row execute function public.client_form_checklist_set_round();
