-- Combined schema changes for the Phase 3 + Phase 4 pass.
-- Apply ONCE against the app's backend, top to bottom.
--
-- Non-destructive: no column, table, policy, or row that already
-- exists is dropped or overwritten. Safe to re-run if a run is
-- interrupted partway through.


-- ==============================================================
-- SOURCE: supabase/migrations/20260827000100_authorization_backfill.sql
-- ==============================================================
-- ============================================================
-- Backfill client_authorizations from the legacy columns.
-- The Phase 2 migration created the table but never seeded it, so existing
-- clients showed an empty authorization history. Non-destructive: legacy
-- columns are read, never changed, and rows are only inserted where no row
-- of that type exists yet.
-- ============================================================


-- Initial 30-day periods
INSERT INTO public.client_authorizations
  (client_id, authorization_type, sequence_number, mco, authorization_number,
start_date, end_date, status, level_of_need, notes)
SELECT
c.id,
'initial_30',
1,
c.insurance,
c.auth_30_number,
c.auth_30_start,
coalesce(c.auth_30_end, c.auth_30_start + 29),
CASE
WHEN c.auth_30_start > current_date THEN 'pending'
WHEN coalesce(c.auth_30_end, c.auth_30_start + 29) < current_date THEN 'expired'
ELSE 'active'
END,
c.level_of_need,
'Backfilled from legacy client columns'
FROM public.clients c
WHERE c.auth_30_start IS NOT NULL
AND c.deleted_at IS NULL
AND NOT EXISTS (
SELECT 1 FROM public.client_authorizations a
WHERE a.client_id = c.id AND a.authorization_type = 'initial_30'
  );


-- 150-day continuation periods
INSERT INTO public.client_authorizations
  (client_id, authorization_type, sequence_number, mco, authorization_number,
start_date, end_date, status, level_of_need, notes)
SELECT
c.id,
'continuation_150',
1,
c.insurance,
c.auth_150_number,
c.auth_150_start,
coalesce(c.auth_150_end, c.auth_150_start + 149),
CASE
WHEN c.auth_150_start > current_date THEN 'pending'
WHEN coalesce(c.auth_150_end, c.auth_150_start + 149) < current_date THEN 'expired'
ELSE 'active'
END,
c.level_of_need,
'Backfilled from legacy client columns'
FROM public.clients c
WHERE c.auth_150_start IS NOT NULL
AND c.deleted_at IS NULL
AND NOT EXISTS (
SELECT 1 FROM public.client_authorizations a
WHERE a.client_id = c.id AND a.authorization_type = 'continuation_150'
  );


-- 180-day reauthorizations (only when actually approved)
INSERT INTO public.client_authorizations
  (client_id, authorization_type, sequence_number, mco, authorization_number,
start_date, end_date, status, level_of_need, notes)
SELECT
c.id,
'reauthorization_180',
1,
c.insurance,
c.auth_180_number,
c.auth_180_start,
coalesce(c.auth_180_end, c.auth_180_start + 179),
CASE
WHEN c.auth_180_start > current_date THEN 'pending'
WHEN coalesce(c.auth_180_end, c.auth_180_start + 179) < current_date THEN 'expired'
ELSE 'active'
END,
c.level_of_need,
'Backfilled from legacy client columns'
FROM public.clients c
WHERE coalesce(c.auth_180_approved, false)
AND c.auth_180_start IS NOT NULL
AND c.deleted_at IS NULL
AND NOT EXISTS (
SELECT 1 FROM public.client_authorizations a
WHERE a.client_id = c.id AND a.authorization_type = 'reauthorization_180'
  );


-- An earlier period that has a later one after it is no longer operative.
UPDATE public.client_authorizations a
SET status = 'superseded'
WHERE a.status = 'active'
AND a.notes = 'Backfilled from legacy client columns'
AND EXISTS (
SELECT 1 FROM public.client_authorizations b
WHERE b.client_id = a.client_id
AND b.id <> a.id
AND b.start_date > a.start_date
AND b.status IN ('active', 'pending')
  );


