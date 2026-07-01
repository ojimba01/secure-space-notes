ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS is_auto_generated boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_calendar_events_client_auto
  ON public.calendar_events (client_id, is_auto_generated);