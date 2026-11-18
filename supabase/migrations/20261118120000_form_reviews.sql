-- Which completed forms an admin has reviewed, for "Forms to review" on the
-- Admin dashboard. Kept apart from client_forms.status: marking a form
-- approved would stop its case manager editing it, and the review trigger
-- clears approved_at on any other status.
create table if not exists public.form_reviews (
  client_form_id uuid primary key references public.client_forms(id) on delete cascade,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz not null default now()
);

alter table public.form_reviews enable row level security;

drop policy if exists "Admins read form reviews" on public.form_reviews;
create policy "Admins read form reviews" on public.form_reviews
  for select to authenticated using (public.is_admin(auth.uid()));

drop policy if exists "Admins record form reviews" on public.form_reviews;
create policy "Admins record form reviews" on public.form_reviews
  for insert to authenticated with check (public.is_admin(auth.uid()));

drop policy if exists "Admins update form reviews" on public.form_reviews;
create policy "Admins update form reviews" on public.form_reviews
  for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "Admins remove form reviews" on public.form_reviews;
create policy "Admins remove form reviews" on public.form_reviews
  for delete to authenticated using (public.is_admin(auth.uid()));
