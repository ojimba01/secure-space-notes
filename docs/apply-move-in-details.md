# Applying the move-in details migration through Lovable

Schema changes go through Lovable's own agent, the same way the intake and
Availity ones did (see `docs/lovable-apply-migrations.md`).

Paste everything below the line into Lovable's chat, in one message.

- It is one message, so it should be one cheap turn.
- The prompt tells Lovable to run SQL and change nothing else. That matters:
  its agent will otherwise try to build the screens that use these columns, and
  those screens are already written on the branch.

---

Please run the following SQL against this project's database. Do not change any
application code, do not create or edit any React components, and do not add
anything to the app's UI — the screens that use these columns already exist on
a branch and will be merged separately. Run the SQL exactly as written and tell
me the result.

The SQL is idempotent, so it is safe if any part has already been applied.

```sql
alter table public.clients
  add column if not exists move_in_date            date,
  add column if not exists new_address             text,
  add column if not exists new_city_state_zip      text,
  add column if not exists apartment_complex_name  text,
  add column if not exists landlord_name           text,
  add column if not exists landlord_phone          text,
  add column if not exists landlord_email          text,
  add column if not exists realtor_name            text,
  add column if not exists realtor_phone           text,
  add column if not exists realtor_email           text;

comment on column public.clients.new_address is
  'Street address and apartment the member is moving to. `address` is where they live now.';
comment on column public.clients.move_in_date is
  'Anticipated move-in or lease effective date. Move-in Supports must be requested within 45 days of it.';
```
