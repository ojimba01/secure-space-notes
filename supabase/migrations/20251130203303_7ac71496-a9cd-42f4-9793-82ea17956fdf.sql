-- Phase 3: Comprehensive Audit Logging for HIPAA Compliance
-- Track all data access and modifications

-- Create enum for audit event types
CREATE TYPE public.audit_action AS ENUM ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ACCESS');

-- Create audit logs table
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action public.audit_action NOT NULL,
  table_name TEXT NOT NULL,
  record_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_profile_id ON public.audit_logs(profile_id);
CREATE INDEX idx_audit_logs_table_name ON public.audit_logs(table_name);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_record_id ON public.audit_logs(record_id);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view all audit logs"
ON public.audit_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Function to create audit log entry
CREATE OR REPLACE FUNCTION public.create_audit_log(
  _action public.audit_action,
  _table_name TEXT,
  _record_id UUID DEFAULT NULL,
  _old_data JSONB DEFAULT NULL,
  _new_data JSONB DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _profile_id UUID;
BEGIN
  -- Get profile id for current user
  SELECT id INTO _profile_id
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  INSERT INTO public.audit_logs (
    user_id,
    profile_id,
    action,
    table_name,
    record_id,
    old_data,
    new_data
  ) VALUES (
    auth.uid(),
    _profile_id,
    _action,
    _table_name,
    _record_id,
    _old_data,
    _new_data
  );
END;
$$;

-- Trigger function for audit logging
CREATE OR REPLACE FUNCTION public.audit_trigger_function()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _record_id UUID;
  _old_data JSONB;
  _new_data JSONB;
  _action public.audit_action;
BEGIN
  -- Determine action and data
  IF (TG_OP = 'DELETE') THEN
    _record_id := OLD.id;
    _old_data := to_jsonb(OLD);
    _new_data := NULL;
    _action := 'DELETE';
  ELSIF (TG_OP = 'UPDATE') THEN
    _record_id := NEW.id;
    _old_data := to_jsonb(OLD);
    _new_data := to_jsonb(NEW);
    _action := 'UPDATE';
  ELSIF (TG_OP = 'INSERT') THEN
    _record_id := NEW.id;
    _old_data := NULL;
    _new_data := to_jsonb(NEW);
    _action := 'INSERT';
  END IF;

  -- Create audit log
  PERFORM public.create_audit_log(
    _action,
    TG_TABLE_NAME,
    _record_id,
    _old_data,
    _new_data
  );

  -- Return appropriate record
  IF (TG_OP = 'DELETE') THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Add audit triggers to sensitive tables
-- Clients table
CREATE TRIGGER audit_clients_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- Client notes table
CREATE TRIGGER audit_client_notes_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.client_notes
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- Client files table
CREATE TRIGGER audit_client_files_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.client_files
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- Profiles table (track account changes)
CREATE TRIGGER audit_profiles_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- User roles table (track permission changes)
CREATE TRIGGER audit_user_roles_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- Calendar events table
CREATE TRIGGER audit_calendar_events_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.calendar_events
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();