// Daily billing maintenance: regenerate missing/auto cycles for open clients,
// refresh still-auto cycles from current auth dates/level, and mark past-due.
// Never touches superadmin-edited rows (is_auto_generated = false).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CYCLE_LENGTH_DAYS = 30;
const MAX_CYCLES = 12;
const CYCLES_150 = 5;
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
function rateForLevel(level: string | null) {
  if (!level) return null;
  const l = level.trim().toLowerCase();
  if (l.startsWith('low')) return RATE_LOW;
  if (l.startsWith('high')) return RATE_HIGH;
  return null;
}
function isHspSubmitted(client: any) {
  const s = (client.approval_status ?? '').trim().toLowerCase();
  return s === 'submitted' || s === 'approved';
}
function isSetupComplete(client: any) {
  return isHspSubmitted(client) && !!client.auth_150_start && rateForLevel(client.level_of_need) != null;
}

function generateCycles(client: any) {
  const start = client.auth_150_start;
  if (!start) return [] as any[];
  const amount = rateForLevel(client.level_of_need);
  const has180 = !!(client.auth_180_start || client.auth_180_end);
  let lastCycle = CYCLES_150;
  if (has180 && client.auth_180_end) {
    const diff = daysBetween(start, client.auth_180_end);
    if (diff >= 0) lastCycle = Math.min(Math.max(CYCLES_150, Math.floor(diff / CYCLE_LENGTH_DAYS) + 1), MAX_CYCLES);
  }
  const cycles: any[] = [];
  for (let n = 1; n <= lastCycle; n++) {
    const cycleStart = addDays(start, CYCLE_LENGTH_DAYS * (n - 1));
    const cycleEnd = addDays(cycleStart, CYCLE_LENGTH_DAYS - 1);
    const phase = n <= CYCLES_150 ? '150-Day' : '180-Day';
    cycles.push({ cycle_number: n, phase, cycle_start: cycleStart, cycle_end: cycleEnd, billed_amount: amount });
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
    .select('id, level_of_need, status, approval_status, auth_150_start, auth_150_end, auth_180_start, auth_180_end')
    .eq('status', 'active');

  const { data: allCycles } = await supabase.from('billing_cycles').select('*');
  const byClient = new Map<string, any[]>();
  (allCycles ?? []).forEach((c: any) => {
    const arr = byClient.get(c.client_id) ?? [];
    arr.push(c); byClient.set(c.client_id, arr);
  });

  for (const client of clients ?? []) {
    if (!isSetupComplete(client)) continue;
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
    // Trim stale auto-generated cycles beyond the run with no manual history.
    const ideal = generateCycles(client);
    const maxNum = ideal.length ? ideal[ideal.length - 1].cycle_number : 0;
    for (const c of existing) {
      if (
        c.cycle_number > maxNum && c.is_auto_generated &&
        c.billing_status === 'Not Billed' && c.payment_status === 'Unpaid' &&
        !c.submitted_date && !c.paid_date && !c.claim_number
      ) {
        await supabase.from('billing_cycles').delete().eq('id', c.id);
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, created, updated, today }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
