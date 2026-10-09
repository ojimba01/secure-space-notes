-- UHC Move-in Supports Request, and a phone number for staff.
--
-- The UHC form asks for the case manager's phone, the member's household size,
-- an emergency contact for deliveries and a preferred delivery time. The last
-- three are kept on the client record, so the next form starts with them.
-- The form's answers are kept with the form, so a draft opens where it was left.

alter table public.profiles add column if not exists phone text;

alter table public.clients add column if not exists household_size integer;
alter table public.clients add column if not exists emergency_contact_name text;
alter table public.clients add column if not exists emergency_contact_phone text;
alter table public.clients add column if not exists preferred_delivery text;

alter table public.client_forms add column if not exists form_data jsonb;

comment on column public.profiles.phone is 'Work phone, written on forms that ask for the case manager''s number.';
comment on column public.clients.household_size is 'Total household members, including the member.';
comment on column public.clients.preferred_delivery is 'Requested or preferred delivery date and time for move-in items.';
comment on column public.client_forms.form_data is 'Answers to a form filled in the app rather than on a PDF (UHC Move-in Supports Request).';
