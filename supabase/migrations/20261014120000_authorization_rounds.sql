-- Rounds: each restart of a client's authorization starts a new round.
--
-- Round 1 is the original; a restart opens round 2, and so on. Nothing from an
-- earlier round is deleted: the app shows the current round and folds earlier
-- ones away. clients.billing_round is the client's current round; authorizations
-- and forms now carry the round they belong to.
--
-- A restart can be marked before the MCO's approval arrives: the type and the
-- start date can both wait (restart_pending_*). Billing and touchpoints wait
-- with them.

alter table public.client_authorizations add column if not exists round integer not null default 1;
alter table public.client_forms add column if not exists round integer not null default 1;

alter table public.clients add column if not exists restart_pending_at timestamptz;
alter table public.clients add column if not exists restart_pending_type text;

comment on column public.client_authorizations.round is 'Which round of the case this authorization belongs to (clients.billing_round when it was recorded).';
comment on column public.client_forms.round is 'Which round of the case this document belongs to. Set from clients.billing_round when filed; admins can move it.';
comment on column public.clients.restart_pending_at is 'Set while a restart is waiting for its start date (and maybe its type).';
comment on column public.clients.restart_pending_type is 'The authorization type of a pending restart, once known.';

-- A form filed now belongs to the client's current round, unless one is given.
create or replace function public.client_forms_set_round()
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

drop trigger if exists client_forms_set_round on public.client_forms;
create trigger client_forms_set_round before insert on public.client_forms
  for each row execute function public.client_forms_set_round();

-- Authorizations likewise.
create or replace function public.client_authorizations_set_round()
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

drop trigger if exists client_authorizations_set_round on public.client_authorizations;
create trigger client_authorizations_set_round before insert on public.client_authorizations
  for each row execute function public.client_authorizations_set_round();
