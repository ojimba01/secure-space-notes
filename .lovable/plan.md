## Goal

Replace the single "Housing Stabilization Plan Date" field with a progressive milestone tracker:

1. **IAT (Initial Assessment Tool)** — user picks a start date; system shows a 30-day due date.
2. Once today ≥ IAT due date, unlock a date picker for the **150-day HSP** milestone.
3. Once today ≥ 150-day due date, unlock a date picker for the **180-day HSP** milestone.
4. Once today ≥ 180-day due date, show **"⚠️ WARNING: Patient is now pending next action"** on the client detail page AND the client card.

Each milestone date is entered manually by the user (no auto-calculation). Earlier-stage fields stay locked/hidden until the previous due date arrives.

## Database changes

Add three nullable date columns on `clients`, keep the existing `housing_stabilization_plan_date` for backward compatibility (will be displayed as IAT date if the new column is empty):

- `iat_date` (date) — start date for the 30-day IAT clock
- `hsp_150_date` (date) — start date for the 150-day HSP milestone
- `hsp_180_date` (date) — start date for the 180-day HSP milestone

A small one-time backfill: copy any existing `housing_stabilization_plan_date` into the new `iat_date` column so current clients don't lose their date.

## UI changes

### `AddClientDialog` / `EditClientDialog`
- Rename the existing "Housing Stabilization Plan Date" field to **"IAT Start Date"**.
- That's the only milestone field in the create/edit forms — later milestones are added on the client detail page as they unlock.

### `ClientDetails` — replace the current HSP card with a new "IAT & HSP Milestones" card
The card shows a vertical stepper with three stages:

```text
[✓] IAT          Start: 2026-05-01    Due: 2026-05-31    (Due in 12 days)
[•] HSP 150-day  [ Set start date ▼ ] → unlocks when IAT due date passes
[ ] HSP 180-day  Locked until 150-day milestone passes
```

Behavior per stage:
- **IAT**: shows start date + 30-day due date + status badge (Due in N days / Overdue by N).
- **HSP 150-day**: hidden/locked until `today >= iat_date + 30 days`. Once unlocked, shows a date picker. After saving, displays start date + 150-day due date + status badge.
- **HSP 180-day**: same pattern, unlocks when `today >= hsp_150_date + 150 days`.
- **After 180-day due passes**: red alert banner inside the card — `⚠️ WARNING: Patient is now pending next action`.

### `ClientCard` (client list)
- Add the warning badge when the 180-day due date has passed: small red "⚠ Pending next action" pill near the existing insurance/status badges.

## Files affected

- `supabase/migrations/<new>.sql` — add 3 columns, backfill `iat_date` from existing `housing_stabilization_plan_date`.
- `src/components/AddClientDialog.tsx` — rename field label + state key (`iat_date`).
- `src/components/EditClientDialog.tsx` — same rename, plus continue editing IAT date here.
- `src/components/ClientDetails.tsx` — replace HSP card with new milestone stepper card; add inline date pickers + save handlers for 150/180.
- `src/components/ClientCard.tsx` — add overdue warning pill.
- `src/lib/validationSchemas.ts` — add the three new optional date fields.

## Notes / caveats

- Milestones unlock strictly on calendar date comparison (today ≥ due date), no manual "mark complete" step.
- Once a milestone date is set, it can be edited via the Edit Client dialog (admin) — guards prevent setting a 150-day date before the IAT due date has passed.
- The existing `housing_stabilization_plan_date` column stays in the DB (read-only) so audit logs and historical data remain intact; new writes go to `iat_date`.
