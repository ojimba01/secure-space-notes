ALTER TABLE public.calendar_events
ADD COLUMN note_id uuid REFERENCES public.client_notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_note_id ON public.calendar_events(note_id);