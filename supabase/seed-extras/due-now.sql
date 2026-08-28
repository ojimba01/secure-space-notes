-- Staging only. Every value here is invented.
-- The agency's real NPI, EIN, address, phone and fax are NOT in this file:
-- this repository is public and the billing address is residential. They live
-- only in production's compliance_settings.
--
-- Staging only. Makes some cycles genuinely due, so the urgent states in
-- Billing can be seen: the shortlist buttons, the progress bar, the bands.
-- Never run against production.

-- Real MCO names so the payer mapping resolves.
update public.clients set insurance='Wellpoint'        where first_name='Charlie';
update public.clients set insurance='UnitedHealthcare' where first_name='Echo';
update public.clients set insurance='Horizon'          where first_name='Delta';

-- Everything a claim needs, so nothing shows as missing.
update public.clients set
  date_of_birth   = coalesce(date_of_birth, date '1990-06-15'),
  address         = coalesce(nullif(address,''), '12 Sample Street'),
  medicaid_id     = coalesce(medicaid_id, '900' || right(member_id, 4)),
  auth_150_start  = coalesce(auth_150_start, current_date - 200),
  auth_150_number = coalesce(auth_150_number, '2604' || right(member_id, 5)),
  auth_30_number  = coalesce(auth_30_number,  '2601' || right(member_id, 5))
where last_name = 'Testclient';

-- Charlie is past the filing deadline; Alpha is due this week; Echo and Bravo
-- are due this month. Deadlines are derived, so only cycle_end is moved.
update public.billing_cycles b set
  cycle_end   = d.new_end,
  cycle_start = d.new_end - 29,
  final_deadline = d.new_end + interval '6 months'
from (values
  ('Charlie', (current_date - interval '6 months' - interval '3 days')::date),
  ('Alpha',   (current_date - interval '6 months' + interval '4 days')::date),
  ('Echo',    (current_date - interval '6 months' + interval '13 days')::date),
  ('Bravo',   (current_date - interval '6 months' + interval '23 days')::date)
) as d(name, new_end)
join public.clients c on c.first_name = d.name
where b.client_id = c.id;

-- The agency's own Availity boxes, so none of them read as empty.
update public.compliance_settings set value = value || jsonb_build_object(
  'organization','Supportive Care Management, LLC',
  'providerName','SUPPORTIVE CARE MANAGEMENT, LLC',
  'contactName','SUPPORTIVE CARE MANAGEMENT, LLC',
  'specialtyCode','251B00000X - Case Management',
  'defaultModifier','UI',
  'providerNpi','1999999999',
  'providerEin','990000000',
  'addressLine1','1 Example Street',
  'city','EXAMPLETOWN','state','New Jersey','zip','080000000',
  'phone','8565550100','fax','8565550101',
  'payersEligibility', jsonb_build_object(
    'Aetna','Aetna Better Health all plans and NJ-VA MAPD-DSNP',
    'Horizon','Horizon NJ Health','Wellpoint','Wellpoint','UnitedHealthcare','UnitedHealthcare'),
  'payersClaims', jsonb_build_object(
    'Aetna','AETNA BETTER HEALTH NEW JERSEY',
    'Horizon','Horizon NJ Health','Wellpoint','Wellpoint','UnitedHealthcare','UnitedHealthcare')
) where key='availity_provider';

insert into public.compliance_settings (key, value, description)
select 'availity_provider', '{}'::jsonb, 'Availity provider details'
where not exists (select 1 from public.compliance_settings where key='availity_provider');
