-- Corrections on forms, and a notification center.
--
-- form_comments: a supervisor's comment on a question of a completed form
-- (field = the PDF box's name), or on the whole form (field null). Picked from
-- ready-made comments, with an optional note. The person who filled the form
-- marks it done once fixed.
--
-- notifications: what a person needs to know: a comment on their form, or an
-- answer a supervisor changed on it.
create table if not exists public.form_comments (
  id uuid primary key default gen_random_uuid(),
  client_form_id uuid not null references public.client_forms(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  field text,
  field_label text,
  preset text,
  body text not null,
  author_id uuid references public.profiles(id) on delete set null,
  recipient_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null
);
create index if not exists form_comments_form on public.form_comments (client_form_id, created_at);
create index if not exists form_comments_recipient on public.form_comments (recipient_id) where resolved_at is null;

alter table public.form_comments enable row level security;

drop policy if exists "Read comments on your forms" on public.form_comments;
create policy "Read comments on your forms" on public.form_comments
  for select to authenticated
  using (public.is_admin(auth.uid()) or recipient_id = public.get_profile_id(auth.uid()) or public.is_assigned_to_client(auth.uid(), client_id));

drop policy if exists "Admins write comments" on public.form_comments;
create policy "Admins write comments" on public.form_comments
  for insert to authenticated
  with check (public.is_admin(auth.uid()) and author_id = public.get_profile_id(auth.uid()));

drop policy if exists "Mark comments done" on public.form_comments;
create policy "Mark comments done" on public.form_comments
  for update to authenticated
  using (public.is_admin(auth.uid()) or recipient_id = public.get_profile_id(auth.uid()))
  with check (public.is_admin(auth.uid()) or recipient_id = public.get_profile_id(auth.uid()));

drop policy if exists "Admins remove comments" on public.form_comments;
create policy "Admins remove comments" on public.form_comments
  for delete to authenticated using (public.is_admin(auth.uid()));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('form_comment', 'form_corrected')),
  title text not null,
  body text,
  client_id uuid references public.clients(id) on delete cascade,
  client_form_id uuid references public.client_forms(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_recipient on public.notifications (recipient_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Read your notifications" on public.notifications;
create policy "Read your notifications" on public.notifications
  for select to authenticated using (recipient_id = public.get_profile_id(auth.uid()));

drop policy if exists "Mark your notifications read" on public.notifications;
create policy "Mark your notifications read" on public.notifications
  for update to authenticated
  using (recipient_id = public.get_profile_id(auth.uid()))
  with check (recipient_id = public.get_profile_id(auth.uid()));

-- Only admins send them (comments, corrections), about someone else's form.
drop policy if exists "Admins send notifications" on public.notifications;
create policy "Admins send notifications" on public.notifications
  for insert to authenticated
  with check (public.is_admin(auth.uid()) and actor_id = public.get_profile_id(auth.uid()));
