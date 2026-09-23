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