CREATE TABLE public.clients_import_staging (
  id uuid PRIMARY KEY,
  full_update boolean,
  first_name text, last_name text, insurance text, member_id text, phone text,
  intake_date date, assessment_due_date date, mco_housing_manager text,
  auth_30_number text, auth_30_start date, auth_30_end date,
  hsp_due_date date, approval_status text,
  auth_150_number text, auth_150_start date, auth_150_end date,
  auth_180_number text, auth_180_start date, auth_180_end date,
  next_action_due_date date, status text, closed_date date, reason_closed text, notes text
);
GRANT ALL ON public.clients_import_staging TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.apply_clients_import()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer := 0;
BEGIN
  UPDATE public.clients c SET
    first_name = s.first_name,
    last_name = s.last_name,
    insurance = s.insurance,
    member_id = s.member_id,
    phone = s.phone,
    intake_date = s.intake_date,
    assessment_due_date = s.assessment_due_date,
    mco_housing_manager = s.mco_housing_manager,
    auth_30_number = s.auth_30_number,
    auth_30_start = s.auth_30_start,
    auth_30_end = s.auth_30_end,
    hsp_due_date = s.hsp_due_date,
    approval_status = s.approval_status,
    auth_150_number = s.auth_150_number,
    auth_150_start = s.auth_150_start,
    auth_150_end = s.auth_150_end,
    auth_180_number = s.auth_180_number,
    auth_180_start = s.auth_180_start,
    auth_180_end = s.auth_180_end,
    next_action_due_date = s.next_action_due_date,
    status = s.status,
    closed_date = s.closed_date,
    reason_closed = s.reason_closed,
    notes = s.notes,
    updated_at = now()
  FROM public.clients_import_staging s
  WHERE c.id = s.id AND s.full_update = true;
  GET DIAGNOSTICS n = ROW_COUNT;

  UPDATE public.clients c SET
    first_name = s.first_name,
    last_name = s.last_name,
    updated_at = now()
  FROM public.clients_import_staging s
  WHERE c.id = s.id AND s.full_update = false;

  RETURN n;
END;
$$;