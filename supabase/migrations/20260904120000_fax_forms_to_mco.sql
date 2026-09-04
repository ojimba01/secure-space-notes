-- Faxing a completed form to the MCO from here.
--
-- "Sent to MCO" is a person remembering to press a button after faxing the
-- form somewhere else, and a form that was faxed but never marked reads as
-- late for the rest of its life. The fax now goes from this app, and the MCO
-- status follows from what the fax service reports rather than from memory.
--
-- The fax service is reached only from an edge function. Its credentials are
-- account credentials for an outbound channel carrying a member's record, and
-- they never belong in a browser.

ALTER TABLE public.client_forms
  ADD COLUMN IF NOT EXISTS fax_id text,
  ADD COLUMN IF NOT EXISTS fax_status text,
  ADD COLUMN IF NOT EXISTS fax_to_number text,
  ADD COLUMN IF NOT EXISTS fax_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS fax_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS fax_error text;

COMMENT ON COLUMN public.client_forms.fax_status IS
  'queued | sending | sent | failed. Null means it has never been faxed from here.';
COMMENT ON COLUMN public.client_forms.fax_id IS
  'The fax service''s own id for the sent fax. How the delivery webhook finds this row.';

-- The webhook arrives knowing only the fax id.
CREATE INDEX IF NOT EXISTS idx_client_forms_fax_id
  ON public.client_forms(fax_id) WHERE fax_id IS NOT NULL;

-- Where each MCO takes its faxes.
--
-- Kept in the database rather than in the code because these change, and an
-- agency that cannot correct a fax number without a deploy will fax a member's
-- record to whoever holds the old one.
CREATE TABLE IF NOT EXISTS public.mco_fax_numbers (
  mco          text PRIMARY KEY,
  fax_number   text NOT NULL,
  note         text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  updated_by   uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mco_fax_numbers TO authenticated;
GRANT ALL ON public.mco_fax_numbers TO service_role;
ALTER TABLE public.mco_fax_numbers ENABLE ROW LEVEL SECURITY;

-- Everybody who sends a form needs to read the number. Only an administrator
-- changes it: a wrong number here sends a member's record to a stranger, and
-- it would be wrong for every form after it until somebody noticed.
DROP POLICY IF EXISTS "Everyone signed in can read the fax numbers" ON public.mco_fax_numbers;
CREATE POLICY "Everyone signed in can read the fax numbers"
  ON public.mco_fax_numbers FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins keep the fax numbers" ON public.mco_fax_numbers;
CREATE POLICY "Admins keep the fax numbers"
  ON public.mco_fax_numbers FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
