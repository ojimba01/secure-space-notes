-- Where a member is moving to, and who holds the keys.
--
-- Run this BEFORE merging the code that reads these columns.
-- Idempotent: safe to run twice.
--
-- WHY
-- ---
-- The Move-in Supports Request forms ask for a handful of facts this app has
-- never had anywhere to put: the date a member is expected to move, the address
-- they are moving TO — which is not the `address` column, that is where they
-- are now — and the landlord or realtor a deposit is paid to.
--
-- Until now those lived only inside a submitted PDF. A case manager who wanted
-- to know when somebody was moving had to open the form and read it, and the
-- second request for the same member started from a blank sheet.
--
-- Nothing here is required. A member with no move-in planned has all of it
-- empty, which is the normal case rather than an incomplete record. They are
-- filled in either by hand on the client record or from a submitted form, and
-- a form only ever fills a column that is empty — a disagreement is reported
-- to the person filing it rather than resolved behind them, the same rule the
-- intake already follows.

alter table public.clients
  -- The move
  add column if not exists move_in_date            date,
  add column if not exists new_address             text,
  add column if not exists new_city_state_zip      text,
  add column if not exists apartment_complex_name  text,

  -- Who the deposit goes to. The forms keep these apart because a security
  -- deposit is paid to a landlord and a realtor fee to an agent, and they are
  -- rarely the same person.
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
