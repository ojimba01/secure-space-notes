-- Clinical Notes: notes built from structured selections.
--
-- The selections are the source of truth; the narrative is generated from
-- them and then reviewed (and possibly edited) by the case manager. Both are
-- kept, so anyone auditing a note can see which facts produced it.
--
-- A note is either a draft (no client, nothing saved to a record yet) or saved
-- with a touchpoint (client_contacts) and its staged NJHMIS progress note.

create table if not exists public.clinical_notes (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'saved' check (status in ('draft', 'saved')),
  client_id uuid references public.clients(id) on delete cascade,
  contact_id uuid references public.client_contacts(id) on delete set null,
  njhmis_note_id uuid,

  -- Contact details, copied from the touchpoint when there is one.
  contact_date date,
  duration_minutes integer,
  contact_method text,
  face_to_face boolean,
  service_type text,
  location text,
  progress_note_type text,

  -- The structured facts.
  primary_topic text,
  secondary_topics text[] not null default '{}',
  selections jsonb not null default '{}'::jsonb,
  interventions jsonb not null default '[]'::jsonb,
  consumer_response jsonb not null default '[]'::jsonb,
  outcome jsonb,
  barriers jsonb not null default '[]'::jsonb,
  next_actions jsonb,
  free_text text,

  -- The prose.
  generated_narrative text,
  final_narrative text,
  generator text,
  reviewed_at timestamptz,

  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clinical_notes_saved_has_client check (status = 'draft' or client_id is not null)
);

create index if not exists clinical_notes_client_idx on public.clinical_notes (client_id, created_at desc);
create index if not exists clinical_notes_creator_idx on public.clinical_notes (created_by, status, created_at desc);

alter table public.clinical_notes enable row level security;

-- Your own notes, your clients' notes, or any note if you are an admin.
create policy "Clinical notes are visible to their author, the client's staff and admins"
  on public.clinical_notes for select
  using (
    created_by = auth.uid()
    or public.is_admin(auth.uid())
    or (client_id is not null and public.is_assigned_to_client(auth.uid(), client_id))
  );

create policy "Staff write their own clinical notes for clients they can reach"
  on public.clinical_notes for insert
  with check (
    created_by = auth.uid()
    and (client_id is null or public.is_admin(auth.uid()) or public.is_assigned_to_client(auth.uid(), client_id))
  );

create policy "Authors and admins update clinical notes"
  on public.clinical_notes for update
  using (created_by = auth.uid() or public.is_admin(auth.uid()))
  with check (
    (created_by = auth.uid() or public.is_admin(auth.uid()))
    and (client_id is null or public.is_admin(auth.uid()) or public.is_assigned_to_client(auth.uid(), client_id))
  );

create policy "Authors delete their drafts; admins delete any"
  on public.clinical_notes for delete
  using ((created_by = auth.uid() and status = 'draft') or public.is_admin(auth.uid()));

create trigger update_clinical_notes_updated_at
  before update on public.clinical_notes
  for each row execute function public.update_updated_at_column();

create trigger audit_clinical_notes
  after insert or update or delete on public.clinical_notes
  for each row execute function public.audit_trigger_function();
