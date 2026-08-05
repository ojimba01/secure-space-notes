import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BillingCycle } from '@/lib/billing';

export interface BillingClient {
  id: string; first_name: string; last_name: string; insurance: string | null;
  member_id: string | null; level_of_need: string | null; status: string | null;
  hsp_submitted: boolean; auth_150_start: string | null; auth_150_end: string | null;
  auth_180_approved: boolean; auth_180_start: string | null; auth_180_end: string | null;
  assigned_employee_id: string | null; assigned_staff_name: string | null;
  billing_tracking_start: string | null;
}

export function useBilling() {
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [cycles, setCycles] = useState<(BillingCycle & { is_active?: boolean })[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cls, error: clientError }, { data: cyc, error: cycleError }, { data: profs }] = await Promise.all([
      supabase.from('clients').select('id,first_name,last_name,insurance,member_id,level_of_need,status,hsp_submitted,auth_150_start,auth_150_end,auth_180_approved,auth_180_start,auth_180_end,assigned_employee_id,billing_tracking_start').order('last_name'),
      supabase.from('billing_cycles').select('*').eq('is_active', true).order('cycle_number'),
      supabase.from('profiles').select('id,first_name,last_name,email'),
    ]);
    if (clientError) throw clientError;
    if (cycleError) throw cycleError;
    const names = new Map((profs ?? []).map((p) => [p.id, `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email]));
    setClients(((cls ?? []) as unknown as BillingClient[]).map((c) => ({ ...c, assigned_staff_name: c.assigned_employee_id ? names.get(c.assigned_employee_id) ?? null : null })));
    setCycles((cyc ?? []) as unknown as (BillingCycle & { is_active?: boolean })[]);
    setLoading(false);
  }, []);

  useEffect(() => { load().catch((e) => { console.error(e); setLoading(false); }); }, [load]);

  const updateClient = async (id: string, patch: Partial<BillingClient>) => {
    const { id: _id, assigned_staff_name: _staff, ...databasePatch } = patch;
    const { error } = await supabase.from('clients').update(databasePatch as never).eq('id', id);
    if (error) throw error;
    await load();
  };
  const addClient = async () => {
    const { data, error } = await supabase.from('clients').insert({ first_name: 'New', last_name: 'client', status: 'active' } as never).select('id').single();
    if (error) throw error;
    await load();
    return (data as { id: string }).id;
  };
  const updateCycle = async (id: string, patch: Partial<BillingCycle>) => {
    const { error } = await supabase.from('billing_cycles').update(patch as never).eq('id', id);
    if (error) throw error;
    await load();
  };
  return { loading, clients, cycles, refresh: load, updateClient, addClient, updateCycle };
}
