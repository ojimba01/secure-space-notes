import { supabase } from '@/integrations/supabase/client';
import { BillingCycle, todayAgency, daysBetween, currentCycleNumber } from '@/lib/billing';
import { BillingClient } from '@/hooks/useBilling';

export interface DeadlineRow {
  cycle: BillingCycle;
  client: BillingClient;
  dueDate: string;
  daysRemaining: number; // negative = overdue
}

export type DeadlineBucket = 'overdue' | 'week' | 'month' | 'later';

export function bucketFor(daysRemaining: number): DeadlineBucket {
  if (daysRemaining < 0) return 'overdue';
  if (daysRemaining <= 7) return 'week';
  if (daysRemaining <= 30) return 'month';
  return 'later';
}

export const BUCKET_META: Record<
  DeadlineBucket,
  { label: string; badgeClass: string; rowClass: string }
> = {
  overdue: { label: '⚠ Overdue', badgeClass: 'bg-red-600 text-white hover:bg-red-600', rowClass: 'text-red-700' },
  week: { label: 'Due this week', badgeClass: 'bg-amber-500 text-white hover:bg-amber-500', rowClass: 'text-amber-700' },
  month: { label: 'Due this month', badgeClass: 'bg-blue-600 text-white hover:bg-blue-600', rowClass: 'text-blue-700' },
  later: { label: 'Later', badgeClass: 'bg-gray-400 text-white hover:bg-gray-400', rowClass: 'text-muted-foreground' },
};

// Build the set of "deadline" rows: for each active client with cycles, show
// their current cycle plus any past-due, not-yet-Submitted cycles.
export function buildDeadlineRows(
  clients: BillingClient[],
  cycles: BillingCycle[],
  today = todayAgency(),
): DeadlineRow[] {
  const clientMap = new Map(clients.map((c) => [c.id, c]));
  const byClient = new Map<string, BillingCycle[]>();
  for (const c of cycles) {
    const arr = byClient.get(c.client_id) ?? [];
    arr.push(c);
    byClient.set(c.client_id, arr);
  }

  const rows: DeadlineRow[] = [];
  for (const [clientId, list] of byClient.entries()) {
    const client = clientMap.get(clientId);
    if (!client || client.status !== 'active') continue;

    const chosen = new Map<string, BillingCycle>();
    const cur = currentCycleNumber(client.auth_150_start, today);
    if (cur != null) {
      const currentCycle = list.find((c) => c.cycle_number === cur);
      if (currentCycle) chosen.set(currentCycle.id, currentCycle);
    }
    // past-due (ended before today) and not yet submitted
    for (const c of list) {
      if (daysBetween(c.cycle_end, today) > 0 && c.billing_status !== 'Submitted') {
        chosen.set(c.id, c);
      }
    }

    for (const cycle of chosen.values()) {
      rows.push({
        cycle,
        client,
        dueDate: cycle.cycle_end,
        daysRemaining: daysBetween(today, cycle.cycle_end),
      });
    }
  }

  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

// Mark a cycle as Submitted, audit-logged. Setting is_auto_generated=false
// protects it from future auto-generation overwrites.
export async function markCycleSubmitted(cycle: BillingCycle): Promise<void> {
  const today = todayAgency();
  const { error } = await supabase
    .from('billing_cycles')
    .update({ billing_status: 'Submitted', submitted_date: today, is_auto_generated: false })
    .eq('id', cycle.id);
  if (error) throw error;
  try {
    await supabase.rpc('create_audit_log', {
      _action: 'UPDATE',
      _table_name: 'billing_cycles',
      _record_id: cycle.id,
      _old_data: { billing_status: cycle.billing_status, submitted_date: cycle.submitted_date },
      _new_data: { billing_status: 'Submitted', submitted_date: today },
    });
  } catch {
    /* audit log is best-effort */
  }
}
