## Goal
Rebrand the app from SupportiveCM (SCM) to Comprehensive Care Network (CCN), wipe existing data, and seed one admin user plus one fully-populated demo client to showcase Clients, Notes, and Calendar.

## 1. Rebrand SCM → CCN

**`src/pages/Auth.tsx`**
- `ALLOWED_EMAIL_DOMAIN` → `'@comprehensive-carenetwork.com'`
- Card title `SupportiveCM` → `Comprehensive Care Network`
- Sign-up email placeholder → `yourname@comprehensive-carenetwork.com`
- Update the comment on the domain constant

**Notes**
- The product/UI brand `ClinicalNotes` (sidebar, Admin, AuditLogs, ResetPassword, index.html title/meta) is kept as-is since it's the app name, not "SCM". If you want it renamed too, say the word and I'll swap it everywhere.

## 2. Database migration — admin email + domain

Update `public.handle_new_user()` so:
- `HousingRAF@comprehensive-carenetwork.com` is granted `admin` role on signup
- All other new signups remain `employee`
- Drop the old `admin@supportivecm.org` special case

## 3. Wipe existing data (fresh slate)

Delete rows from (in dependency order):
- `audit_logs`, `client_assignments_history`, `client_files`, `client_notes`, `calendar_events`
- `clients`
- `user_tutorial_progress`, `user_onboarding`
- `user_roles`, `profiles`
- `auth.users` (all existing accounts)
- Storage bucket `client-files` (delete all objects)

Onboarding/tutorial content rows are kept (they're config, not customer data).

## 4. Seed the admin

- Create the auth user `HousingRAF@comprehensive-carenetwork.com` with password `Newlaptop1!`, email pre-confirmed
- The `handle_new_user` trigger will auto-create the profile + admin role
- First name: `Housing`, Last name: `RAF`

## 5. Seed one demo client

Client (assigned to the admin profile):
- Name: `Jane Demo`
- Member ID: `CCN-DEMO-001`
- Insurance: `AETNA`
- DOB, phone, email, address: realistic demo values
- `iat_date`: today − 35 days (so IAT is past due and HSP-150 is unlocked, showing the milestone progression UX)
- `hsp_150_date`: today − 5 days
- `hsp_180_date`: null (still locked until 150-day due passes — demonstrates the lock behavior)
- `intake_date`: today − 40 days
- `notes`: short intro

Plus a few `client_notes` (intake summary, monthly check-in, housing update) and 2–3 `calendar_events` (past visit, upcoming visit, follow-up call) so the Notes and Calendar views look populated.

## 6. Update project memory

Replace the `@supportivecm.org` / `admin@supportivecm.org` references in the memory index and `mem://auth/domain-restriction` with the new CCN values.

## Technical notes
- Step 2 is a migration (`supabase--migration`).
- Step 3 is a data operation (`supabase--insert` with DELETEs) — RLS bypassed because there is no auth context in the migration runner. Storage objects are removed via the same SQL against `storage.objects`.
- Step 4 inserts into `auth.users` directly with a bcrypt-hashed password and `email_confirmed_at = now()` so the user can log in immediately; the existing trigger handles profile + role.
- Step 5 runs after step 4 so we can look up the admin's `profiles.id` for `assigned_employee_id` / `employee_id`.
- No frontend logic changes beyond Auth.tsx — milestone, calendar, notes UI all already work.

## Out of scope (ask if you want these)
- Renaming `ClinicalNotes` brand
- New logo/colors for CCN
- Custom domain / published URL changes
- Email template rebrand
