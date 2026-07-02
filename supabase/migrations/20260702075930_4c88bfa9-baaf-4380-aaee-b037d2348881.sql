ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS modality text,
  ADD COLUMN IF NOT EXISTS is_manually_adjusted boolean NOT NULL DEFAULT false;