// Daily billing maintenance: ask the database to re-sync billing cycles for every
// open client. Cycle generation lives in public.sync_client_billing_cycles, which
// also runs automatically on client insert/update. Manually edited cycles
// (is_auto_generated = false) are never overwritten by the engine.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());

  const { data: clients, error: clientsError } = await supabase
    .from('clients')
    .select('id, auth_150_start, hsp_150_date, auth_150_end')
    .eq('status', 'active');

  if (clientsError) {
    return new Response(JSON.stringify({ ok: false, error: clientsError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let synced = 0;
  let failed = 0;

  for (const client of clients ?? []) {
    // Legacy records may only carry hsp_150_date — promote it to the canonical
    // anchor so the engine can build cycles from it.
    if (!client.auth_150_start && client.hsp_150_date) {
      await supabase
        .from('clients')
        .update({ auth_150_start: client.hsp_150_date })
        .eq('id', client.id);
    }
    const { error } = await supabase.rpc('sync_client_billing_cycles', { p_client_id: client.id });
    if (error) failed++;
    else synced++;
  }

  return new Response(JSON.stringify({ ok: true, synced, failed, today }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
