## Goal
Add a hidden "super-admin" tier with absolute control, create the `root` account, elevate `admin@supportivecm.org`, and let only those two super-accounts grant/revoke the regular Admin role and deactivate/reactivate employees.

## Roles model
Introduce a third role `superadmin` (added to the existing `app_role` enum alongside `admin`, `employee`).

- **Super-admins** (`root` / ojimba01@gmail.com and admin@supportivecm.org): can do everything, including granting/revoking Admin and deactivating/reactivating accounts. Hidden from all non-super users.
- **Admins**: can do everything a super-admin can EXCEPT deactivate/reactivate accounts and EXCEPT promote/demote admins. Those controls are not shown to them.
- **Employees**: unchanged (assigned clients only).

`is_admin()` will be updated to also return true for super-admins, so super-admins keep all existing admin-gated access (clients, calendar, audit logs, etc.).

## Creating / elevating the super-accounts
- **root**: create the auth user ojimba01@gmail.com with password `Temitope6!`, email pre-confirmed, via the backend admin API (service role). This bypasses the client-side domain restriction entirely (that check only runs in the signup form). First name "Root", last name "" / "Control". The signup trigger creates its profile + role; the role mapping below assigns it `superadmin`.
- **admin@supportivecm.org**: already exists — update its role row from `admin` to `superadmin`.
- Update the `handle_new_user` trigger's role mapping so ojimba01@gmail.com and admin@supportivecm.org are assigned `superadmin` if ever recreated.

## Hiding the super-accounts (server-enforced)
Add a security-definer `is_superadmin(uuid)` function. Then tighten Row-Level Security so super-account rows are invisible to everyone except super-admins:

- `profiles` SELECT: visible only when the viewer is a super-admin OR the row's user is NOT a super-admin. (Replaces/ą augments current select policy.)
- `user_roles` SELECT: same rule, so the hidden role never leaks into badges or lists.

Because every employee list in the app (Admin dashboard, reassign dialogs, manager filter, etc.) reads from `profiles`/`user_roles`, this single RLS change hides the super-accounts everywhere automatically. Front-end filters will also exclude them as defense-in-depth.

## Permission changes (backend functions)
- `deactivate_user` / `activate_user`: change the guard from `is_admin` to `is_superadmin` (only super-accounts can toggle active status).
- New `set_employee_admin(_profile_id uuid, _make_admin boolean)`: security-definer, guarded by `is_superadmin`. Adds or removes the `admin` role row for the target. Refuses to modify a super-account. This powers the Admin on/off toggle.

## UI changes
- **`src/pages/Admin.tsx`**
  - Detect whether the current user is a super-admin (query own role / helper).
  - Add an **Admin** toggle per employee that calls `set_employee_admin`. This toggle is rendered only for super-admins.
  - The existing **active/inactive** (deactivate) toggle is rendered only for super-admins; regular admins no longer see it.
  - Filter out any super-account rows from the employee list (defense-in-depth; RLS already hides them).
- **`src/components/ReassignClientDialog.tsx` / `BulkReassignDialog.tsx` / `ClientManagement.tsx`**: no logic change needed (RLS hides super-accounts), but add a safety filter excluding super-accounts from selectable case managers.

## Sequencing (technical)
Postgres requires a new enum value to be committed before it is used, so this ships as two migrations:
1. Migration A: add `superadmin` to `app_role`.
2. Migration B: `is_superadmin`, updated `is_admin`, updated `handle_new_user`, RLS policy updates, `deactivate_user`/`activate_user` guard change, and `set_employee_admin`.
Then: create the root auth user (admin API) and update admin@supportivecm.org's role to `superadmin` via a data change.

## Out of scope
- No change to employee/client data or other features.
- Password is stored only as the account credential (hashed by the auth system), never in code.

## Security note
The plaintext password appears in this chat only to create the account. Recommend rotating it later from the account itself; leaked-password protection remains a separate recommended toggle.
