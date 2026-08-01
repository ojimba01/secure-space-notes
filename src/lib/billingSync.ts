// Client-side helper to (re)generate a single client's billing cycles.
// Mirrors the per-client logic in useBilling.regenerateClient so it can be
// called right after a client is created/edited, without loading the whole hook.
import { supabase } from '@/integrations/supabase/client';
import {
  BillingCycle,
  billingAnchor,
  derivedAuth150End,
  generateCyclesForClient,
  isSetupComplete,
} from '@/lib/billing';

const CLIENT_BILLING_SELECT =
  'id, status, closed_date, approval_status, level_of_need, hsp_150_date, auth_150_start, auth_150_end, auth_180_start, auth_180_end';

export async function regenerateClientCycles(clientId: string): Promise<void> {
  const { data: client } = await supabase
    .from('clients')
    .select(CLIENT_BILLING_SELECT)
    .eq('id', clientId)
    .maybeSingle();

  if (!client) return;
  if (client.status !== 'active' || client.closed_date) return;

  // Backfill the canonical anchor + 150-day end so every consumer agrees.
  const anchor = billingAnchor(client);
  const patch: Record<string, string> = {};
  if (anchor && !client.auth_150_start) patch.auth_150_start = anchor;
  if (anchor && !client.auth_150_end) patch.auth_150_end = derivedAuth150End(anchor)!;
  if (Object.keys(patch).length) {
    await supabase.from('clients').update(patch).eq('id', clientId);
    Object.assign(client, patch);
  }

  if (!isSetupComplete(client)) return;

  const { data: existingRows } = await supabase
    .from('billing_cycles')
    .select('*')
    .eq('client_id', clientId);
  const existing = (existingRows as BillingCycle[]) ?? [];

  const ideal = generateCyclesForClient(client);
  const byNumber = new Map(existing.map((c) => [c.cycle_number, c]));

  for (const g of ideal) {
    const found = byNumber.get(g.cycle_number);
    if (!found) {
      await supabase.from('billing_cycles').insert({
        client_id: clientId,
        cycle_number: g.cycle_number,
        phase: g.phase,
        cycle_start: g.cycle_start,
        cycle_end: g.cycle_end,
        billed_amount: g.billed_amount,
        is_auto_generated: true,
      });
    } else if (found.is_auto_generated) {
      // Only auto-generated rows are refreshed — hand-edited claim/payment
      // history is never touched.
      const p: Record<string, unknown> = {};
      if (found.phase !== g.phase) p.phase = g.phase;
      if (found.cycle_start !== g.cycle_start) p.cycle_start = g.cycle_start;
      if (found.cycle_end !== g.cycle_end) p.cycle_end = g.cycle_end;
      if ((found.billed_amount ?? null) !== (g.billed_amount ?? null)) p.billed_amount = g.billed_amount;
      if (Object.keys(p).length) {
        await supabase.from('billing_cycles').update(p).eq('id', found.id);
      }
    }
  }
}


// Fetch active case managers (profiles), excluding superadmins.
export interface CaseManagerOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

export async function fetchActiveCaseManagers(): Promise<CaseManagerOption[]> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, user_id')
    .eq('active', true)
    .order('first_name');

  const { data: superRoles } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'superadmin');
  const superIds = new Set((superRoles || []).map((r) => r.user_id));

  return (profiles || [])
    .filter((p) => !superIds.has((p as { user_id: string }).user_id))
    .map((p) => ({ id: p.id, first_name: p.first_name, last_name: p.last_name, email: p.email }));
}

export function caseManagerName(cm: { first_name: string | null; last_name: string | null; email: string }): string {
  const full = `${cm.first_name ?? ''} ${cm.last_name ?? ''}`.trim();
  return full || cm.email;
}
