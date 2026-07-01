
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS approval_status text,
  ADD COLUMN IF NOT EXISTS assessment_due_date date,
  ADD COLUMN IF NOT EXISTS mco_housing_manager text,
  ADD COLUMN IF NOT EXISTS auth_30_number text,
  ADD COLUMN IF NOT EXISTS auth_150_number text,
  ADD COLUMN IF NOT EXISTS auth_180_number text,
  ADD COLUMN IF NOT EXISTS hsp_due_date date,
  ADD COLUMN IF NOT EXISTS next_action_due_date date,
  ADD COLUMN IF NOT EXISTS closed_date date,
  ADD COLUMN IF NOT EXISTS reason_closed text;
