

## Bulk Client Reassignment for Admins

Add a multi-select mode on the Clients page so admins can pick several clients at once and reassign them all to one case manager in a single action.

### What you'll see

**On the Clients page (admin only):**
- A new **"Select"** button next to "Add Client" in the header.
- Clicking it enters **selection mode**:
  - Header swaps to show: `X selected` · **Select All** · **Reassign Selected** · **Cancel**
  - Each client card shows a **checkbox in the top-right corner**.
  - Clicking a card toggles selection (instead of opening details) while in selection mode.
- **Reassign Selected** opens a dialog (reusing the existing reassignment flow) with:
  - Dropdown of active case managers
  - Optional reason field
  - Confirms count: "Reassign 5 clients to Jane Doe?"
- After success: toast shows "5 clients reassigned", list refreshes, selection mode exits.

Non-admins see no change — the Select button and checkboxes are hidden.

```text
┌─────────────────────────────────────────────┐
│ Clients                    [Select] [+ Add] │  ← normal mode
├─────────────────────────────────────────────┤
│ 3 selected  [Select All] [Reassign] [Cancel]│  ← selection mode
├─────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│ │ ☑  John  │ │ ☐  Mary  │ │ ☑  Alex  │      │
│ │  details │ │  details │ │  details │      │
│ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────┘
```

### Technical implementation

1. **`ClientCard.tsx`** — accept new optional props: `selectionMode: boolean`, `selected: boolean`, `onToggleSelect: (id) => void`. Render a `Checkbox` in the top-right of `CardHeader` when `selectionMode` is true. When in selection mode, card click calls `onToggleSelect` instead of `onSelect`.

2. **`ClientManagement.tsx`** — add state:
   - `selectionMode: boolean`
   - `selectedIds: Set<string>`
   - `showReassignDialog: boolean`
   
   Add admin-only header controls. "Select All" toggles between selecting all `filteredClients` and clearing. Pass selection props down to `ClientCard`.

3. **New `BulkReassignDialog.tsx`** — adapted from `ReassignClientDialog.tsx`:
   - Props: `clientIds: string[]`, `clientCount: number`, plus standard open/onChange/onReassigned.
   - Loads active employees (same query as existing dialog, no `currentEmployeeId` exclusion).
   - On submit, loops `clientIds` and calls existing `supabase.rpc('reassign_client', ...)` for each (sequentially to keep audit logs clean). Tracks successes/failures and shows a summary toast.
   - No DB changes needed — the `reassign_client` RPC already enforces admin-only and writes to `client_assignments_history`.

4. **No migration required** — RLS already restricts reassignment to admins via the RPC.

### Edge cases handled
- Selecting a client already assigned to the chosen manager: the RPC throws "already assigned to this employee" — we'll catch per-client and report it in the summary toast (e.g. "4 reassigned, 1 skipped").
- Exiting selection mode clears `selectedIds`.
- Search filtering works in selection mode; "Select All" only selects currently visible (filtered) clients.

