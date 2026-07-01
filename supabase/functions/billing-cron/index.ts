// Daily billing maintenance: regenerate missing/auto cycles for open clients,
// refresh still-auto cycles from current auth dates/level, and mark past-due.
// Never touches superadmin-edited rows (is_auto_generated = false).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CYCLE_LENGTH_DAYS = 30;
const MAX_CYCLES = 12;
const RATE_LOW = 320;
const RATE_HIGH = 640;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function toDate(s: string) { return new Date(`${s}T12:00:00Z`); }
function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(s: string, days: number) { const d = toDate(s); d.setUTCDate(d.getUTCDate() + days); return fmt(d); }
function daysBetween(a: string, b: string) { return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000); }
function rateForLevel(level: string | null) { return level === 'Low Level' ? RATE_LOW : level === 'High Level' ? RATE_HIGH : null; }

function generateCycles(client: any) {
  const start = client.auth_150_start;
  if (!start) return [] as any[];
  const endOfRun = client.auth_180_end || client.auth_150_end || null;
  const amount = rateForLevel(client.level_of_need);
  const cycles: any[] = [];
  for (let n = 1; n <= MAX_CYCLES; n++) {
    const cycleStart = addDays(start, CYCLE_LENGTH_DAYS * (n - 1));
    if (endOfRun && daysBetween(cycleStart, endOfRun) < 0) break;
    const cycleEnd = addDays(cycleStart, CYCLE_LENGTH_DAYS - 1);
    const phase = client.auth_150_end && daysBetween(cycleStart, client.auth_150_end) >= 0 ? '150-Day' : '180-Day';
    cycles.push({ cycle_number: n, phase, cycle_start: cycleStart, cycle_end: cycleEnd, billed_amount: amount });
    if (endOfRun && daysBetween(cycleEnd, endOfRun) >= 0) break;
  }
  return cycles;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  let created = 0, updated = 0;

  const { data: clients } = await supabase
    .from('clients')
    .select('id, level_of_need, status, auth_150_start, auth_150_end, auth_180_start, auth_180_end')
    .eq('status', 'active');

  const { data: allCycles } = await supabase.from('billing_cycles').select('*');
  const byClient = new Map<string, any[]>();
  (allCycles ?? []).forEach((c: any) => {
    const arr = byClient.get(c.client_id) ?? [];
    arr.push(c); byClient.set(c.client_id, arr);
  });

  for (const client of clients ?? []) {
    if (!client.auth_150_start) continue;
    const existing = byClient.get(client.id) ?? [];
    const byNumber = new Map(existing.map((c: any) => [c.cycle_number, c]));
    for (const g of generateCycles(client)) {
      const found = byNumber.get(g.cycle_number);
      if (!found) {
        await supabase.from('billing_cycles').insert({
          client_id: client.id, cycle_number: g.cycle_number, phase: g.phase,
          cycle_start: g.cycle_start, cycle_end: g.cycle_end, billed_amount: g.billed_amount,
          is_auto_generated: true,
        });
        created++;
      } else if (found.is_auto_generated) {
        const patch: Record<string, unknown> = {};
        if (found.phase !== g.phase) patch.phase = g.phase;
        if (found.cycle_start !== g.cycle_start) patch.cycle_start = g.cycle_start;
        if (found.cycle_end !== g.cycle_end) patch.cycle_end = g.cycle_end;
        if ((found.billed_amount ?? null) !== (g.billed_amount ?? null)) patch.billed_amount = g.billed_amount;
        if (Object.keys(patch).length) {
          patch.updated_at = new Date().toISOString();
          await supabase.from('billing_cycles').update(patch).eq('id', found.id);
          updated++;
        }
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, created, updated, today }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
