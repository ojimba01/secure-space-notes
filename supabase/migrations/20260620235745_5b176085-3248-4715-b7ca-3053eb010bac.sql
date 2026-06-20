CREATE OR REPLACE FUNCTION public.deactivate_user(_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super-admins can deactivate users';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _profile_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;

  -- Unassign any clients still attached to this employee so they don't stay silently assigned
  UPDATE public.clients
  SET assigned_employee_id = NULL, updated_at = NOW()
  WHERE assigned_employee_id = _profile_id;

  UPDATE public.profiles
  SET active = false, updated_at = NOW()
  WHERE id = _profile_id;
END;
$function$;

-- One-time corrective sweep: unassign clients tied to any already-inactive employee
UPDATE public.clients c
SET assigned_employee_id = NULL, updated_at = NOW()
FROM public.profiles p
WHERE c.assigned_employee_id = p.id
  AND p.active = false;