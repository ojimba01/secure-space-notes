-- Phase 2: Client Reassignment
-- Create table to track client assignment history

CREATE TABLE public.client_assignments_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  from_employee_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reassigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.client_assignments_history ENABLE ROW LEVEL SECURITY;

-- Create indexes for better performance
CREATE INDEX idx_client_assignments_history_client_id ON public.client_assignments_history(client_id);
CREATE INDEX idx_client_assignments_history_to_employee_id ON public.client_assignments_history(to_employee_id);
CREATE INDEX idx_client_assignments_history_created_at ON public.client_assignments_history(created_at DESC);

-- RLS policies
CREATE POLICY "Admins can view all assignment history"
ON public.client_assignments_history
FOR SELECT
USING (public.is_admin(auth.uid()));

CREATE POLICY "Employees can view their client assignment history"
ON public.client_assignments_history
FOR SELECT
USING (
  to_employee_id = public.get_profile_id(auth.uid()) 
  OR from_employee_id = public.get_profile_id(auth.uid())
);

-- Create function to reassign client
CREATE OR REPLACE FUNCTION public.reassign_client(
  _client_id UUID,
  _new_employee_id UUID,
  _reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _current_employee_id UUID;
  _reassigned_by_profile_id UUID;
BEGIN
  -- Only admins can reassign clients
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can reassign clients';
  END IF;
  
  -- Get current employee assignment
  SELECT assigned_employee_id INTO _current_employee_id
  FROM public.clients
  WHERE id = _client_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client not found';
  END IF;
  
  -- Get admin's profile id
  SELECT id INTO _reassigned_by_profile_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  -- Verify new employee exists and is active
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = _new_employee_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Target employee not found or is inactive';
  END IF;
  
  -- Don't reassign if already assigned to this employee
  IF _current_employee_id = _new_employee_id THEN
    RAISE EXCEPTION 'Client is already assigned to this employee';
  END IF;
  
  -- Update client assignment
  UPDATE public.clients
  SET 
    assigned_employee_id = _new_employee_id,
    updated_at = NOW()
  WHERE id = _client_id;
  
  -- Record in history
  INSERT INTO public.client_assignments_history (
    client_id,
    from_employee_id,
    to_employee_id,
    reassigned_by,
    reason
  ) VALUES (
    _client_id,
    _current_employee_id,
    _new_employee_id,
    _reassigned_by_profile_id,
    _reason
  );
END;
$$;