-- Fix 1: Make audit_logs append-only by adding explicit restrictive policies
-- Allow authenticated users to insert (via triggers/functions) but deny UPDATE and DELETE for everyone

-- Create INSERT policy for audit logs (system can insert via triggers)
CREATE POLICY "Allow authenticated insert to audit_logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Create explicit DENY UPDATE policy (no one can update audit logs)
CREATE POLICY "Deny all updates to audit_logs"
ON public.audit_logs
FOR UPDATE
USING (false);

-- Create explicit DENY DELETE policy (no one can delete audit logs)
CREATE POLICY "Deny all deletes to audit_logs"
ON public.audit_logs
FOR DELETE
USING (false);

-- Fix 2: Update storage policies to allow access based on client assignment, not just uploader
-- First, create a helper function to check if user can access a client's files
CREATE OR REPLACE FUNCTION public.can_access_client_files(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.clients c ON c.assigned_employee_id = p.id
    WHERE p.user_id = _user_id 
    AND c.id = _client_id
    AND p.active = true
  )
  OR public.is_admin(_user_id)
$$;

-- Drop existing restrictive storage policies and recreate with client-based access
DROP POLICY IF EXISTS "Users can view their own client files" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload client files" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own client files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own client files" ON storage.objects;

-- Create new storage policies based on client assignment
-- For SELECT: Allow access if user is assigned to the client (folder name = client_id)
CREATE POLICY "Users can view assigned client files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'client-files' 
  AND (
    public.can_access_client_files(auth.uid(), (storage.foldername(name))[1]::uuid)
    OR public.is_admin(auth.uid())
  )
);

-- For INSERT: Allow upload to client folders the user is assigned to
CREATE POLICY "Users can upload to assigned client folders"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'client-files'
  AND (
    public.can_access_client_files(auth.uid(), (storage.foldername(name))[1]::uuid)
    OR public.is_admin(auth.uid())
  )
);

-- For UPDATE: Allow update on files for assigned clients
CREATE POLICY "Users can update assigned client files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'client-files'
  AND (
    public.can_access_client_files(auth.uid(), (storage.foldername(name))[1]::uuid)
    OR public.is_admin(auth.uid())
  )
);

-- For DELETE: Allow delete on files for assigned clients (only admins or assigned employees)
CREATE POLICY "Users can delete assigned client files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'client-files'
  AND (
    public.can_access_client_files(auth.uid(), (storage.foldername(name))[1]::uuid)
    OR public.is_admin(auth.uid())
  )
);