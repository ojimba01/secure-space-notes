
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- helper to call the edge function with a given job
CREATE OR REPLACE FUNCTION public.call_compliance_cron(_job text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://gotwcbjywtdlyrtfjqnw.supabase.co/functions/v1/compliance-cron',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('job', _job)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.call_compliance_cron(text) FROM PUBLIC, anon, authenticated;

-- daily status recompute @ 06:00 UTC
SELECT cron.schedule('compliance-daily-recompute', '0 6 * * *', $$SELECT public.call_compliance_cron('daily_recompute');$$);

-- monthly: emergency gate for prior month, then generate current month (1st @ 05:00 / 05:10 UTC)
SELECT cron.schedule('compliance-monthly-emergency', '0 5 1 * *', $$SELECT public.call_compliance_cron('monthly_emergency');$$);
SELECT cron.schedule('compliance-monthly-generate', '10 5 1 * *', $$SELECT public.call_compliance_cron('monthly_generate');$$);

-- weekly audit: Mondays @ 07:00 UTC
SELECT cron.schedule('compliance-weekly-audit', '0 7 * * 1', $$SELECT public.call_compliance_cron('weekly_audit');$$);
