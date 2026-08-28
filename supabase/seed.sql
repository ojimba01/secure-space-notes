-- ============================================================
-- STAGING SEED — local development only.
--
-- Runs automatically on `supabase start` and `supabase db reset`, and only
-- ever against the Supabase stack running on this machine. It has no way to
-- reach the production database.
--
-- Everyone in this file is invented. **No real client data belongs here** —
-- this file is committed to a public repository.
--
-- Rebuild staging from scratch at any time with:  supabase db reset
-- ============================================================

-- ---------- Sign-in accounts -------------------------------
-- handle_new_user() fires on insert and creates the matching profiles and
-- user_roles rows, so roles come out the same way they do in production:
-- admin@supportivecm.org becomes superadmin, everyone else is an employee.

do $$
declare
  admin_id uuid := '11111111-1111-4111-8111-111111111111';
  cm_id    uuid := '22222222-2222-4222-8222-222222222222';
  pw       text := 'StagingOnly!2026';
begin
  if not exists (select 1 from auth.users where id = admin_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      'admin@supportivecm.org', crypt(pw, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"first_name":"Staging","last_name":"Admin"}'::jsonb, now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), admin_id, admin_id::text,
            format('{"sub":"%s","email":"admin@supportivecm.org"}', admin_id)::jsonb,
            'email', now(), now(), now());
  end if;

  if not exists (select 1 from auth.users where id = cm_id) then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', cm_id, 'authenticated', 'authenticated',
      'casemanager@supportivecm.org', crypt(pw, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"first_name":"Staging","last_name":"CaseManager"}'::jsonb, now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                                 last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), cm_id, cm_id::text,
            format('{"sub":"%s","email":"casemanager@supportivecm.org"}', cm_id)::jsonb,
            'email', now(), now(), now());
  end if;
end $$;

-- ---------- Settings ---------------------------------------
insert into public.compliance_settings (key, value, description) values
  ('touchpoint_go_live_date', '"2026-08-27"'::jsonb, 'Local staging: same go-live as production.'),
  ('show_historical_touchpoints', 'false'::jsonb, 'Local staging.')
on conflict (key) do update set value = excluded.value;

-- ---------- Clients ----------------------------------------
-- Chosen to cover every branch the touchpoint work queue can take.

do $$
declare
  cm uuid;
begin
  select p.id into cm from public.profiles p
  where p.email = 'casemanager@supportivecm.org' limit 1;

  -- A. Low level, cycle already running and spanning go-live.
  --    Needs 2 touchpoints this cycle, 1 of them in person.
  insert into public.clients
    (id, first_name, last_name, member_id, assigned_employee_id, status,
     hsp_submitted, level_of_need, auth_30_start, county, insurance, workflow_stage,
     date_of_birth)
  values
    ('aaaa0001-0000-4000-8000-000000000001', 'Alpha', 'Testclient', 'TEST-0001', cm, 'active',
     true, 'Low Level', '2026-08-20', 'Essex', 'Aetna', 'initial_30_active',
     '1988-03-14')
  on conflict (id) do update set assigned_employee_id = excluded.assigned_employee_id;

  -- B. High level, cycle starting today. Needs 4, 2 of them in person.
  insert into public.clients
    (id, first_name, last_name, member_id, assigned_employee_id, status,
     hsp_submitted, level_of_need, auth_30_start, county, insurance, workflow_stage,
     date_of_birth)
  values
    ('aaaa0002-0000-4000-8000-000000000002', 'Bravo', 'Testclient', 'TEST-0002', cm, 'active',
     true, 'High Level', '2026-08-27', 'Hudson', 'Horizon', 'initial_30_active',
     '1975-11-02')
  on conflict (id) do update set assigned_employee_id = excluded.assigned_employee_id;

  -- C. Started long before go-live. Earlier cycles must read as reference
  --    only — never overdue, never in the work queue. This is the case the
  --    "start today" rebuild exists for.
  insert into public.clients
    (id, first_name, last_name, member_id, assigned_employee_id, status,
     hsp_submitted, level_of_need, auth_30_start, county, insurance, workflow_stage)
  values
    ('aaaa0003-0000-4000-8000-000000000003', 'Charlie', 'Testclient', 'TEST-0003', cm, 'active',
     true, 'Low Level', '2026-05-01', 'Union', 'Test MCO', 'active_authorization')
  on conflict (id) do update set assigned_employee_id = excluded.assigned_employee_id;

  -- D. No level of need — the largest real gap (119 clients in production).
  --    Staff must not see this one; Admin must flag it as missing.
  insert into public.clients
    (id, first_name, last_name, member_id, assigned_employee_id, status,
     hsp_submitted, level_of_need, auth_30_start, county, insurance, workflow_stage)
  values
    ('aaaa0004-0000-4000-8000-000000000004', 'Delta', 'Testclient', 'TEST-0004', cm, 'active',
     true, null, '2026-08-10', 'Essex', 'Test MCO', 'initial_30_active')
  on conflict (id) do update set assigned_employee_id = excluded.assigned_employee_id;

  -- E. HSP not submitted.
  insert into public.clients
    (id, first_name, last_name, member_id, assigned_employee_id, status,
     hsp_submitted, level_of_need, auth_30_start, county, insurance, workflow_stage)
  values
    ('aaaa0005-0000-4000-8000-000000000005', 'Echo', 'Testclient', 'TEST-0005', cm, 'active',
     false, 'High Level', '2026-08-15', 'Passaic', 'Test MCO', 'referred')
  on conflict (id) do update set assigned_employee_id = excluded.assigned_employee_id;

  -- F. No start date at all.
  insert into public.clients
    (id, first_name, last_name, member_id, assigned_employee_id, status,
     hsp_submitted, level_of_need, county, insurance, workflow_stage)
  values
    ('aaaa0006-0000-4000-8000-000000000006', 'Foxtrot', 'Testclient', 'TEST-0006', cm, 'active',
     true, 'Low Level', 'Bergen', 'Test MCO', 'referred')
  on conflict (id) do update set assigned_employee_id = excluded.assigned_employee_id;
end $$;
