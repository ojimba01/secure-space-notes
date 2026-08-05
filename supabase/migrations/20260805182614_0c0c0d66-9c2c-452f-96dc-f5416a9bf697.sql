ALTER TABLE public.billing_cycles
  ADD COLUMN IF NOT EXISTS approval_state text,
  ADD COLUMN IF NOT EXISTS final_deadline date;

ALTER TABLE public.billing_cycles
  DROP CONSTRAINT IF EXISTS billing_cycles_approval_state_check;
ALTER TABLE public.billing_cycles
  ADD CONSTRAINT billing_cycles_approval_state_check
  CHECK (approval_state IS NULL OR approval_state IN ('Approved', 'Closed', 'Denied (will resubmit)'));

CREATE OR REPLACE FUNCTION public.set_billing_cycle_final_deadline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.final_deadline := NEW.cycle_end + INTERVAL '6 months';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS billing_cycles_set_final_deadline ON public.billing_cycles;
CREATE TRIGGER billing_cycles_set_final_deadline
BEFORE INSERT OR UPDATE OF cycle_end ON public.billing_cycles
FOR EACH ROW EXECUTE FUNCTION public.set_billing_cycle_final_deadline();

UPDATE public.billing_cycles
SET final_deadline = (cycle_end + INTERVAL '6 months')::date
WHERE final_deadline IS DISTINCT FROM (cycle_end + INTERVAL '6 months')::date;