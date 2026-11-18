-- Two Client Intakes were filed as Medicaid Eligibility by the document reader,
-- because the intake asks for a Medicaid number and the reader had no rule
-- for the intake's printed title. Linda Moore's intake then showed only a
-- greyed-out entry with no file. Applied on the live database 2026-11-18.
update public.client_forms
set form_type = 'Client Intake'
where id in ('7d803c14-f98c-4c94-85dc-321c6eabcf2c', '4c327fbe-5fca-4f4d-8277-c30a0c85ca27')
  and form_type = 'Medicaid Eligibility';
