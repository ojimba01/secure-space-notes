import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BillingCycle,
  billingAnchor,
  derivedAuth150End,
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
  approval_status: string | null;
  hsp_150_date: string | null;

  auth_150_start: string | null;
  auth_150_end: string | null;
  auth_180_start: string | null;
  auth_180_end: string | null;
  auth_180_approved: boolean | null;
  hsp_submitted: boolean | null;
  billing_tracking_start: string | null;
  assigned_employee_id: string | null;
  assigned_staff_name: string | null;
  phone: string | null;
  intake_date: string | null;
  assessment_due_date: string | null;
  mco_housing_manager: string | null;
  auth_30_number: string | null;
  auth_30_start: string | null;
  auth_30_end: string | null;
  hsp_due_date: string | null;
  auth_150_number: string | null;
  auth_180_number: string | null;
  next_action_due_date: string | null;
  closed_date: string | null;
  reason_closed: string | null;
  notes: string | null;
}

export interface BillingData {
  loading: boolean;
  clients: BillingClient[];
  cycles: BillingCycle[];
  refresh: () => Promise<void>;
  regenerate: () => Promise<{ created: number; updated: number }>;
  regenerateClient: (clientId: string) => Promise<void>;
}

const CLIENT_SELECT =
  'id, first_name, last_name, insurance, member_id, level_of_need, status, approval_status, hsp_150_date, auth_150_start, auth_150_end, auth_180_start, auth_180_end, auth_180_approved, hsp_submitted, billing_tracking_start, assigned_employee_id, phone, intake_date, assessment_due_date, mco_housing_manager, auth_30_number, auth_30_start, auth_30_end, hsp_due_date, auth_150_number, auth_180_number, next_action_due_date, closed_date, reason_closed, notes';

export function useBilling(): BillingData {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [cycles, setCycles] = useState<BillingCycle[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: cls } = await supabase.from('clients').select(CLIENT_SELECT).order('last_name');
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email');
    const nameById = new Map(
      (profs ?? []).map((p) => {
        const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        return [p.id, full || p.email] as const;
      }),
    );
    // Only live cycles drive the UI — superseded rows stay in the record for history.
    const { data: cyc } = await supabase
      .from('billing_cycles')
      .select('*')
      .eq('is_active', true)
      .order('cycle_number');
    // Every open client appears in billing — clients missing setup show up with a
    // "missing information" next action instead of being hidden.
    const mapped = ((cls as Array<Omit<BillingClient, 'assigned_staff_name'>>) ?? [])
      .filter((c) => c.status === 'active' && !c.closed_date)
      .map((c) => ({
        ...c,
        // Normalize the anchor locally so the UI matches what cycles were built from.
        auth_150_start: billingAnchor(c),
        auth_150_end: c.auth_150_end || derivedAuth150End(billingAnchor(c)),
        assigned_staff_name: c.assigned_employee_id ? nameById.get(c.assigned_employee_id) ?? null : null,
      }));
    setClients(mapped as BillingClient[]);
    setCycles((cyc as BillingCycle[]) ?? []);
    setLoading(false);
  }, []);


  useEffect(() => {
    load();
  }, [load]);

  // Cycle generation lives in the database. Re-syncing asks it to rebuild each
  // client's cycles from their current setup fields.
  const regenerate = useCallback(async () => {
    const before = cycles.length;
    for (const client of clients) {
      await supabase.rpc('sync_client_billing_cycles', { p_client_id: client.id });
    }
    await load();
    const { count } = await supabase
      .from('billing_cycles')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    const after = count ?? before;
    return { created: Math.max(0, after - before), updated: Math.min(after, before) };
  }, [clients, cycles.length, load]);

  const regenerateClient = useCallback(
    async (clientId: string) => {
      await supabase.rpc('sync_client_billing_cycles', { p_client_id: clientId });
      await load();
    },
    [load],
  );

  return { loading, clients, cycles, refresh: load, regenerate, regenerateClient };
}

export { rateForLevel };
