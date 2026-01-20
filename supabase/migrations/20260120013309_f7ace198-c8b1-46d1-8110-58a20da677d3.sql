-- Drop the existing employee insert policy
DROP POLICY IF EXISTS "Employees can create clients" ON public.clients;

-- Create new policy that only allows admins to create clients
CREATE POLICY "Only admins can create clients"
ON public.clients
FOR INSERT
WITH CHECK (is_admin(auth.uid()));