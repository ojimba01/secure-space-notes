-- ============================================================
-- Phase 2: repeatable authorization model + form external status
-- Non-destructive: legacy authorization columns on public.clients stay intact.
-- ============================================================

-- ---------- client_forms: internal review vs external/MCO status ----------
ALTER TABLE public.client_forms
  ADD COLUMN IF NOT EXISTS external_status TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS sent_to_mco_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mco_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS workflow_purpose TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'created_in_app',
  ADD COLUMN IF NOT EXISTS source_filename TEXT,
  ADD COLUMN IF NOT EXISTS template_version TEXT;

ALTER TABLE public.client_forms
  DROP CONSTRAINT IF EXISTS client_forms_external_status_check;
ALTER TABLE public.client_forms
  ADD CONSTRAINT client_forms_external_status_check
  CHECK (external_status IN ('not_sent','sent_to_mco','awaiting_response','accepted','denied','not_applicable'));

ALTER TABLE public.client_forms
  DROP CONSTRAINT IF EXISTS client_forms_workflow_purpose_check;
ALTER TABLE public.client_forms
  ADD CONSTRAINT client_forms_workflow_purpose_check
  CHECK (workflow_purpose IS NULL OR workflow_purpose IN ('initial_authorization','continuation','reauthorization','other'));

ALTER TABLE public.client_forms
  DROP CONSTRAINT IF EXISTS client_forms_source_check;
ALTER TABLE public.client_forms
  ADD CONSTRAINT client_forms_source_check
  CHECK (source IN ('created_in_app','manual_upload','bulk_import'));

-- ---------- client_authorizations ----------
CREATE TABLE IF NOT EXISTS public.client_authorizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  authorization_type TEXT NOT NULL,
  sequence_number INTEGER NOT NULL DEFAULT 1,
  mco TEXT,
  service_type TEXT,
  authorization_number TEXT,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  lon_score INTEGER,
  level_of_need TEXT,
  billing_modifier TEXT,
  source_document_id UUID REFERENCES public.client_forms(id) ON DELETE SET NULL,
  source_document_path TEXT,
  received_at DATE,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_authorizations_type_check
    CHECK (authorization_type IN ('initial_30','continuation_150','reauthorization_180','other')),
  CONSTRAINT client_authorizations_status_check
    CHECK (status IN ('pending','active','denied','expired','superseded','cancelled')),
  CONSTRAINT client_authorizations_unique_seq
    UNIQUE (client_id, authorization_type, sequence_number)
);

CREATE INDEX IF NOT EXISTS client_authorizations_client_idx
  ON public.client_authorizations (client_id, start_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_authorizations TO authenticated;
GRANT ALL ON public.client_authorizations TO service_role;

ALTER TABLE public.client_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage all authorizations"
  ON public.client_authorizations FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Assigned staff view client authorizations"
  ON public.client_authorizations FOR SELECT TO authenticated
  USING (public.is_assigned_to_client(auth.uid(), client_id));

CREATE TRIGGER update_client_authorizations_updated_at
  BEFORE UPDATE ON public.client_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_client_authorizations
  AFTER INSERT OR UPDATE OR DELETE ON public.client_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- ---------- link forms and billing cycles to an authorization ----------
ALTER TABLE public.client_forms
  ADD COLUMN IF NOT EXISTS authorization_id UUID
  REFERENCES public.client_authorizations(id) ON DELETE SET NULL;

ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS authorization_id UUID
  REFERENCES public.client_authorizations(id) ON DELETE SET NULL;
