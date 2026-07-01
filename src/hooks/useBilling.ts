import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BillingCycle,
  generateCyclesForClient,
  rateForLevel,
} from '@/lib/billing';

export interface BillingClient {
  id: string;
  first_name: string;
  last_name: string;
  insurance: string | null;
  member_id: string | null;
  level_of_need: string | null;
  status: string;
  auth_150_start: string | null;
  auth_150_end: string | null;
  auth_180_start: string | null;
  auth_180_end: string | null;
  assigned_employee_id: string | null;
  assigned_staff_name: string | null;
}

export interface BillingData {
  loading: boolean;
  clients: BillingClient[];
  cycles: BillingCycle[];
  refresh: () => Promise<void>;
  regenerate: () => Promise<{ created: number; updated: number }>;
  regenerateClient: (clientId: string) => Promise<void>;
}

const isOpen = (c: BillingClient) => c.status === 'active';

export function useBilling(): BillingData {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: cls } = await supabase
      .from('clients')
      .select(
        'id, first_name, last_name, insurance, member_id, level_of_need, status, auth_150_start, auth_150_end, auth_180_start, auth_180_end, assigned_employee_id',
      )
      .order('last_name');
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email');
    const nameById = new Map(
      (profs ?? []).map((p) => {
        const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        return [p.id, full || p.email] as const;
      }),
    );
    const { data: cyc } = await supabase.from('billing_cycles').select('*').order('cycle_number');
    const mapped = ((cls as Array<Omit<BillingClient, 'assigned_staff_name'>>) ?? []).map((c) => ({
      ...c,
      assigned_staff_name: c.assigned_employee_id ? nameById.get(c.assigned_employee_id) ?? null : null,
    }));
    setClients(mapped as BillingClient[]);
    setCycles((cyc as BillingCycle[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Generate missing cycles + refresh still-auto cycles for a single client.
  const regenerateOne = useCallback(
    async (client: BillingClient, existing: BillingCycle[]) => {
      if (!isOpen(client) || !client.auth_150_start) return { created: 0, updated: 0 };
      const ideal = generateCyclesForClient(client);
      const byNumber = new Map(existing.map((c) => [c.cycle_number, c]));
      let created = 0;
      let updated = 0;

      for (const g of ideal) {
        const found = byNumber.get(g.cycle_number);
        if (!found) {
          await supabase.from('billing_cycles').insert({
            client_id: client.id,
            cycle_number: g.cycle_number,
            phase: g.phase,
            cycle_start: g.cycle_start,
            cycle_end: g.cycle_end,
            billed_amount: g.billed_amount,
            is_auto_generated: true,
          });
          created++;
        } else if (found.is_auto_generated) {
          // refresh auto-generated rows from current auth dates / level
          const patch: Record<string, unknown> = {};
          if (found.phase !== g.phase) patch.phase = g.phase;
          if (found.cycle_start !== g.cycle_start) patch.cycle_start = g.cycle_start;
          if (found.cycle_end !== g.cycle_end) patch.cycle_end = g.cycle_end;
          if ((found.billed_amount ?? null) !== (g.billed_amount ?? null)) patch.billed_amount = g.billed_amount;
          if (Object.keys(patch).length) {
            await supabase.from('billing_cycles').update(patch).eq('id', found.id);
            updated++;
          }
        }
      }
      return { created, updated };
    },
    [],
  );

  const regenerate = useCallback(async () => {
    let created = 0;
    let updated = 0;
    const byClient = new Map<string, BillingCycle[]>();
    cycles.forEach((c) => {
      (byClient.get(c.client_id) ?? byClient.set(c.client_id, []).get(c.client_id)!).push(c);
    });
    for (const client of clients) {
      const r = await regenerateOne(client, byClient.get(client.id) ?? []);
      created += r.created;
      updated += r.updated;
    }
    await load();
    return { created, updated };
  }, [clients, cycles, regenerateOne, load]);

  const regenerateClient = useCallback(
    async (clientId: string) => {
      const client = clients.find((c) => c.id === clientId);
      if (!client) return;
      await regenerateOne(client, cycles.filter((c) => c.client_id === clientId));
      await load();
    },
    [clients, cycles, regenerateOne, load],
  );

  return { loading, clients, cycles, refresh: load, regenerate, regenerateClient };
}

export { rateForLevel };
