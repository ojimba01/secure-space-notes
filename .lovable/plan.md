## Goal
Add a "Milestone status" filter to the Clients page so users can quickly see who is overdue, who has an upcoming milestone, who is finished, and who has no milestone set. Works alongside the existing search and manager filters.

## Milestone status categories
Each client is evaluated against its IAT / HSP-150 / HSP-180 dates using the same logic already used in `ClientCard` and `MilestoneTracker`. A client is bucketed into one or more of these statuses:

- **Overdue** — has an active (not-yet-finished) milestone whose due date is in the past.
- **Due soon** — has an active milestone due within the next 14 days (not overdue).
- **On track** — has an active milestone due more than 14 days out.
- **Finished** — its latest applicable milestone is complete (next date entered / HSP-180 reached) with nothing currently overdue.
- **No milestone** — no IAT/HSP dates set at all.

"Finished" reuses the rule we just added: a milestone counts as finished once the next milestone's date is entered.

## UX
- Add a second dropdown next to the existing manager filter (a `Popover` + `Button`, matching the current styling), labeled by the active selection (e.g. "All statuses", "Overdue", "2 selected").
- Multi-select via checkboxes with an "All" toggle, mirroring the existing manager-filter pattern. Default = all statuses selected (no filtering).
- Visible to everyone (employees and admins), since both see client cards. The manager filter stays admin-only.
- Empty-state message updates to mention status filtering when a status filter hides everything.

## Technical changes (single file: `src/components/ClientManagement.tsx`)
- Extend the local `Client` interface with `iat_date`, `hsp_150_date`, `hsp_180_date` (already returned by `select('*')`).
- Add a helper `getMilestoneStatus(client)` returning the set of status keys for a client, using `addDays` + a 14-day threshold (same constants as `ClientCard`).
- Add `selectedStatuses` state (Set of status keys) plus toggle/all helpers like the manager filter.
- Fold a `matchesStatus` check into the existing `filteredClients` filter.
- Render the new status `Popover` dropdown in the filter row and a status button label.

No backend, schema, or RLS changes — all logic is client-side on data already fetched.
