-- Suggested updates a person declined (the X beside a suggestion on the
-- client's Overview), so they do not come back. One row per client and
-- suggestion; the key names the field and the value the document gave
-- (src/lib/documentSuggestions.ts). Anyone who can work the client can read
-- and add them.

create table if not exists public.document_suggestion_dismissals (
  client_id uuid not null references public.clients(id) on delete cascade,
  suggestion_key text not null,
  dismissed_by uuid default auth.uid(),
  dismissed_at timestamptz not null default now(),
  primary key (client_id, suggestion_key)
);

alter table public.document_suggestion_dismissals enable row level security;

drop policy if exists "Staff read dismissals on their clients" on public.document_suggestion_dismissals;
create policy "Staff read dismissals on their clients" on public.document_suggestion_dismissals
  for select to authenticated
  using (public.is_admin(auth.uid()) or public.is_assigned_to_client(auth.uid(), client_id));

drop policy if exists "Staff dismiss on their clients" on public.document_suggestion_dismissals;
create policy "Staff dismiss on their clients" on public.document_suggestion_dismissals
  for insert to authenticated
  with check (
    dismissed_by = auth.uid()
    and (public.is_admin(auth.uid()) or public.is_assigned_to_client(auth.uid(), client_id))
  );

grant select, insert on public.document_suggestion_dismissals to authenticated;
