-- One Workbook layout for the whole team (tab names, column order and widths,
-- hidden columns, row order and heights), as the Google Sheet had.
-- Applied to production directly on 2026-09-30.
create table if not exists public.billing_workbook_layout (
  id text primary key default 'team',
  layout jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
alter table public.billing_workbook_layout enable row level security;
drop policy if exists "Admins read the workbook layout" on public.billing_workbook_layout;
create policy "Admins read the workbook layout" on public.billing_workbook_layout for select
  using (public.is_admin(auth.uid()));
drop policy if exists "Admins change the workbook layout" on public.billing_workbook_layout;
create policy "Admins change the workbook layout" on public.billing_workbook_layout for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
insert into public.billing_workbook_layout (id) values ('team') on conflict (id) do nothing;
