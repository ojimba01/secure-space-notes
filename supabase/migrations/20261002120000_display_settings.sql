-- Text size per account, set by a superadmin in Advanced Tools for someone who
-- needs everything larger. The app zooms the whole page by text_scale for that
-- account, so the layout stays the same and simply fills more of the screen.
create table if not exists public.display_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  text_scale numeric(3,2) not null default 1 check (text_scale >= 1 and text_scale <= 2),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.display_settings enable row level security;

-- Everyone reads their own size; superadmins read and set everyone's.
drop policy if exists "display_settings read own or superadmin" on public.display_settings;
create policy "display_settings read own or superadmin" on public.display_settings
  for select to authenticated
  using (
    public.is_superadmin(auth.uid())
    or exists (select 1 from public.profiles p where p.id = display_settings.profile_id and p.user_id = auth.uid())
  );

drop policy if exists "display_settings superadmin write" on public.display_settings;
create policy "display_settings superadmin write" on public.display_settings
  for all to authenticated
  using (public.is_superadmin(auth.uid()))
  with check (public.is_superadmin(auth.uid()));

drop trigger if exists display_settings_updated_at on public.display_settings;
create trigger display_settings_updated_at
  before update on public.display_settings
  for each row execute function public.update_updated_at_column();
