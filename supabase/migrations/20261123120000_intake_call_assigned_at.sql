-- When a client was put on the intake calls list: added awaiting their call,
-- or an existing client an admin assigned an intake call for. The Intake
-- calls page shows how long each has waited from here.
alter table public.clients add column if not exists intake_call_assigned_at timestamptz;
update public.clients set intake_call_assigned_at = created_at
where intake_call_status = 'awaiting' and intake_call_assigned_at is null;
