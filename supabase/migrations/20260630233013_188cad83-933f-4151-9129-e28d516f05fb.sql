
-- =========================================================
-- PART 2: Monthly touch-point compliance system foundation
-- =========================================================

-- 1. client_contacts ------------------------------------------------
CREATE TABLE public.client_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  contact_date date NOT NULL DEFAULT CURRENT_DATE,
  modality text NOT NULL CHECK (modality IN ('phone','virtual','in_person')),
  notes text,
  calendar_event_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_client_contacts_client ON public.client_contacts(client_id);
CREATE INDEX idx_client_contacts_employee ON public.client_contacts(employee_id);
CREATE INDEX idx_client_contacts_date ON public.client_contacts(contact_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_contacts TO authenticated;
GRANT ALL ON public.client_contacts TO service_role;
ALTER TABLE public.client_contacts ENABLE ROW LEVEL SECURITY;

-- helper: is the current user the assigned case manager for this client?
CREATE OR REPLACE FUNCTION public.is_assigned_to_client(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.clients c
    JOIN public.profiles p ON p.id = c.assigned_employee_id
    WHERE c.id = _client_id
      AND p.user_id = _user_id
      AND p.active = true
  )
$$;

CREATE POLICY "Staff and admins can view contacts"
ON public.client_contacts FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

CREATE POLICY "Staff and admins can insert contacts"
ON public.client_contacts FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

CREATE POLICY "Staff and admins can update contacts"
ON public.client_contacts FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

CREATE POLICY "Staff and admins can delete contacts"
ON public.client_contacts FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

-- 2. client_month_compliance ---------------------------------------
CREATE TABLE public.client_month_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.profiles(id),
  month date NOT NULL,
  lon_tier text NOT NULL,
  required_contacts int NOT NULL DEFAULT 2,
  required_in_person int NOT NULL DEFAULT 0,
  required_activities int NOT NULL DEFAULT 0,
  is_new_client boolean NOT NULL DEFAULT false,
  activities_done jsonb NOT NULL DEFAULT '[]'::jsonb,
  summary_note text,
  plan_dates jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'on_track'
    CHECK (status IN ('on_track','behind','complete','incomplete_escalated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, month)
);
CREATE INDEX idx_cmc_client ON public.client_month_compliance(client_id);
CREATE INDEX idx_cmc_employee ON public.client_month_compliance(employee_id);
CREATE INDEX idx_cmc_month ON public.client_month_compliance(month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_month_compliance TO authenticated;
GRANT ALL ON public.client_month_compliance TO service_role;
ALTER TABLE public.client_month_compliance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff and admins can view compliance"
ON public.client_month_compliance FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

CREATE POLICY "Staff and admins can insert compliance"
ON public.client_month_compliance FOR INSERT TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

CREATE POLICY "Staff and admins can update compliance"
ON public.client_month_compliance FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.is_assigned_to_client(auth.uid(), client_id)
);

CREATE TRIGGER update_cmc_updated_at
BEFORE UPDATE ON public.client_month_compliance
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. compliance_escalations ----------------------------------------
CREATE TABLE public.compliance_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.profiles(id),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('emergency_incomplete','weekly_audit')),
  period date NOT NULL,
  outstanding jsonb NOT NULL DEFAULT '[]'::jsonb,
  claimed_complete jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_esc_employee ON public.compliance_escalations(employee_id);
CREATE INDEX idx_esc_kind ON public.compliance_escalations(kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_escalations TO authenticated;
GRANT ALL ON public.compliance_escalations TO service_role;
ALTER TABLE public.compliance_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view escalations"
ON public.compliance_escalations FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update escalations"
ON public.compliance_escalations FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()));

-- 4. compliance_settings (editable tooltips + audit switch) ---------
CREATE TABLE public.compliance_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_settings TO authenticated;
GRANT SELECT ON public.compliance_settings TO anon;
GRANT ALL ON public.compliance_settings TO service_role;
ALTER TABLE public.compliance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read settings"
ON public.compliance_settings FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Admins can change settings"
ON public.compliance_settings FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER update_compliance_settings_updated_at
BEFORE UPDATE ON public.compliance_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- seed settings: weekly audit on, and editable tooltip texts
INSERT INTO public.compliance_settings (key, value, description) VALUES
('weekly_audit_enabled', 'true'::jsonb, 'Whether the weekly random HMIS audit runs'),
('tooltips', '{
  "contact": "A documented, direct interaction with the member on a given day; counts once per calendar day. Phone and video both count toward the contact minimum, but only a face-to-face visit satisfies the in-person requirement.",
  "phone": "A documented phone call with the member. Counts as a contact (once per calendar day) but does not satisfy the in-person requirement.",
  "virtual": "A documented video/virtual interaction with the member. Counts as a contact (once per calendar day) but does not satisfy the in-person requirement.",
  "in_person": "A documented face-to-face visit with the member. Counts as a contact and satisfies the in-person requirement.",
  "landlord_tenant": "Contacting the landlord or property manager about basic tenancy issues — rent, lease questions, minor concerns — on the member''s behalf. (Higher-intensity mediation is the separate eviction prevention item.)",
  "subsidy": "Helping the member apply for or renew a housing subsidy or program (e.g. Supportive Housing Connection, DCA programs) — gathering documents and submitting the paperwork.",
  "linkage": "Actually connecting the member to benefits, transportation, food, or other basic services — making the referral, not just naming it.",
  "eviction_prevention": "Active intervention when housing is at risk — responding to a lease violation, neighbor complaint, or eviction notice, and mediating to keep the housing.",
  "supportive_housing": "Working with supportive-housing or service-enriched programs (SHC rental subsidies, DMHAS supportive housing, NJHMFA) — referrals, warm handoffs, joint planning. Describe what was coordinated in the note box.",
  "bh_referral": "Referring or warm-handing-off the member to behavioral health, substance-use, medical home care, or legal aid, and following up on whether they connected.",
  "reassessment": "Re-checking the member''s housing stability and risk factors to confirm the level-of-need tier is still right, and updating the plan if it changed."
}'::jsonb, 'Editable tooltip explanations for contact modalities and support activities');

-- 5. link calendar events to clients -------------------------------
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_calendar_events_client ON public.calendar_events(client_id);

-- 6. audit triggers on new tables ----------------------------------
CREATE TRIGGER audit_client_contacts
AFTER INSERT OR UPDATE OR DELETE ON public.client_contacts
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_client_month_compliance
AFTER INSERT OR UPDATE OR DELETE ON public.client_month_compliance
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE TRIGGER audit_compliance_escalations
AFTER INSERT OR UPDATE OR DELETE ON public.compliance_escalations
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();
