CREATE TABLE public.client_forms (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  form_type text NOT NULL,
  title text NOT NULL,
  file_path text,
  original_file_path text,
  file_size bigint,
  status text NOT NULL DEFAULT 'submitted',
  signature_name text,
  signed_by uuid REFERENCES public.profiles(id),
  signed_at timestamp with time zone,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamp with time zone,
  review_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT client_forms_status_check CHECK (status IN ('draft','submitted','approved','changes_requested'))
);

CREATE INDEX idx_client_forms_employee ON public.client_forms(employee_id);
CREATE INDEX idx_client_forms_client ON public.client_forms(client_id);
CREATE INDEX idx_client_forms_status ON public.client_forms(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_forms TO authenticated;
GRANT ALL ON public.client_forms TO service_role;

ALTER TABLE public.client_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees view their own forms"
ON public.client_forms FOR SELECT TO authenticated
USING (employee_id = public.get_profile_id(auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY "Employees create forms for assigned clients"
ON public.client_forms FOR INSERT TO authenticated
WITH CHECK (
  employee_id = public.get_profile_id(auth.uid())
  AND (public.is_assigned_to_client(auth.uid(), client_id) OR public.is_admin(auth.uid()))
  AND status IN ('draft','submitted')
);

CREATE POLICY "Employees update their own unapproved forms"
ON public.client_forms FOR UPDATE TO authenticated
USING (employee_id = public.get_profile_id(auth.uid()) AND status <> 'approved')
WITH CHECK (employee_id = public.get_profile_id(auth.uid()));

CREATE POLICY "Admins update any form"
ON public.client_forms FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Employees delete their own drafts"
ON public.client_forms FOR DELETE TO authenticated
USING (
  (employee_id = public.get_profile_id(auth.uid()) AND status IN ('draft','changes_requested'))
  OR public.is_admin(auth.uid())
);

CREATE OR REPLACE FUNCTION public.enforce_form_review_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('approved','changes_requested')
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only administrators can approve or request changes on forms';
  END IF;

  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    NEW.approved_by := public.get_profile_id(auth.uid());
    NEW.approved_at := now();
  ELSIF NEW.status <> 'approved' THEN
    NEW.approved_by := NULL;
    NEW.approved_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER client_forms_enforce_review
BEFORE UPDATE ON public.client_forms
FOR EACH ROW EXECUTE FUNCTION public.enforce_form_review_authority();

CREATE TRIGGER update_client_forms_updated_at
BEFORE UPDATE ON public.client_forms
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_client_forms
AFTER INSERT OR UPDATE OR DELETE ON public.client_forms
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE POLICY "Users manage their own form files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'client-files'
  AND (storage.foldername(name))[1] = 'forms'
);

CREATE POLICY "Users read form files they own or administer"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'client-files'
  AND (storage.foldername(name))[1] = 'forms'
  AND (
    public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.client_forms cf
      WHERE (cf.file_path = storage.objects.name OR cf.original_file_path = storage.objects.name)
        AND cf.employee_id = public.get_profile_id(auth.uid())
    )
  )
);