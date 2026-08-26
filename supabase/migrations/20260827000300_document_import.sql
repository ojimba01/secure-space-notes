-- ============================================================
-- Phase 4: bulk historical document migration (Admin/Superadmin only).
-- Batches group one upload session; items track each file from proposal
-- through review to commit, keeping who confirmed the mapping and when.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.document_import_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'in_review',
  manifest_file_path TEXT,
  manifest_filename TEXT,
  total_files INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT document_import_batches_status_check
    CHECK (status IN ('in_review','committing','completed','cancelled'))
);

CREATE TABLE IF NOT EXISTS public.document_import_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.document_import_batches(id) ON DELETE CASCADE,
  source_path TEXT,
  source_filename TEXT NOT NULL,
  file_hash TEXT,
  file_size BIGINT,
  temporary_storage_path TEXT,
  proposed_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  proposed_form_type TEXT,
  proposed_mco TEXT,
  proposed_document_date DATE,
  proposed_authorization_type TEXT,
  detected_member_id TEXT,
  confidence TEXT NOT NULL DEFAULT 'low',
  issue_code TEXT,
  match_reason TEXT,
  final_client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  final_form_type TEXT,
  final_storage_path TEXT,
  client_form_id UUID REFERENCES public.client_forms(id) ON DELETE SET NULL,
  resolution_status TEXT NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT document_import_items_confidence_check
    CHECK (confidence IN ('high','medium','low','conflict')),
  CONSTRAINT document_import_items_resolution_check
    CHECK (resolution_status IN ('pending','accepted','imported','skipped_duplicate','skipped','failed'))
);

CREATE INDEX IF NOT EXISTS document_import_items_batch_idx
  ON public.document_import_items (batch_id, resolution_status);
CREATE INDEX IF NOT EXISTS document_import_items_hash_idx
  ON public.document_import_items (file_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_import_batches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_import_items TO authenticated;
GRANT ALL ON public.document_import_batches TO service_role;
GRANT ALL ON public.document_import_items TO service_role;

ALTER TABLE public.document_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_import_items ENABLE ROW LEVEL SECURITY;

-- Migration tooling is Admin/Superadmin only; staff never see these tables.
CREATE POLICY "Admins manage import batches"
  ON public.document_import_batches FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins manage import items"
  ON public.document_import_items FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS audit_document_import_batches ON public.document_import_batches;
CREATE TRIGGER audit_document_import_batches
  AFTER INSERT OR UPDATE OR DELETE ON public.document_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

DROP TRIGGER IF EXISTS audit_document_import_items ON public.document_import_items;
CREATE TRIGGER audit_document_import_items
  AFTER INSERT OR UPDATE OR DELETE ON public.document_import_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

-- Imported files land on client_forms like any other document.
ALTER TABLE public.client_forms
  ADD COLUMN IF NOT EXISTS import_batch_id UUID
  REFERENCES public.document_import_batches(id) ON DELETE SET NULL;

-- Duplicate detection needs a hash on every stored form file going forward.
ALTER TABLE public.client_forms
  ADD COLUMN IF NOT EXISTS file_hash TEXT;

CREATE INDEX IF NOT EXISTS client_forms_file_hash_idx
  ON public.client_forms (file_hash) WHERE file_hash IS NOT NULL;
