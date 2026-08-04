# Make the billing setup gap visible and fixable

## What's actually happening

The last round of work did land in the code — but it was mostly plumbing, so the screens look unchanged. The database cycle engine only generates billing cycles when a client has all three of: HSP submitted, an HSP approval start date (150-day anchor), and a Level of Need.

Current numbers for open clients:

- 152 open clients
- 86 have HSP submitted, 86 have a 150-day start date
- 122 have no Level of Need
- Result: only 10 clients have live billing cycles (56 cycle rows)

So Billing looks empty because the data is incomplete, not because the code is missing. Per your choice, we will not backfill Level of Need — we make the gap loud and fast to fix in place.

## A. Billing page — setup banner

- Add a banner at the top of Billing: "X of Y clients are not generating billing yet — missing information." with a button that jumps straight to the Missing information filter.
- Break the count down by cause: missing Level of Need, missing HSP approval start date, HSP not submitted.
- Show the live cycle total so it's obvious when it moves ("56 active cycles across 10 clients").

## B. Fix it inline, no dialog hopping

In the Billing overview rows flagged as missing information:

- Level of Need becomes an inline dropdown (Low Level / High Level).
- HSP submitted becomes an inline checkbox.
- HSP approval start date becomes an inline date field.
- Saving any of these re-syncs that client's cycles immediately, the row flips to real cycle dates and amounts, and the banner count drops.

This turns a 122-client cleanup into a single scrollable worklist.

## C. Cycle dates tab

Clients with incomplete setup currently look identical to clients with no cycles. Give them an explicit "Setup needed" row state listing exactly what's missing, clickable through to the same inline fix.

## D. Make the client-form changes visible

The HSP submitted / 180-day approved checkboxes and the read-only derived end dates already exist in Add/Edit client, but they're buried mid-form. Group them under a clearly labeled "Billing setup" section with a short line explaining that these three fields are what turn billing on.

## E. Client list signal

Add a "Setup incomplete" badge to client cards and rows so case managers see it without going into Billing.

## Technical notes

- No database migration and no data backfill; `sync_client_billing_cycles` stays the single source of truth.
- Inline edits write to `clients` (`level_of_need`, `hsp_submitted`, `auth_150_start`); the existing after-save trigger re-syncs cycles, then the UI calls `regenerateClient` to refresh.
- Files touched: `src/components/billing/BillingOverview.tsx`, `src/components/billing/CycleDates.tsx`, `src/pages/Billing.tsx`, `src/hooks/useBilling.ts` (expose missing-setup counts), `src/components/AddClientDialog.tsx`, `src/components/EditClientDialog.tsx`, `src/components/ClientCard.tsx`.
