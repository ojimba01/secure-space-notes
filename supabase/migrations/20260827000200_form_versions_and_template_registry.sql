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
CREATE POLICY "Admins manage form versions"
  ON public.client_form_versions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Employees view versions of their own forms"
  ON public.client_form_versions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.client_forms f
    JOIN public.profiles p ON p.id = f.employee_id
    WHERE f.id = client_form_id AND p.user_id = auth.uid()
  ));

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

CREATE POLICY "Everyone signed in can read the registry"
  ON public.form_template_registry FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage the registry"
  ON public.form_template_registry FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins update the registry"
  ON public.form_template_registry FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

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
