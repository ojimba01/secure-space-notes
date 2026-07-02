ALTER TABLE public.client_contacts ADD COLUMN IF NOT EXISTS touchpoint_type text;
ALTER TABLE public.calendar_events ADD COLUMN IF NOT EXISTS touchpoint_type text;
COMMENT ON COLUMN public.client_contacts.touchpoint_type IS 'Case-management category of the contact (e.g. general_checkin, housing_search)';
COMMENT ON COLUMN public.calendar_events.touchpoint_type IS 'Suggested/selected case-management category for the touchpoint';