-- Update the handle_new_user function to only allow admin@supportivecm.org as admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    CASE 
      WHEN NEW.email = 'admin@supportivecm.org' THEN 'admin'::user_role
      ELSE 'employee'::user_role
    END
  );
  RETURN NEW;
END;
$$;