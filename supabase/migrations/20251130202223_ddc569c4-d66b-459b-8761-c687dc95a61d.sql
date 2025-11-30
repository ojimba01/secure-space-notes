-- Phase 1: Account Management
-- Add active status to profiles

ALTER TABLE public.profiles 
ADD COLUMN active BOOLEAN DEFAULT true NOT NULL;

-- Create index for faster queries
CREATE INDEX idx_profiles_active ON public.profiles(active);

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.active IS 'Whether the user account is active. Inactive accounts cannot log in.';

-- Create function to check if user is active
CREATE OR REPLACE FUNCTION public.is_user_active(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT active 
  FROM public.profiles 
  WHERE user_id = _user_id
$$;

-- Update policy for admins to manage user status
CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
USING (public.is_admin(auth.uid()));

-- Create function to deactivate user
CREATE OR REPLACE FUNCTION public.deactivate_user(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can deactivate users
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can deactivate users';
  END IF;
  
  -- Prevent admin from deactivating themselves
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = _profile_id 
    AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You cannot deactivate your own account';
  END IF;
  
  UPDATE public.profiles
  SET active = false, updated_at = NOW()
  WHERE id = _profile_id;
END;
$$;

-- Create function to activate user
CREATE OR REPLACE FUNCTION public.activate_user(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admins can activate users
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can activate users';
  END IF;
  
  UPDATE public.profiles
  SET active = true, updated_at = NOW()
  WHERE id = _profile_id;
END;
$$;