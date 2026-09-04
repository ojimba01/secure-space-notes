-- ============================================================
-- jboyer@supportivecm.org is an administrator.
--
-- Roles are assigned by handle_new_user at the moment an account is created,
-- so a named email has to be on the list before the person signs up. Every
-- earlier migration of this kind carried a warning to run it first, because
-- an account made ahead of it came out as an employee and had to be corrected
-- by hand.
--
-- This one does not need the warning. It adds the email to the list for an
-- account that does not exist yet, and corrects the role of one that does, so
-- it is right either way round.
--
-- Administrator, not superadmin: the admin dashboard, billing and every
-- client, but not the superadmin tools or the ability to view as somebody
-- else.
--
-- Idempotent: running it twice is harmless.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
      WHEN lower(NEW.email) IN (
        'ojimba01@gmail.com',
        'ojimba01@outlook.com',
        'admin@supportivecm.org',
        'mdajimba@gmail.com'
      ) THEN 'superadmin'::app_role
      WHEN lower(NEW.email) IN (
        'jboyer@supportivecm.org'
      ) THEN 'admin'::app_role
      ELSE 'employee'::app_role
    END
  );

  RETURN NEW;
END;
$function$;

-- If the account is already there, the trigger has been and gone. Give it the
-- role it should have had, and take away the employee row it was given
-- instead, so nothing reads their access two different ways.
DO $$
DECLARE
  existing_user uuid;
BEGIN
  SELECT id INTO existing_user
  FROM auth.users
  WHERE lower(email) = 'jboyer@supportivecm.org'
  LIMIT 1;

  IF existing_user IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (existing_user, 'admin'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;

    DELETE FROM public.user_roles
    WHERE user_id = existing_user
      AND role = 'employee'::app_role;
  END IF;
END $$;
