-- A client card whose latest authorization has ended gets a red dotted
-- outline (src/components/ClientCard.tsx). Acknowledge removes it for that
-- person until a later end date passes. One row per person, client and end
-- date; each person reads and adds only their own.

create table if not exists public.authorization_end_acknowledgements (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  end_date date not null,
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, client_id, end_date)
);

alter table public.authorization_end_acknowledgements enable row level security;

drop policy if exists "Own acknowledgements: read" on public.authorization_end_acknowledgements;
create policy "Own acknowledgements: read" on public.authorization_end_acknowledgements
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "Own acknowledgements: add" on public.authorization_end_acknowledgements;
create policy "Own acknowledgements: add" on public.authorization_end_acknowledgements
  for insert to authenticated with check (user_id = auth.uid());

grant select, insert on public.authorization_end_acknowledgements to authenticated;
