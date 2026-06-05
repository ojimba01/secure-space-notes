
-- super-admin check
CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'superadmin')
$$;

-- admins includes super-admins
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin') OR public.has_role(_user_id, 'superadmin')
$$;

-- Hide super-admin profiles from non-super users
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (
  is_admin(auth.uid())
  AND (is_superadmin(auth.uid()) OR NOT is_superadmin(user_id))
);

-- Hide super-admin role rows from non-super users (keep own-roles visibility)
DROP POLICY IF EXISTS "Users can view only their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);
CREATE POLICY "Admins can view non-super roles"
ON public.user_roles FOR SELECT
USING (
  is_admin(auth.uid())
  AND (is_superadmin(auth.uid()) OR role <> 'superadmin')
);

-- Only super-admins can deactivate / activate
CREATE OR REPLACE FUNCTION public.deactivate_user(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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

  UPDATE public.profiles
  SET active = false, updated_at = NOW()
  WHERE id = _profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_user(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super-admins can activate users';
  END IF;

  UPDATE public.profiles
  SET active = true, updated_at = NOW()
  WHERE id = _profile_id;
END;
$$;

-- Super-admin-only: grant/revoke the regular admin role
CREATE OR REPLACE FUNCTION public.set_employee_admin(_profile_id uuid, _make_admin boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _target_user_id uuid;
BEGIN
  IF NOT public.is_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super-admins can change admin rights';
  END IF;

  SELECT user_id INTO _target_user_id
  FROM public.profiles
  WHERE id = _profile_id;

  IF _target_user_id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF public.is_superadmin(_target_user_id) THEN
    RAISE EXCEPTION 'Cannot modify a super-admin account';
  END IF;

  IF _make_admin THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (_target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    DELETE FROM public.user_roles
    WHERE user_id = _target_user_id AND role = 'admin';
  END IF;
END;
$$;

-- New-user role mapping: super-admins for the two control accounts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name'
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email IN ('ojimba01@gmail.com', 'admin@supportivecm.org') THEN 'superadmin'::app_role
      ELSE 'employee'::app_role
    END
  );

  RETURN NEW;
END;
$$;
