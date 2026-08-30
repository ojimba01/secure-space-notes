// What is stopping work, for the person who can unstop it.
//
// Five questions, each with a client list behind it. Four are about setup a
// client is missing, and the fifth is money with a date on it.
//
// A client can appear in more than one list — most of the ones with no start
// date have no level of need either — so the five counts deliberately do not
// add up to the total. `blockedClients` is the distinct count, and that is the
// number worth reading first.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { serviceStartDate, hspSubmitted } from '@/lib/workflow';
import {
  daysToFinalDeadline,
  isStillBillable,
  todayAgency,
  type BillingCycle,
} from '@/lib/billing';

export type QueueKey =
  | 'unassigned'
  | 'noLevelOfNeed'
  | 'noStartDate'
  | 'noHsp'
  | 'billingDueThisWeek';

export interface QueueClient {
  id: string;
  name: string;
  /** Who carries the case, when anyone does. */
  staffName: string | null;
  insurance: string | null;
  /** Only on the billing queue: days until the last day this can be filed. */
  daysLeft?: number;
  /** Only on the billing queue: which cycle is running out. */
  cycleLabel?: string;
}

export interface AdminSetupQueues {
  loading: boolean;
  error: string | null;
  activeClients: number;
  /** Distinct clients held up by at least one of the four setup gaps. */
  blockedClients: number;
  queues: Record<QueueKey, QueueClient[]>;
  reload: () => void;
}

/** Days inside which a filing deadline counts as this week's problem. */
const DUE_SOON_DAYS = 7;

const EMPTY: Record<QueueKey, QueueClient[]> = {
  unassigned: [],
  noLevelOfNeed: [],
  noStartDate: [],
  noHsp: [],
  billingDueThisWeek: [],
};

interface ClientRow {
  id: string;
  first_name: string;
  last_name: string;
  assigned_employee_id: string | null;
  level_of_need: string | null;
  hsp_submitted: boolean | null;
  auth_150_number: string | null;
  auth_180_number: string | null;
  auth_30_start: string | null;
  auth_150_start: string | null;
  hsp_150_date: string | null;
  insurance: string | null;
}

export function useAdminSetupQueues(): AdminSetupQueues {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeClients, setActiveClients] = useState(0);
  const [blockedClients, setBlockedClients] = useState(0);
  const [queues, setQueues] = useState<Record<QueueKey, QueueClient[]>>(EMPTY);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: clients, error: cErr }, { data: profiles }, { data: cycles }] =
        await Promise.all([
          supabase
            .from('clients')
            .select(
              'id, first_name, last_name, assigned_employee_id, level_of_need, hsp_submitted, auth_150_number, auth_180_number, auth_30_start, auth_150_start, hsp_150_date, insurance',
            )
            .eq('status', 'active')
            .order('last_name'),
          supabase.from('profiles').select('id, first_name, last_name'),
          supabase
            .from('billing_cycles')
            .select('id, client_id, cycle_number, cycle_end, final_deadline, approval_state, billing_status'),
        ]);
      if (cErr) throw cErr;

      const rows = (clients ?? []) as ClientRow[];
      const staffName = new Map<string, string>();
      for (const p of profiles ?? []) {
        staffName.set(p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Unnamed');
      }

      const base = (c: ClientRow): QueueClient => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        staffName: c.assigned_employee_id ? staffName.get(c.assigned_employee_id) ?? null : null,
        insurance: c.insurance,
      });

      const next: Record<QueueKey, QueueClient[]> = {
        unassigned: [],
        noLevelOfNeed: [],
        noStartDate: [],
        noHsp: [],
        billingDueThisWeek: [],
      };

      // Clients with a Housing Stabilization Plan filed against them.
      const { data: hspRows } = await supabase
        .from('client_forms')
        .select('client_id')
        .eq('form_type', 'Housing Stabilization Plan (HSP)')
        .not('client_id', 'is', null);
      const hspOnFile = new Set((hspRows ?? []).map((r) => r.client_id as string));

      const blocked = new Set<string>();
      for (const c of rows) {
        let held = false;
        if (!c.assigned_employee_id) {
          next.unassigned.push(base(c));
          held = true;
        }
        // Anything that is not one of the two real tiers is missing, including
        // a value someone typed by hand that the rate table cannot price.
        if (c.level_of_need !== 'Low Level' && c.level_of_need !== 'High Level') {
          next.noLevelOfNeed.push(base(c));
          held = true;
        }
        if (!serviceStartDate(c)) {
          next.noStartDate.push(base(c));
          held = true;
        }
        // Three things say the plan went in, and any one of them is enough.
        // The flag; a 150-day or 180-day authorization number, which the
        // agency only receives after the plan is submitted; or the plan itself
        // filed on the client, which is what staff see on the Forms tab. The
        // third was missing, so 15 clients showed a completed HSP on their own
        // record and appeared here as though they had none.
        if (!hspSubmitted(c) && !hspOnFile.has(c.id)) {
          next.noHsp.push(base(c));
          held = true;
        }
        if (held) blocked.add(c.id);
      }

      // Money with a date on it. Only active clients, only cycles that have
      // ended and can still be filed, and only the one running out soonest for
      // each client — a name should appear once, not five times.
      const today = todayAgency();
      const byId = new Map(rows.map((c) => [c.id, c]));
      const soonest = new Map<string, { days: number; cycleNumber: number | null }>();
      for (const raw of (cycles ?? []) as unknown as BillingCycle[]) {
        const client = byId.get(raw.client_id);
        if (!client) continue;
        if (!isStillBillable(raw, today)) continue;
        const days = daysToFinalDeadline(raw, today);
        if (days > DUE_SOON_DAYS) continue;
        const held = soonest.get(raw.client_id);
        if (!held || days < held.days) {
          soonest.set(raw.client_id, { days, cycleNumber: raw.cycle_number ?? null });
        }
      }
      for (const [clientId, { days, cycleNumber }] of soonest) {
        const client = byId.get(clientId);
        if (!client) continue;
        next.billingDueThisWeek.push({
          ...base(client),
          daysLeft: days,
          cycleLabel: cycleNumber ? `Cycle ${cycleNumber}` : 'A cycle',
        });
      }
      next.billingDueThisWeek.sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

      setActiveClients(rows.length);
      setBlockedClients(blocked.size);
      setQueues(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The dashboard could not be loaded.');
      setQueues(EMPTY);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { loading, error, activeClients, blockedClients, queues, reload: load };
}
