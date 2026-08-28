-- ============================================================
-- Availity staging: the agency's own provider details.
--
-- The Eligibility and Benefits mirror needs the practice's Availity
-- identifiers. They are held here rather than in the code because this
-- repository is public, and an NPI and tax ID together are the agency's
-- billing identity. An admin fills them in once, in Billing → Availity.
--
-- Idempotent: running it twice is harmless.
-- ============================================================

INSERT INTO public.compliance_settings (key, value, description) VALUES (
  'availity_provider',
  jsonb_build_object(
    'organization', 'Supportive Care Management, LLC',
    'providerName', 'SUPPORTIVE CARE MANAGEMENT, LLC',
    'providerNpi', '',
    'providerTaxId', '',
    -- MCO on the client record → the exact entry to choose in Availity's Payer
    -- list. Aetna in particular has several similar entries and only one is
    -- right; the others are added as they are confirmed.
    'payers', jsonb_build_object(
      'Aetna', 'Aetna Better Health all plans and NJ-VA MAPD-DSNP'
    )
  ),
  'Provider identifiers and payer names used by the Availity staging screen.'
)
ON CONFLICT (key) DO NOTHING;
