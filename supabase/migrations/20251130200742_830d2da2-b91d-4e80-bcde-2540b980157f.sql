-- Phase 1: Critical Security Fixes

-- 1.1 Create user_roles system (CRITICAL SECURITY FIX)
-- Create enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'employee');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
  )
);

-- Migrate existing role data from profiles to user_roles
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, role::text::app_role
FROM public.profiles
WHERE role IS NOT NULL;

-- Drop the old role column from profiles
ALTER TABLE public.profiles DROP COLUMN role;

-- Update has_role function to use new table
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = _role
  )
$$;

-- Update is_admin function
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- Update handle_new_user trigger to use user_roles table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (user_id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name'
  );
  
  -- Insert role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE 
      WHEN NEW.email = 'admin@supportivecm.org' THEN 'admin'::app_role
      ELSE 'employee'::app_role
    END
  );
  
  RETURN NEW;
END;
$$;

-- 1.2 Add missing DELETE policies

-- DELETE policy for clients (admin only)
CREATE POLICY "Admins can delete clients"
ON public.clients
FOR DELETE
USING (public.is_admin(auth.uid()));

-- DELETE policy for client_files
CREATE POLICY "File owners and admins can delete files"
ON public.client_files
FOR DELETE
USING (
  uploaded_by = public.get_profile_id(auth.uid()) 
  OR public.is_admin(auth.uid())
);

-- DELETE policy for client_notes (note author within 24h, or admin anytime)
CREATE POLICY "Note authors can delete recent notes, admins anytime"
ON public.client_notes
FOR DELETE
USING (
  (employee_id = public.get_profile_id(auth.uid()) AND created_at > NOW() - INTERVAL '24 hours')
  OR public.is_admin(auth.uid())
);

-- DELETE policy for calendar_events
CREATE POLICY "Users can delete their own events"
ON public.calendar_events
FOR DELETE
USING (
  employee_id = public.get_profile_id(auth.uid()) 
  OR public.is_admin(auth.uid())
);

-- DELETE policy for profiles (admin only, prevent users from deleting themselves)
CREATE POLICY "Admins can delete profiles"
ON public.profiles
FOR DELETE
USING (public.is_admin(auth.uid()));

-- 1.3 Add missing INSERT policy for clients
CREATE POLICY "Employees can create clients"
ON public.clients
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
);

-- 1.4 Fix security settings
-- Fix update_updated_at_column function search_path (already set correctly)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;