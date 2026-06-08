CREATE TABLE public.client_visit_availability (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_visit_availability TO authenticated;
GRANT ALL ON public.client_visit_availability TO service_role;

ALTER TABLE public.client_visit_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view availability for accessible clients"
ON public.client_visit_availability
FOR SELECT
TO authenticated
USING (public.can_access_client_files(auth.uid(), client_id));

CREATE POLICY "Users can insert availability for accessible clients"
ON public.client_visit_availability
FOR INSERT
TO authenticated
WITH CHECK (public.can_access_client_files(auth.uid(), client_id));

CREATE POLICY "Users can update availability for accessible clients"
ON public.client_visit_availability
FOR UPDATE
TO authenticated
USING (public.can_access_client_files(auth.uid(), client_id))
WITH CHECK (public.can_access_client_files(auth.uid(), client_id));

CREATE POLICY "Users can delete availability for accessible clients"
ON public.client_visit_availability
FOR DELETE
TO authenticated
USING (public.can_access_client_files(auth.uid(), client_id));

CREATE TRIGGER update_client_visit_availability_updated_at
BEFORE UPDATE ON public.client_visit_availability
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_client_visit_availability
AFTER INSERT OR UPDATE OR DELETE ON public.client_visit_availability
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();