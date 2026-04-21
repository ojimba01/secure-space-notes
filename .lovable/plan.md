

## Filter clients by assigned case manager (admin only)

Add a filter control on the Clients page so admins can narrow the visible client cards by who they're assigned to. Filter applies on top of the existing search.

### What you'll see

A new **"Filter by case manager"** control sits next to the search bar (admin only). It's a multi-select popover button:

```text
┌────────────────────────────────────────────────────────────┐
│ [🔍 Search clients...]   [Filter: All managers ▾]  [Select] [+ Add] │
└────────────────────────────────────────────────────────────┘
```

Clicking the filter opens a popover with checkboxes:
- ☑ **All** (select/clear everything — convenience toggle)
- ☐ **Unassigned** (clients with no case manager)
- ☐ Jane Doe
- ☐ John Smith
- ☐ … (one row per active employee, alphabetical)

Behavior:
- **Nothing checked** → shows nothing (empty state: "No managers selected — pick at least one to see clients").
- **Some checked** → shows only clients whose `assigned_employee_id` matches a checked manager, plus unassigned clients if "Unassigned" is checked.
- **All checked** (default on first load) → shows everything (same as today).
- Button label reflects state: "All managers", "Unassigned only", "Jane Doe", or "3 managers" when multiple.
- Filter combines with the search box (AND).
- Non-admins see no filter button — no change for them.

### Technical implementation

**`src/components/ClientManagement.tsx`** (only file touched):
1. Reuse the existing `managerMap` (already fetched for admins) to build the list of filter options. Also extend the profile fetch to include `active` so we can list only active employees in the filter (already-assigned inactive managers still match by ID).
2. Add state:
   - `selectedManagerIds: Set<string>` — IDs of checked managers
   - `includeUnassigned: boolean` — whether the "Unassigned" row is checked
   - Initialize both to "everything selected" once the manager list loads.
3. Extend `filteredClients` to also apply the manager filter:
   ```
   matchesManager =
     (client.assigned_employee_id && selectedManagerIds.has(client.assigned_employee_id))
     || (!client.assigned_employee_id && includeUnassigned)
   ```
4. Add a `Popover` + `Checkbox` list next to the search input, rendered only when `isAdmin`. Include an "All" master checkbox that toggles every option.
5. Update the empty-state copy to mention the filter when nothing is checked.

No new components, no DB changes, no migration. Uses existing `Popover`, `Checkbox`, and `Button` primitives already in the project.

