-- Superadmins are the ones reading Staff activity, not the people it is about,
-- so they are left off its list (and the app stops recording them).
-- Applied to production directly on 2026-09-30.
create or replace function public.staff_activity_people()
returns table (id uuid, user_id uuid, first_name text, last_name text, email text)
language sql stable security definer set search_path = public as $$
  select p.id, p.user_id, p.first_name, p.last_name, p.email
  from public.profiles p
  where public.can_view_staff_activity(auth.uid())
    and not public.is_superadmin(p.user_id);
$$;
