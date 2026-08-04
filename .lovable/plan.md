# Align billing UI with the new database cycle engine

## Status of the SQL file

The engine you uploaded has already been applied to the database as one migration. It added the setup fields to clients (HSP submitted, extension approved, billing tracking start), the active flag on cycles, the rate lookup, the automatic cycle generation and date-derivation triggers, admin + superadmin billing access, and it backfilled every existing client.

Current backfill result: 9 clients have 5 cycles, 1 client has 11 cycles, and every generated cycle is exactly 30 inclusive days. 77 clients produce zero cycles because their setup is incomplete — 76 of those have a 150-day start date but no Level of Need.

## What still needs doing in the app

The app currently generates cycles itself in the browser, which now duplicates and can fight the database engine.

1. Retire client-side generation. Remove the front-end cycle-building logic and let saving a client be what creates cycles. The "Regenerate cycles" button stays, but it asks the database to re-sync instead of computing dates in the browser.
2. Respect the active flag. Billing views only show active cycles, so superseded cycles stay in the record for history without appearing as live deadlines.
3. Surface the setup gate honestly. For the 76 clients with a start date but no Level of Need, billing rows should read "Add Level of Need" as the next action rather than looking like zero-dollar or missing billing.
4. Add the new fields to the client form. Checkboxes for "HSP submitted" and "180-day extension approved", with the 150-day and 180-day end dates shown as read-only since the database now derives them.
5. Turning on the extension checkbox extends a client from 5 to 11 cycles automatically; turning it off hides cycles 6-11 without deleting their claim data.

## Technical notes

- Replace `src/lib/billingSync.ts` and the `regenerateOne` logic in `src/hooks/useBilling.ts` with an RPC call to `public.sync_client_billing_cycles(client_id)`; expose that function to authenticated callers in a small follow-up migration and keep the admin check inside it.
- Filter `is_active = true` in `useBilling`, `useDashboardPriorities`, and the billing-cron function.
- Fetch `hsp_submitted`, `auth_180_approved`, `billing_tracking_start` in client queries; make `auth_150_end` / `auth_180_start` / `auth_180_end` read-only in `AddClientDialog` and `EditClientDialog`.
- Update `billing-cron` to call the database function rather than recomputing cycles, then redeploy.
