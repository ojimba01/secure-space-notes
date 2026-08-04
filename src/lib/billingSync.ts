// Client-side helper to (re)generate a single client's billing cycles.
// Cycle generation lives in the database (public.sync_client_billing_cycles),
// which also runs automatically on every client insert/update. This helper just
// asks the database to re-sync a single client on demand.
import { supabase } from '@/integrations/supabase/client';

export async function regenerateClientCycles(clientId: string): Promise<void> {
  await supabase.rpc('sync_client_billing_cycles', { p_client_id: clientId });
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
