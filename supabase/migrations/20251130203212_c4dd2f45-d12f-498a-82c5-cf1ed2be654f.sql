-- Fix infinite recursion in user_roles RLS policies
-- The issue: "Admins can view all roles" policy queries user_roles to check admin status,
-- which triggers the policy again, causing infinite recursion

-- Drop the problematic policy
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;

-- Create a simpler policy that doesn't cause recursion
-- Users can only view their own roles (admins will use security definer functions)
CREATE POLICY "Users can view only their own roles"
ON public.user_roles
FOR SELECT
USING (user_id = auth.uid());