

## Show case manager on client cards + filter active employees on admin dashboard

Two changes, both admin-only.

### 1. Client cards: show assigned case manager (admin view only)

On the Clients page, every card gets a new line under the member ID:
- **Green text** with the case manager's name (e.g. "Case Manager: Jane Doe") when assigned.
- **Red text** "No case manager assigned" when `assigned_employee_id` is null.
- Visible only to admins — employees see no change (they only see their own clients anyway).

**Implementation:**
- `ClientManagement.tsx`: when admin, fetch all profiles (id, first_name, last_name) once and build a `Map<profileId, name>`. Pass the lookup into each `ClientCard`.
- `ClientCard.tsx`: extend the `Client` interface with `assigned_employee_id?: string | null`. Accept optional `assignedManagerName?: string | null` and `showManager?: boolean` props. Render the colored line in `CardHeader` below the member ID.

### 2. Admin dashboard: active-only filter + active count card

On `/admin`:
- Add a **5th stats card**: "Active Employees" showing count of `profiles` where `active = true`.
- Above the "All Employees" list, add a **Switch** labeled "Show active only" — defaults to **ON**. When on, the list filters to active employees; when off, shows everyone (current behavior).
- Update the section title dynamically: "Active Employees" vs "All Employees".

**Implementation:**
- `Admin.tsx`: add `showActiveOnly` state (default `true`), add `activeEmployees` to the `Stats` interface and the `fetchStats` Promise.all (filter `.eq('active', true)`). Derive `displayedEmployees = showActiveOnly ? employees.filter(e => e.active) : employees`. Render the Switch in the employees Card header.

### Files touched
- `src/components/ClientManagement.tsx` — fetch profiles map, pass to cards
- `src/components/ClientCard.tsx` — render colored case manager line
- `src/pages/Admin.tsx` — new stat card, filter switch, derived list

No database changes — `profiles` is already readable by admins via the existing "Admins can view all profiles" RLS policy, and `clients.assigned_employee_id` is already returned by the `select('*')` query.

