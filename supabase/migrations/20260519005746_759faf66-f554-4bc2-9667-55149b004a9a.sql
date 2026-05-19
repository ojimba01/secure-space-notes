ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS iat_date date,
  ADD COLUMN IF NOT EXISTS hsp_150_date date,
  ADD COLUMN IF NOT EXISTS hsp_180_date date;

UPDATE public.clients
SET iat_date = housing_stabilization_plan_date
WHERE iat_date IS NULL AND housing_stabilization_plan_date IS NOT NULL;