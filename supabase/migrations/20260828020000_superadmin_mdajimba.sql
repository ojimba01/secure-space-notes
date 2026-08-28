-- ============================================================
-- Add mdajimba@gmail.com to the superadmin list.
--
-- Roles are assigned once, by this trigger, at the moment an account is
-- created. The list decides who comes out as a superadmin; everyone else
-- becomes an employee.
--
-- RUN THIS BEFORE THE ACCOUNT IS CREATED. The trigger fires on signup and
-- never again, so an account made first comes out as an employee and needs
-- its role corrected by hand afterwards.
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
      ELSE 'employee'::app_role
    END
  );

  RETURN NEW;
END;
$function$;
