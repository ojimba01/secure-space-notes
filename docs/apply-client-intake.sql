-- ============================================================
-- APPLY THIS BEFORE MERGING THE CLIENT INTAKE SCREEN.
--
-- Paste into the Supabase SQL editor for project gotwcbjywtdlyrtfjqnw and run.
-- It is idempotent: running it twice is harmless.
--
-- Until it runs, the Intake tab cannot load or save — the table it reads does
-- not exist yet, and clients.medicaid_id is missing.
-- Same file as supabase/migrations/20260828000000_client_intake.sql.
-- ============================================================

-- ============================================================
-- Client Intake
--
-- The agency's paper intake form, as a real screen. One row per client,
-- typed columns rather than a JSONB blob, plus child rows for the household
-- members question. A handful of answers also belong on the client record
-- (name, DOB, phone, MCO #, Medicaid #); the app writes those through when
-- the client field is empty and asks about conflicts rather than overwriting.
--
-- Idempotent: running it twice is harmless.
-- ============================================================

-- 1. Medicaid number on the client record --------------------
-- Q5 collects it, the workbook has a column for it, and the sheet importer
-- has been reading and dropping it for want of somewhere to put it.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS medicaid_id text;

-- 2. The intake record ---------------------------------------
-- Sensitive answers (SSN, HIV status, substance use, domestic violence,
-- pregnancy) are all nullable on purpose: the form itself says Q40 is
-- collected "only when necessary", and none of them may be required.
CREATE TABLE IF NOT EXISTS public.client_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,

  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'complete')),
  completed_at timestamptz,
  completed_by uuid REFERENCES public.profiles(id),

  -- Client information (Q1-Q8) -------------------------------
  -- The form asks for the birth date again at the top of page 1. It is kept
  -- here as the client said it, and written through to clients.date_of_birth
  -- when that column is empty.
  birth_date date,
  ssn text,
  gender text,
  marital_status text,
  marital_status_other text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  has_birth_certificate boolean,
  has_valid_id boolean,
  has_social_security_card boolean,
  mco_number text,
  medicaid_number text,
  birth_city text,
  birth_state text,
  birth_country text,
  race text,
  us_citizen boolean,
  alien_number text,

  -- Medical (Q9-Q17) -----------------------------------------
  pcp_name text,
  pcp_phone text,
  pcp_practice text,
  medical_diagnoses text,
  developmental_disability boolean,
  developmental_disability_detail text,
  physical_condition boolean,
  physical_condition_detail text,
  mental_health_condition boolean,
  mental_health_provider text,
  mental_health_provider_phone text,
  therapy_schedule text,
  psychiatrist_name text,
  psychiatrist_phone text,
  mental_health_diagnoses text,

  -- Income and financial (Q18-Q22) ---------------------------
  has_income_proof boolean,
  income_type text,
  income_monthly_amount numeric,
  has_bank_account boolean,
  bank_name text,
  applied_for_voucher boolean,
  voucher_county text,
  currently_employed boolean,
  employer_name text,
  hours_per_week numeric,
  wage text,
  last_hospitalization_date date,

  -- Housing history (Q23-Q33) --------------------------------
  last_address text,
  last_address_duration text,
  present_address text,
  receives_benefits boolean,
  benefit_type text,
  benefit_monthly_amount numeric,
  housing_status text,
  housing_status_other text,
  health_impact text,
  homeless_duration text,
  homelessness_cause text,
  living_unsheltered boolean,
  living_unsheltered_detail text,
  has_eviction_or_record boolean,
  eviction_or_record_detail text,
  needs_accommodation boolean,
  accommodations text[] NOT NULL DEFAULT '{}',
  accommodation_other text,

  -- Monthly expenses and rental needs (Q34-Q39) --------------
  expense_phone numeric,
  expense_car_note numeric,
  expense_car_insurance numeric,
  expense_internet numeric,
  expense_utilities numeric,
  expense_other numeric,
  expenses_total numeric,
  has_application_fee_funds boolean,
  application_fee_amount numeric,
  planned_monthly_rent numeric,
  voucher_types text[] NOT NULL DEFAULT '{}',
  voucher_type_other text,
  housing_for_self_only boolean,
  counties_of_interest text[] NOT NULL DEFAULT '{}',
  county_other text,

  -- Additional client information (Q40-Q47) ------------------
  hiv_aids boolean,
  substance_use boolean,
  substance_use_detail text,
  domestic_violence_victim boolean,
  pregnant text CHECK (pregnant IS NULL OR pregnant IN ('yes', 'no', 'na')),
  veteran boolean,
  highest_grade text,
  in_school boolean,
  school_program text,
  in_vocational_training boolean,
  vocational_program text,

  -- Housing preferences (Q48-Q53) ----------------------------
  preferred_housing_type text,
  preferred_housing_type_other text,
  has_transportation boolean,
  transportation_types text[] NOT NULL DEFAULT '{}',
  transportation_other text,
  preferred_apartment_type text,
  bedrooms_needed text,
  has_household_members boolean,
  additional_comments text,

  -- Certification --------------------------------------------
  client_signature_name text,
  client_signed_date date,
  staff_signature_name text,
  staff_signed_date date,
  additional_notes text,

  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_intakes_client ON public.client_intakes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_intakes_status ON public.client_intakes(status);

