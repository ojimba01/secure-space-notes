// Client-side helper to (re)generate a single client's billing cycles.
// Mirrors the per-client logic in useBilling.regenerateClient so it can be
// called right after a client is created/edited, without loading the whole hook.
import { supabase } from '@/integrations/supabase/client';
import { BillingCycle, generateCyclesForClient, isSetupComplete } from '@/lib/billing';

export async function regenerateClientCycles(clientId: string): Promise<void> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, status, approval_status, level_of_need, auth_150_start, auth_150_end, auth_180_start, auth_180_end')
    .eq('id', clientId)
    .maybeSingle();

  if (!client) return;
  if (client.status !== 'active' || !isSetupComplete(client)) return;

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
      const patch: Record<string, unknown> = {};
      if (found.phase !== g.phase) patch.phase = g.phase;
      if (found.cycle_start !== g.cycle_start) patch.cycle_start = g.cycle_start;
      if (found.cycle_end !== g.cycle_end) patch.cycle_end = g.cycle_end;
      if ((found.billed_amount ?? null) !== (g.billed_amount ?? null)) patch.billed_amount = g.billed_amount;
      if (Object.keys(patch).length) {
        await supabase.from('billing_cycles').update(patch).eq('id', found.id);
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
