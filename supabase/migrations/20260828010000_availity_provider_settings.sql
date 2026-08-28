-- ============================================================
-- Availity staging: the agency's own details.
--
-- The Availity mirrors need the practice's identifiers and address. Those are
-- held here rather than in the code because this repository is public — an NPI
-- and EIN together are the agency's billing identity, and the billing address
-- is a residential one. An admin fills them in once, in Billing → Availity, and
-- every client's page fills in from then on.
--
-- The values that are only wording, not identity, are seeded.
--
-- Idempotent: running it twice is harmless.
-- ============================================================

INSERT INTO public.compliance_settings (key, value, description) VALUES (
  'availity_provider',
  jsonb_build_object(
    'organization', 'Supportive Care Management, LLC',
    'providerName', 'SUPPORTIVE CARE MANAGEMENT, LLC',
    'contactName', 'SUPPORTIVE CARE MANAGEMENT, LLC',
    'specialtyCode', '251B00000X - Case Management',
    'state', 'New Jersey',
    -- Filled in by an admin: see the note above.
    'providerNpi', '',
    'providerEin', '',
    'addressLine1', '',
    'city', '',
    'zip', '',
    'phone', '',
    'fax', '',
    -- The line-level modifier Availity expects on H0044. An authorization can
    -- override it; this is the default when it does not.
    'defaultModifier', 'UI',
    -- The Payer list differs between the two Availity pages: the same MCO is
    -- worded one way for an eligibility check and another for a claim, and
    -- Aetna appears several times in both lists. Only exact wording works.
    'payersEligibility', jsonb_build_object(
      'Aetna', 'Aetna Better Health all plans and NJ-VA MAPD-DSNP'
    ),
    'payersClaims', jsonb_build_object(
      'Aetna', 'AETNA BETTER HEALTH NEW JERSEY'
    )
  ),
  'Provider identifiers, address and Availity payer names used by the Availity staging screens.'
)
ON CONFLICT (key) DO NOTHING;