-- 3. Household members (Q52) ---------------------------------
CREATE TABLE IF NOT EXISTS public.client_intake_household_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid NOT NULL REFERENCES public.client_intakes(id) ON DELETE CASCADE,
  name text NOT NULL,
  age integer,
  relationship text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intake_household_intake
  ON public.client_intake_household_members(intake_id);

-- 4. Access -------------------------------------------------
-- Same rule as every other client record: admins, plus the case manager the
-- client is assigned to. Deletes are admin-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_intakes TO authenticated;
GRANT ALL ON public.client_intakes TO service_role;
ALTER TABLE public.client_intakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff and admins can view intakes" ON public.client_intakes;
CREATE POLICY "Staff and admins can view intakes"
ON public.client_intakes FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Staff and admins can insert intakes" ON public.client_intakes;
CREATE POLICY "Staff and admins can insert intakes"
ON public.client_intakes FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Staff and admins can update intakes" ON public.client_intakes;
CREATE POLICY "Staff and admins can update intakes"
ON public.client_intakes FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Admins can delete intakes" ON public.client_intakes;
CREATE POLICY "Admins can delete intakes"
ON public.client_intakes FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_intake_household_members TO authenticated;
GRANT ALL ON public.client_intake_household_members TO service_role;
ALTER TABLE public.client_intake_household_members ENABLE ROW LEVEL SECURITY;

-- Household rows inherit their client from the intake they hang off.
DROP POLICY IF EXISTS "Staff and admins can view household members"
  ON public.client_intake_household_members;
CREATE POLICY "Staff and admins can view household members"
ON public.client_intake_household_members FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_intakes i
    WHERE i.id = intake_id
      AND (public.is_admin(auth.uid()) OR public.is_assigned_to_client(auth.uid(), i.client_id))
  )
);

DROP POLICY IF EXISTS "Staff and admins can insert household members"
  ON public.client_intake_household_members;
CREATE POLICY "Staff and admins can insert household members"
ON public.client_intake_household_members FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.client_intakes i
    WHERE i.id = intake_id
      AND (public.is_admin(auth.uid()) OR public.is_assigned_to_client(auth.uid(), i.client_id))
  )
);

DROP POLICY IF EXISTS "Staff and admins can update household members"
  ON public.client_intake_household_members;
CREATE POLICY "Staff and admins can update household members"
ON public.client_intake_household_members FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_intakes i
    WHERE i.id = intake_id
      AND (public.is_admin(auth.uid()) OR public.is_assigned_to_client(auth.uid(), i.client_id))
  )
);

DROP POLICY IF EXISTS "Staff and admins can delete household members"
  ON public.client_intake_household_members;
CREATE POLICY "Staff and admins can delete household members"
ON public.client_intake_household_members FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_intakes i
    WHERE i.id = intake_id
      AND (public.is_admin(auth.uid()) OR public.is_assigned_to_client(auth.uid(), i.client_id))
  )
);

DROP TRIGGER IF EXISTS update_client_intakes_updated_at ON public.client_intakes;
CREATE TRIGGER update_client_intakes_updated_at
BEFORE UPDATE ON public.client_intakes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
