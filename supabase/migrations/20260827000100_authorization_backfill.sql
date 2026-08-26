-- ============================================================
-- Backfill client_authorizations from the legacy columns.
-- The Phase 2 migration created the table but never seeded it, so existing
-- clients showed an empty authorization history. Non-destructive: legacy
-- columns are read, never changed, and rows are only inserted where no row
-- of that type exists yet.
-- ============================================================

-- Initial 30-day periods
INSERT INTO public.client_authorizations
  (client_id, authorization_type, sequence_number, mco, authorization_number,
   start_date, end_date, status, level_of_need, notes)
SELECT
  c.id,
  'initial_30',
  1,
  c.insurance,
  c.auth_30_number,
  c.auth_30_start,
  coalesce(c.auth_30_end, c.auth_30_start + 29),
  CASE
    WHEN c.auth_30_start > current_date THEN 'pending'
    WHEN coalesce(c.auth_30_end, c.auth_30_start + 29) < current_date THEN 'expired'
    ELSE 'active'
  END,
  c.level_of_need,
  'Backfilled from legacy client columns'
FROM public.clients c
WHERE c.auth_30_start IS NOT NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_authorizations a
    WHERE a.client_id = c.id AND a.authorization_type = 'initial_30'
  );

-- 150-day continuation periods
INSERT INTO public.client_authorizations
  (client_id, authorization_type, sequence_number, mco, authorization_number,
   start_date, end_date, status, level_of_need, notes)
SELECT
  c.id,
  'continuation_150',
  1,
  c.insurance,
  c.auth_150_number,
  c.auth_150_start,
  coalesce(c.auth_150_end, c.auth_150_start + 149),
  CASE
    WHEN c.auth_150_start > current_date THEN 'pending'
    WHEN coalesce(c.auth_150_end, c.auth_150_start + 149) < current_date THEN 'expired'
    ELSE 'active'
  END,
  c.level_of_need,
  'Backfilled from legacy client columns'
FROM public.clients c
WHERE c.auth_150_start IS NOT NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_authorizations a
    WHERE a.client_id = c.id AND a.authorization_type = 'continuation_150'
  );

-- 180-day reauthorizations (only when actually approved)
INSERT INTO public.client_authorizations
  (client_id, authorization_type, sequence_number, mco, authorization_number,
   start_date, end_date, status, level_of_need, notes)
SELECT
  c.id,
  'reauthorization_180',
  1,
  c.insurance,
  c.auth_180_number,
  c.auth_180_start,
  coalesce(c.auth_180_end, c.auth_180_start + 179),
  CASE
    WHEN c.auth_180_start > current_date THEN 'pending'
    WHEN coalesce(c.auth_180_end, c.auth_180_start + 179) < current_date THEN 'expired'
    ELSE 'active'
  END,
  c.level_of_need,
  'Backfilled from legacy client columns'
FROM public.clients c
WHERE coalesce(c.auth_180_approved, false)
  AND c.auth_180_start IS NOT NULL
  AND c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.client_authorizations a
    WHERE a.client_id = c.id AND a.authorization_type = 'reauthorization_180'
  );

-- An earlier period that has a later one after it is no longer operative.
UPDATE public.client_authorizations a
SET status = 'superseded'
WHERE a.status = 'active'
  AND a.notes = 'Backfilled from legacy client columns'
  AND EXISTS (
    SELECT 1 FROM public.client_authorizations b
    WHERE b.client_id = a.client_id
      AND b.id <> a.id
      AND b.start_date > a.start_date
      AND b.status IN ('active', 'pending')
  );

-- Link billing cycles to the authorization whose period contains them, where
-- that mapping is unambiguous. Cycles that straddle periods stay unlinked.
UPDATE public.billing_cycles bc
SET authorization_id = a.id
FROM public.client_authorizations a
WHERE bc.authorization_id IS NULL
  AND a.client_id = bc.client_id
  AND a.start_date IS NOT NULL
  AND bc.cycle_start >= a.start_date
  AND (a.end_date IS NULL OR bc.cycle_start <= a.end_date)
  AND NOT EXISTS (
    SELECT 1 FROM public.client_authorizations a2
    WHERE a2.client_id = bc.client_id
      AND a2.id <> a.id
      AND a2.start_date IS NOT NULL
      AND bc.cycle_start >= a2.start_date
      AND (a2.end_date IS NULL OR bc.cycle_start <= a2.end_date)
  );
