-- Structured form template submissions (Initial Assessment Tool, Level of Need
-- Assessment Tool, Housing Stabilization Plan) filled out in the browser are
-- stored as JSON alongside the existing uploaded-PDF flow.
ALTER TABLE public.client_forms
ADD COLUMN form_data jsonb;
