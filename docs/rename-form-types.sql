-- Move form_template_registry onto the agency's own document type names.
--
-- Run this BEFORE merging PR #31. The registry joins to the app's form types by
-- string, so between the code landing and this running, the three state
-- templates would resolve to nothing.
--
-- Five rows, all of them template pointers. No client data is touched:
-- client_forms holds 0 rows, so no stored document carries an old name.
--
-- Old name                        New name                          Rows
-- ------------------------------  --------------------------------  ----
-- Initial Assessment Tool         Initial Assessment (IAT)             1
-- Level of Need Assessment Tool   Level of Need (LON)                  2
-- Housing Stabilization Plan      Housing Stabilization Plan (HSP)     2
--
-- 'MCO Authorization Request' -> 'Prior Authorization Request' is listed for
-- completeness but matches nothing: the Aetna and Wellpoint templates are
-- declared in PDF_TEMPLATES, not in the registry.

update public.form_template_registry
   set form_type = case form_type
         when 'Initial Assessment Tool'       then 'Initial Assessment (IAT)'
         when 'Level of Need Assessment Tool' then 'Level of Need (LON)'
         when 'Housing Stabilization Plan'    then 'Housing Stabilization Plan (HSP)'
         when 'MCO Authorization Request'     then 'Prior Authorization Request'
         when 'Authorization Approval'        then 'Approval Letter'
         else form_type
       end
 where form_type in (
         'Initial Assessment Tool',
         'Level of Need Assessment Tool',
         'Housing Stabilization Plan',
         'MCO Authorization Request',
         'Authorization Approval'
       );

-- Expect 5 rows, and every form_type below must appear in DOCUMENT_TYPES.
select form_type, workflow_purpose, template_path
  from public.form_template_registry
 order by form_type, workflow_purpose;

-- Should return nothing.
select 'client_forms still on an old name' as problem, form_type, count(*)
  from public.client_forms
 where form_type in ('Initial Assessment Tool', 'Level of Need Assessment Tool',
                     'Housing Stabilization Plan', 'MCO Authorization Request',
                     'Authorization Approval', 'Other', 'Intake Packet',
                     'Lease / Occupancy', 'ID / Verification', 'Income / Benefits',
                     'Voucher / Subsidy', 'Correspondence', 'Progress Note',
                     'Signature Page', 'Billing')
 group by form_type;
