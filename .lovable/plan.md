## Goal

Two related fixes around employee offboarding:

1. **DB cleanup + ongoing safeguard** — make sure no client is silently assigned to an inactive (deactivated) employee, now and in the future.
2. **Deactivation confirmation** — require an admin to type the word `Confirm` before an employee is actually deactivated.

Current data note: right now the three inactive employees happen to have 0 assigned clients, so the live database is already clean. The real risk is *future* deactivations. This plan adds an automatic unassign on deactivation so it never breaks again, plus a one-time sweep for any stragglers.

## Part 1 — Unassign clients when an employee is deactivated

Update the `deactivate_user` database function so that, in addition to setting the profile inactive, it clears `assigned_employee_id` on every client currently assigned to that employee (sets them to NULL / unassigned). This guarantees a deactivated staff member can never remain silently attached to cases. Those clients then surface in the existing "Unassigned" filter on the Clients page, ready for an admin to bulk-reassign.

The unassignment is logged via the existing audit trigger on the `clients` table, preserving the audit trail (the employee profile itself is never deleted, per project rules).

A one-time corrective sweep is included in the same migration: any client whose `assigned_employee_id` points to an inactive profile is set to NULL.

```text
deactivate_user(_profile_id):
  - require superadmin (unchanged)
  - block self-deactivation (unchanged)
  - UPDATE clients SET assigned_employee_id = NULL
      WHERE assigned_employee_id = _profile_id
  - UPDATE profiles SET active = false WHERE id = _profile_id
```

## Part 2 — "Confirm" type-to-confirm safeguard

In `src/pages/Admin.tsx`, deactivating currently happens instantly when the admin flips the Active switch. Add an `AlertDialog` that opens when an admin tries to **deactivate** an active employee (activating stays one click).

The dialog will:
- Warn that the employee will be deactivated and **all their assigned clients will become unassigned**, showing the employee's name.
- Contain a text input. The destructive "Deactivate" button stays disabled until the admin types `Confirm` exactly.
- On confirm, run the existing `deactivate_user` RPC and refresh the list.

No confirmation is required for re-activating someone.

## Technical details

- **Migration**: `CREATE OR REPLACE FUNCTION public.deactivate_user` with the added client-unassign step, plus a one-time `UPDATE clients SET assigned_employee_id = NULL` for clients assigned to any inactive profile.
- **`src/pages/Admin.tsx`**: add `AlertDialog` (already available in `src/components/ui/alert-dialog.tsx`) state (`pendingDeactivation`, `confirmText`), gate the Switch's `onCheckedChange` so deactivation opens the dialog instead of calling the RPC directly, and only call `handleToggleUserStatus` after the typed confirmation matches.

## Out of scope

- No changes to how clients are reassigned (existing BulkReassign/Reassign dialogs already handle that).
- No deletion of employee records (project rule: deactivate only).
