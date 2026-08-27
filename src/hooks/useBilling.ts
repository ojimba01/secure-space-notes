import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BillingCycle } from '@/lib/billing';
import {
  syncAuthorizationsFromLegacyColumns,
  touchesAuthorizationData,
} from '@/lib/authorizations';
import { regenerateClientCycles } from '@/lib/billingSync';

export interface BillingClient {
  id: string; first_name: string; last_name: string; insurance: string | null;
  member_id: string | null; level_of_need: string | null; status: string | null;
  hsp_submitted: boolean | null; auth_150_start: string | null; auth_150_end: string | null;
  auth_180_approved: boolean | null; auth_180_start: string | null; auth_180_end: string | null;
  assigned_employee_id: string | null; assigned_staff_name: string | null;
  billing_tracking_start: string | null;
  auth_30_start: string | null; auth_30_end: string | null; hsp_due_date: string | null;
  auth_30_number: string | null; auth_150_number: string | null; auth_180_number: string | null;
  created_at: string | null; deleted_at: string | null;
}

const CLIENT_COLUMNS =
  'id,first_name,last_name,insurance,member_id,level_of_need,status,hsp_submitted,auth_150_start,auth_150_end,auth_180_approved,auth_180_start,auth_180_end,assigned_employee_id,billing_tracking_start,auth_30_start,auth_30_end,hsp_due_date,auth_30_number,auth_150_number,auth_180_number,created_at,deleted_at';

// Deleted clients can be recovered for this many days before they are gone for good.
export const RECOVERY_WINDOW_DAYS = 30;

export function useBilling() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [deletedClients, setDeletedClients] = useState<BillingClient[]>([]);
  const [cycles, setCycles] = useState<(BillingCycle & { is_active?: boolean })[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cls, error: clientError }, { data: cyc, error: cycleError }, { data: profs }] = await Promise.all([
      supabase.from('clients').select(CLIENT_COLUMNS).order('last_name'),
      supabase.from('billing_cycles').select('*').eq('is_active', true).order('cycle_number'),
      supabase.from('profiles').select('id,first_name,last_name,email'),
    ]);
    if (clientError) throw clientError;
    if (cycleError) throw cycleError;
    const names = new Map((profs ?? []).map((p) => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email]));
    const all = ((cls ?? []) as unknown as BillingClient[]).map((c) => ({
      ...c,
      assigned_staff_name: c.assigned_employee_id ? names.get(c.assigned_employee_id) ?? null : null,
    }));
    const cutoff = Date.now() - RECOVERY_WINDOW_DAYS * 86400000;
    setClients(all.filter((c) => !c.deleted_at));
    setDeletedClients(
      all.filter((c) => c.deleted_at && new Date(c.deleted_at).getTime() >= cutoff)
        .sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')),
    );
    setCycles((cyc ?? []) as unknown as (BillingCycle & { is_active?: boolean })[]);
    setLoading(false);
  }, []);

  useEffect(() => { load().catch((e) => { console.error(e); setLoading(false); }); }, [load]);

  const updateClient = async (id: string, patch: Partial<BillingClient>) => {
    const { id: _id, assigned_staff_name: _staff, ...databasePatch } = patch;
    const { error } = await supabase.from('clients').update(databasePatch as never).eq('id', id);
    if (error) throw error;

    // Editing an authorization date or the level of need from the billing
    // screens has to reach the same places the Authorizations panel does:
    // the authorization history, and the generated cycles. Otherwise the two
    // views of the same authorization drift apart with nothing to show it.
    const touchedAuth = touchesAuthorizationData(databasePatch);
    let followUpError: unknown = null;
    try {
      if (touchedAuth) await syncAuthorizationsFromLegacyColumns(id);
      if (touchedAuth || 'level_of_need' in databasePatch) await regenerateClientCycles(id);
    } catch (err) {
      // The column write already succeeded, so the list still has to refresh
      // to show it. The failure is re-thrown afterwards so the caller can
      // report that billing is now out of step rather than hiding it.
      followUpError = err;
    }

    await load();
    if (followUpError) throw followUpError;
  };
  const addClient = async () => {
    const { data, error } = await supabase.from('clients').insert({ first_name: 'New', last_name: 'client', status: 'active' } as never).select('id').single();
    if (error) throw error;
    await load();
    return (data as { id: string }).id;
  };
  const deleteClient = async (id: string) => {
    const { error } = await supabase.from('clients').update({ deleted_at: new Date().toISOString() } as never).eq('id', id);
    if (error) throw error;
    await load();
  };
  const restoreClient = async (id: string) => {
    const { error } = await supabase.from('clients').update({ deleted_at: null } as never).eq('id', id);
    if (error) throw error;
    await load();
  };
  const updateCycle = async (id: string, patch: Partial<BillingCycle>) => {
    const { error } = await supabase.from('billing_cycles').update(patch as never).eq('id', id);
    if (error) throw error;
    await load();
  };
  return { loading, clients, deletedClients, cycles, refresh: load, updateClient, addClient, deleteClient, restoreClient, updateCycle };
}
