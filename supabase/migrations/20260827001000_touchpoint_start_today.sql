-- ============================================================
-- Touchpoints: "start today" behaviour, richer contact records,
-- and an internal NJHMIS-ready progress note per touchpoint.
--
-- Nothing here submits to NJHMIS. The progress note rows are an
-- internal staging record for later manual entry or export.
-- ============================================================

-- 1. Contact method ------------------------------------------
-- The Log/Add touchpoint form has offered Text and Email for a while, but the
-- original CHECK only allowed phone/virtual/in_person, so those saves failed.
ALTER TABLE public.client_contacts
  DROP CONSTRAINT IF EXISTS client_contacts_modality_check;

ALTER TABLE public.client_contacts
  ADD CONSTRAINT client_contacts_modality_check
  CHECK (modality IN ('in_person','phone','text','email','virtual','other'));

-- 2. Duration on the touchpoint itself -----------------------
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS duration_minutes integer;

-- 3. NJHMIS-ready progress notes -----------------------------
-- One row per saved touchpoint, modelled on the NJHMIS progress note entry
-- screen so the data can be keyed in or exported without re-interviewing staff.
CREATE TABLE IF NOT EXISTS public.njhmis_progress_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contact_id uuid UNIQUE REFERENCES public.client_contacts(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  service_type text NOT NULL,
  location text NOT NULL,
  note_date date NOT NULL,
  duration_minutes integer NOT NULL DEFAULT 0,
  face_to_face boolean NOT NULL DEFAULT false,
  contact_method text,
  note_type text NOT NULL DEFAULT 'General Chart Note',
  note_text text,
  entry_status text NOT NULL DEFAULT 'ready'
    CHECK (entry_status IN ('ready','entered','exported')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_njhmis_notes_client ON public.njhmis_progress_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_njhmis_notes_employee ON public.njhmis_progress_notes(employee_id);
CREATE INDEX IF NOT EXISTS idx_njhmis_notes_status ON public.njhmis_progress_notes(entry_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.njhmis_progress_notes TO authenticated;
GRANT ALL ON public.njhmis_progress_notes TO service_role;
ALTER TABLE public.njhmis_progress_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff and admins can view progress notes" ON public.njhmis_progress_notes;
CREATE POLICY "Staff and admins can view progress notes"
ON public.njhmis_progress_notes FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Staff and admins can insert progress notes" ON public.njhmis_progress_notes;
CREATE POLICY "Staff and admins can insert progress notes"
ON public.njhmis_progress_notes FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Staff and admins can update progress notes" ON public.njhmis_progress_notes;
CREATE POLICY "Staff and admins can update progress notes"
ON public.njhmis_progress_notes FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Admins can delete progress notes" ON public.njhmis_progress_notes;
CREATE POLICY "Admins can delete progress notes"
ON public.njhmis_progress_notes FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS update_njhmis_progress_notes_updated_at ON public.njhmis_progress_notes;
CREATE TRIGGER update_njhmis_progress_notes_updated_at
BEFORE UPDATE ON public.njhmis_progress_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Start-today settings ------------------------------------
-- touchpoint_go_live_date: the floor for staff urgency. Cycles that ended
-- before it are reference-only and never fill the work queue. When the value
-- is null the row's own updated_at date is used, so the floor is the day the
-- agency installed this and does not slide forward with the calendar.
INSERT INTO public.compliance_settings (key, value, description) VALUES
('touchpoint_go_live_date', 'null'::jsonb,
 'YYYY-MM-DD the touchpoint work queue starts from. Null means the date this setting row was created.'),
('show_historical_touchpoints', 'false'::jsonb,
 'When true, admin views also list touchpoint cycles that closed before the go-live date.')
ON CONFLICT (key) DO NOTHING;
