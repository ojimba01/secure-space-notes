CREATE TABLE IF NOT EXISTS public.hsp_import_staging (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  first_name text,
  last_name text,
  mco text,
  member_id text,
  phone text,
  intake_date date,
  assessment_due_date date,
  auth_30_number text,
  auth_30_start date,
  auth_30_end date,
  auth_150_number text,
  auth_150_start date,
  auth_150_end date,
  auth_180_number text,
  auth_180_start date,
  auth_180_end date,
  approval_status text,
  case_status text,
  closed_date date,
  reason_closed text,
  next_action_due_date date,
  mco_housing_manager text,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hsp_import_staging TO authenticated;
GRANT ALL ON public.hsp_import_staging TO service_role;

ALTER TABLE public.hsp_import_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins manage hsp import staging"
ON public.hsp_import_staging FOR ALL TO authenticated
USING (public.is_superadmin(auth.uid()))
WITH CHECK (public.is_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.apply_hsp_import()
RETURNS TABLE(updated_count integer, inserted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  u integer := 0;
  i integer := 0;
BEGIN
  WITH upd AS (
    UPDATE public.clients c SET
      insurance = COALESCE(s.mco, c.insurance),
      member_id = COALESCE(s.member_id, c.member_id),
      phone = COALESCE(s.phone, c.phone),
      intake_date = COALESCE(s.intake_date, c.intake_date),
      assessment_due_date = COALESCE(s.assessment_due_date, c.assessment_due_date),
      auth_30_number = COALESCE(s.auth_30_number, c.auth_30_number),
      auth_30_start = COALESCE(s.auth_30_start, c.auth_30_start),
      auth_30_end = COALESCE(s.auth_30_end, c.auth_30_end),
      auth_150_number = COALESCE(s.auth_150_number, c.auth_150_number),
      auth_150_start = COALESCE(s.auth_150_start, c.auth_150_start),
      auth_150_end = COALESCE(s.auth_150_end, c.auth_150_end),
      auth_180_number = COALESCE(s.auth_180_number, c.auth_180_number),
      auth_180_start = COALESCE(s.auth_180_start, c.auth_180_start),
      auth_180_end = COALESCE(s.auth_180_end, c.auth_180_end),
      approval_status = COALESCE(s.approval_status, c.approval_status),
      closed_date = COALESCE(s.closed_date, c.closed_date),
      reason_closed = COALESCE(s.reason_closed, c.reason_closed),
      next_action_due_date = COALESCE(s.next_action_due_date, c.next_action_due_date),
      mco_housing_manager = COALESCE(s.mco_housing_manager, c.mco_housing_manager),
      status = CASE WHEN s.case_status = 'Closed' THEN 'closed' ELSE c.status END,
      updated_at = now()
    FROM public.hsp_import_staging s
    WHERE s.client_id = c.id
    RETURNING 1
  )
  SELECT count(*) INTO u FROM upd;

  WITH ins AS (
    INSERT INTO public.clients (
      first_name, last_name, status, insurance, member_id, phone, intake_date,
      assessment_due_date, auth_30_number, auth_30_start, auth_30_end,
      auth_150_number, auth_150_start, auth_150_end,
      auth_180_number, auth_180_start, auth_180_end,
      approval_status, closed_date, reason_closed, next_action_due_date, mco_housing_manager
    )
    SELECT
      s.first_name, s.last_name,
      CASE WHEN s.case_status = 'Closed' THEN 'closed' ELSE 'active' END,
      s.mco, s.member_id, s.phone, s.intake_date,
      s.assessment_due_date, s.auth_30_number, s.auth_30_start, s.auth_30_end,
      s.auth_150_number, s.auth_150_start, s.auth_150_end,
      s.auth_180_number, s.auth_180_start, s.auth_180_end,
      s.approval_status, s.closed_date, s.reason_closed, s.next_action_due_date, s.mco_housing_manager
    FROM public.hsp_import_staging s
    WHERE s.client_id IS NULL AND s.first_name IS NOT NULL
    RETURNING 1
  )
  SELECT count(*) INTO i FROM ins;

  RETURN QUERY SELECT u, i;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_hsp_import() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_hsp_import() TO service_role;