-- Link billing cycles to the authorization whose period contains them, where
-- that mapping is unambiguous. Cycles that straddle periods stay unlinked.
UPDATE public.billing_cycles bc
SET authorization_id = a.id
FROM public.client_authorizations a
WHERE bc.authorization_id IS NULL
AND a.client_id = bc.client_id
AND a.start_date IS NOT NULL
AND bc.cycle_start >= a.start_date
AND (a.end_date IS NULL OR bc.cycle_start <= a.end_date)
AND NOT EXISTS (
SELECT 1 FROM public.client_authorizations a2
WHERE a2.client_id = bc.client_id
AND a2.id <> a.id
AND a2.start_date IS NOT NULL
AND bc.cycle_start >= a2.start_date
AND (a2.end_date IS NULL OR bc.cycle_start <= a2.end_date)
  );


-- ==============================================================
-- SOURCE: supabase/migrations/20260827000200_form_versions_and_template_registry.sql
-- ==============================================================
-- ============================================================
-- Phase 3: form version history + MCO template/packet registry.
-- Prior completed/submitted PDFs must never be lost when a form is edited,
-- resubmitted, or replaced. Every file a form has ever pointed at becomes a
-- version row; the current file stays on client_forms.file_path.
-- ============================================================


CREATE TABLE IF NOT EXISTS public.client_form_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_form_id UUID NOT NULL REFERENCES public.client_forms(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  version_type TEXT NOT NULL DEFAULT 'draft',
  source_filename TEXT,
  file_hash TEXT,
  file_size BIGINT,
  note TEXT,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
CONSTRAINT client_form_versions_type_check
CHECK (version_type IN ('draft','submitted','sent_to_mco','corrected','returned','historical')),
CONSTRAINT client_form_versions_unique_number
UNIQUE (client_form_id, version_number)
);


CREATE INDEX IF NOT EXISTS client_form_versions_form_idx
ON public.client_form_versions (client_form_id, version_number);


GRANT SELECT, INSERT ON public.client_form_versions TO authenticated;
GRANT ALL ON public.client_form_versions TO service_role;


ALTER TABLE public.client_form_versions ENABLE ROW LEVEL SECURITY;


-- Versions are visible wherever the parent form is visible; they are append
-- only from the app (no update/delete policies on purpose).
DROP POLICY IF EXISTS "Admins manage form versions" ON public.client_form_versions;
CREATE POLICY "Admins manage form versions"
ON public.client_form_versions FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


DROP POLICY IF EXISTS "Employees view versions of their own forms" ON public.client_form_versions;
CREATE POLICY "Employees view versions of their own forms"
ON public.client_form_versions FOR SELECT TO authenticated
USING (EXISTS (
SELECT 1 FROM public.client_forms f
JOIN public.profiles p ON p.id = f.employee_id
WHERE f.id = client_form_id AND p.user_id = auth.uid()
  ));


DROP POLICY IF EXISTS "Employees add versions to their own forms" ON public.client_form_versions;
CREATE POLICY "Employees add versions to their own forms"
ON public.client_form_versions FOR INSERT TO authenticated
WITH CHECK (EXISTS (
SELECT 1 FROM public.client_forms f
JOIN public.profiles p ON p.id = f.employee_id
WHERE f.id = client_form_id AND p.user_id = auth.uid()
  ));


-- Backfill: the file each existing form currently points at becomes v1, and
-- when an original submission was preserved separately it becomes the earlier
-- version so nothing that was ever filed is orphaned.
INSERT INTO public.client_form_versions
  (client_form_id, file_path, version_number, version_type, created_by, created_at)
SELECT f.id, f.original_file_path, 1, 'submitted', f.employee_id, f.created_at
FROM public.client_forms f
WHERE f.original_file_path IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM public.client_form_versions v WHERE v.client_form_id = f.id);


INSERT INTO public.client_form_versions
  (client_form_id, file_path, version_number, version_type, created_by, created_at)
SELECT f.id, f.file_path, 2, 'corrected', f.employee_id, now()
FROM public.client_forms f
WHERE f.file_path IS NOT NULL
AND f.original_file_path IS NOT NULL
AND f.file_path <> f.original_file_path
AND NOT EXISTS (
SELECT 1 FROM public.client_form_versions v
WHERE v.client_form_id = f.id AND v.file_path = f.file_path
  );


