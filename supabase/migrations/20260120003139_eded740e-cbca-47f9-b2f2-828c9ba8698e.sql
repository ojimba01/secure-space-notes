-- Fix the overly permissive audit_logs INSERT policy
-- Replace WITH CHECK (true) with a more restrictive policy that only allows inserts from authenticated users

-- Drop the existing permissive INSERT policy
DROP POLICY IF EXISTS "Allow authenticated insert to audit_logs" ON public.audit_logs;

-- Create a more restrictive INSERT policy
-- Only allow inserts from authenticated users (the audit triggers run in security definer context)
CREATE POLICY "Authenticated users can insert audit logs via triggers"
ON public.audit_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);