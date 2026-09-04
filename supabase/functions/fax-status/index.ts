// What the fax service says happened, written back onto the form.
//
// HumbleFax posts here when a fax finishes. It cannot present a Supabase JWT,
// so verify_jwt is off and this function authenticates the call itself, on a
// shared secret, exactly as sheet-intake does. HumbleFax does not sign its
// webhooks, so the secret is the whole of the proof: register the webhook URL
// with ?token=<HUMBLEFAX_WEBHOOK_TOKEN> on the end.
//
// A fax that lands is the form reaching the MCO, so this is also what sets
// "Sent to MCO" -- the status stops depending on somebody remembering to press
// a button after the fax went through.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-token',
};

/** The service's words for what happened, in ours. */
const OUTCOME: Record<string, 'sent' | 'failed'> = {
  success: 'sent',
  sent: 'sent',
  complete: 'sent',
  completed: 'sent',
  delivered: 'sent',
  failure: 'failed',
  failed: 'failed',
  error: 'failed',
  cancelled: 'failed',
  canceled: 'failed',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const token = Deno.env.get('HUMBLEFAX_WEBHOOK_TOKEN');
  if (!token) return json({ error: 'HUMBLEFAX_WEBHOOK_TOKEN is not configured.' }, 500);

  const presented =
    new URL(req.url).searchParams.get('token') ?? req.headers.get('x-webhook-token') ?? '';
  if (presented !== token) return json({ error: 'Unauthorized.' }, 401);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const data = (payload.data ?? {}) as Record<string, unknown>;
  const fax = (data.sentFax ?? data.SentFax ?? data.fax ?? data) as Record<string, unknown>;
  const faxId = fax?.id != null ? String(fax.id) : '';
  const rawStatus = String(fax?.status ?? '').toLowerCase();
  if (!faxId) return json({ error: 'No fax id in the payload.' }, 400);

  const outcome = OUTCOME[rawStatus];
  // A status we do not recognise is recorded rather than guessed at. Guessing
  // "sent" would mark a form as reaching the MCO when it may not have.
  const stamp = new Date().toISOString();

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data: form, error: readErr } = await supabase
    .from('client_forms')
    .select('id, file_path, external_status')
    .eq('fax_id', faxId)
    .maybeSingle();
  if (readErr) return json({ error: `Could not find the form: ${readErr.message}` }, 500);
  // Answer 200 for a fax this app did not send, so the service does not retry
  // it forever and eventually revoke the webhook.
  if (!form) return json({ ok: true, ignored: `No form is waiting on fax ${faxId}.` });

  const update: Record<string, unknown> = {
    fax_status: outcome ?? 'failed',
    fax_completed_at: stamp,
    fax_error: outcome === 'sent' ? null : `The fax service reported "${rawStatus || 'no status'}".`,
  };

  // A delivered fax is the form having gone to the MCO. Only ever a step
  // forward: a form already accepted or denied is not reopened by a late
  // webhook about the fax that got it there.
  if (outcome === 'sent' && ['not_sent', 'failed', null, undefined].includes(form.external_status as string)) {
    update.external_status = 'sent_to_mco';
    update.sent_to_mco_at = stamp;
  }

  const { error: updErr } = await supabase.from('client_forms').update(update).eq('id', form.id);
  if (updErr) return json({ error: `Could not record it: ${updErr.message}` }, 500);

  return json({ ok: true, faxId, status: update.fax_status });
});
