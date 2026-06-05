## Goal
Surface each client's intake milestone **due dates** directly on the patient cards in the client list, with color-coded status indicators that warn as a deadline approaches, mark when it has arrived, and show how many days overdue it is.

## What gets shown
The card already shows the Intake date. Below it, add a compact "Milestones" section listing each milestone that has a start date set, with its computed due date and a status badge. Milestones (same rules already used in the client detail view):

- **IAT (30-day)** — due = `iat_date` + 30 days
- **HSP 150-day** — due = `hsp_150_date` + 150 days
- **HSP 180-day** — due = `hsp_180_date` + 180 days

Only milestones that have a start date are listed. If none are set, show a small "No milestones set" line.

## Status indicator logic (per milestone)
Based on days between today and the due date:

```text
overdue   (days < 0)        -> red "Overdue by N days"
due today (days == 0)       -> red "Due today"
warn      (1–14 days left)  -> amber "Due in N days"
upcoming  (> 14 days left)  -> muted/gray "Due in N days"
```

This matches the existing `statusBadge` logic in `MilestoneTracker.tsx`, so the card and detail view stay consistent. The amber "warn" state will be added as a clearly distinct color (currently the tracker only uses default/secondary), using a semantic warning style.

## Technical details
- **`src/components/ClientCard.tsx`**
  - Extend the local `Client` interface to include `iat_date`, `hsp_150_date`, `hsp_180_date` (data is already fetched via `select('*')` in `ClientManagement.tsx`, so no query change needed).
  - Add small helpers (`addDays`, `today`, and a status resolver returning label + style) mirroring `MilestoneTracker`.
  - Render a milestone list in `CardContent` showing each set milestone's name, due date, and a status badge with warn/arrived/overdue styling.
  - Keep the existing "Pending next action" badge as-is.
- No database or RLS changes. No changes to business logic — purely presentation on the card.

## Out of scope
- No changes to how milestones are created/edited (still done in the detail view).
- No notifications/emails — this is on-card visual indication only.
