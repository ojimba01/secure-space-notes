-- Admins can deactivate and reactivate staff accounts, as superadmins can.
-- Only a superadmin can deactivate or reactivate a superadmin, and nobody can
-- deactivate their own account.

create or replace function public.deactivate_user(_profile_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can deactivate users';
  end if;

  if exists (select 1 from public.profiles where id = _profile_id and user_id = auth.uid()) then
    raise exception 'You cannot deactivate your own account';
  end if;

  if not public.is_superadmin(auth.uid()) and exists (
    select 1 from public.profiles where id = _profile_id and public.is_superadmin(user_id)
  ) then
    raise exception 'Only super-admins can deactivate a super-admin';
  end if;

  -- Unassign any clients still attached to this employee so they don't stay silently assigned
  update public.clients
  set assigned_employee_id = null, updated_at = now()
  where assigned_employee_id = _profile_id;

  update public.profiles
  set active = false, updated_at = now()
  where id = _profile_id;
end;
$function$;

create or replace function public.activate_user(_profile_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'Only admins can activate users';
  end if;

  if not public.is_superadmin(auth.uid()) and exists (
    select 1 from public.profiles where id = _profile_id and public.is_superadmin(user_id)
  ) then
    raise exception 'Only super-admins can activate a super-admin';
  end if;

  update public.profiles
  set active = true, updated_at = now()
  where id = _profile_id;
end;
$function$;