INSERT INTO public.client_form_versions
  (client_form_id, file_path, version_number, version_type, created_by, created_at)
SELECT f.id, f.file_path, 1, 'submitted', f.employee_id, f.created_at
FROM public.client_forms f
WHERE f.file_path IS NOT NULL
AND f.original_file_path IS NULL
AND NOT EXISTS (SELECT 1 FROM public.client_form_versions v WHERE v.client_form_id = f.id);


-- ============================================================
-- MCO template/packet registry. Statewide templates are seeded; MCO-specific
-- supplemental templates are added by admins as the agency confirms them.
-- Nothing payer-specific is hard-coded beyond the statewide defaults.
-- ============================================================


CREATE TABLE IF NOT EXISTS public.form_template_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mco TEXT,                       -- NULL = applies to every MCO (statewide)
  workflow_purpose TEXT NOT NULL, -- initial_authorization / continuation / reauthorization / other
  service_type TEXT,              -- NULL = any service type
  form_type TEXT NOT NULL,
  template_path TEXT,             -- public template file or storage path
  template_version TEXT,
  effective_date DATE,
required BOOLEAN NOT NULL DEFAULT true,
  submission_instructions TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
CONSTRAINT form_template_registry_purpose_check
CHECK (workflow_purpose IN ('initial_authorization','continuation','reauthorization','other'))
);


GRANT SELECT, INSERT, UPDATE, DELETE ON public.form_template_registry TO authenticated;
GRANT ALL ON public.form_template_registry TO service_role;


ALTER TABLE public.form_template_registry ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS "Everyone signed in can read the registry" ON public.form_template_registry;
CREATE POLICY "Everyone signed in can read the registry"
ON public.form_template_registry FOR SELECT TO authenticated
USING (true);


DROP POLICY IF EXISTS "Admins manage the registry" ON public.form_template_registry;
CREATE POLICY "Admins manage the registry"
ON public.form_template_registry FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()));


DROP POLICY IF EXISTS "Admins update the registry" ON public.form_template_registry;
CREATE POLICY "Admins update the registry"
ON public.form_template_registry FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


DROP POLICY IF EXISTS "Admins delete from the registry" ON public.form_template_registry;
CREATE POLICY "Admins delete from the registry"
ON public.form_template_registry FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));


DROP TRIGGER IF EXISTS update_form_template_registry_updated_at ON public.form_template_registry;
CREATE TRIGGER update_form_template_registry_updated_at
BEFORE UPDATE ON public.form_template_registry
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- Statewide defaults (February 2026 program PDFs already shipped in /public).
INSERT INTO public.form_template_registry
  (mco, workflow_purpose, form_type, template_path, template_version, required)
SELECT * FROM (VALUES
  (NULL::text, 'initial_authorization', 'Initial Assessment Tool',
'/form-templates/initial-assessment-tool.pdf', '2026-02', true),
  (NULL::text, 'continuation', 'Level of Need Assessment Tool',
'/form-templates/level-of-need-assessment-tool.pdf', '2026-02', true),
  (NULL::text, 'continuation', 'Housing Stabilization Plan',
'/form-templates/housing-stabilization-plan.pdf', '2026-02', true),
  (NULL::text, 'reauthorization', 'Level of Need Assessment Tool',
'/form-templates/level-of-need-assessment-tool.pdf', '2026-02', true),
  (NULL::text, 'reauthorization', 'Housing Stabilization Plan',
'/form-templates/housing-stabilization-plan.pdf', '2026-02', true)
) AS seed(mco, workflow_purpose, form_type, template_path, template_version, required)
WHERE NOT EXISTS (SELECT 1 FROM public.form_template_registry);


-- ==============================================================
-- SOURCE: supabase/migrations/20260827000300_document_import.sql
-- ==============================================================
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
DROP POLICY IF EXISTS "Admins manage import batches" ON public.document_import_batches;
CREATE POLICY "Admins manage import batches"
ON public.document_import_batches FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));


DROP POLICY IF EXISTS "Admins manage import items" ON public.document_import_items;
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