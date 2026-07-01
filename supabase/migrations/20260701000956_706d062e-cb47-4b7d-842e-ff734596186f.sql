
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS auth_150_start date,
  ADD COLUMN IF NOT EXISTS auth_150_end date,
  ADD COLUMN IF NOT EXISTS auth_180_start date,
  ADD COLUMN IF NOT EXISTS auth_180_end date,
  ADD COLUMN IF NOT EXISTS auth_30_start date,
  ADD COLUMN IF NOT EXISTS auth_30_end date;

CREATE TABLE IF NOT EXISTS public.billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cycle_number int NOT NULL,
  phase text NOT NULL DEFAULT '150-Day',
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  billed_amount numeric(10,2),
  paid_amount numeric(10,2) NOT NULL DEFAULT 0,
  billing_status text NOT NULL DEFAULT 'Not Billed',
  payment_status text NOT NULL DEFAULT 'Unpaid',
  claim_number text,
  submitted_date date,
  paid_date date,
  is_auto_generated boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, cycle_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_cycles TO authenticated;
GRANT ALL ON public.billing_cycles TO service_role;

ALTER TABLE public.billing_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can manage billing" ON public.billing_cycles
  FOR ALL USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

CREATE TRIGGER update_billing_cycles_updated_at
  BEFORE UPDATE ON public.billing_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER audit_billing_cycles
  AFTER INSERT OR UPDATE OR DELETE ON public.billing_cycles
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_function();

CREATE INDEX IF NOT EXISTS idx_billing_cycles_client ON public.billing_cycles(client_id);
CREATE INDEX IF NOT EXISTS idx_billing_cycles_cycle_end ON public.billing_cycles(cycle_end);
