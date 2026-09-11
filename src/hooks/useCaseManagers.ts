// Every case manager, with the state of this month's log beside their name.
//
// The Touchpoints tab is organised around people, not metrics: an administrator
// checking the month wants to know who has filed and who has not, and a number
// that spans the whole team answers neither question.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { monthKey } from '@/lib/caseLog';

/** Last day of the month a key names, so a query can bound itself. */
const monthEndOf = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0)).toISOString().slice(0, 10);
};

export interface CaseManagerRow {
  id: string;
  name: string;
  email: string;
  /** Open clients carried. */
  clients: number;
  /** Touchpoints logged this month — what their case log will hold. */
  logged: number;
}

export interface CaseManagersData {
  loading: boolean;
  rows: CaseManagerRow[];
  month: string;
  refresh: () => void;
}

export function useCaseManagers(month: string = monthKey(new Date())): CaseManagersData {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CaseManagerRow[]>([]);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);

      const [{ data: staff }, { data: logs }, { data: clients }, { data: superRoles }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, user_id, first_name, last_name, email')
          .eq('active', true)
          .order('first_name', { ascending: true }),
        // What their log holds. There is no submitted state to report — the app
        // cannot reach HMIS, so the only honest number is how much work is in
        // the month.
        supabase
          .from('client_contacts')
          .select('employee_id')
          .gte('contact_date', month)
          .lte('contact_date', monthEndOf(month)),
        // Closed cases are filtered by policy for staff and by intent here: a
        // caseload is the work someone is carrying, not the work they finished.
        supabase
          .from('clients')
          .select('assigned_employee_id, status')
          .is('deleted_at', null)
          .eq('status', 'active'),
        // Roles decide who is a case manager, alongside the caseload below.
        supabase.from('user_roles').select('user_id, role').in('role', ['superadmin', 'admin']),
      ]);

      if (cancelled) return;

      const loggedBy = new Map<string, number>();
      (logs ?? []).forEach((c) => {
        const id = (c as { employee_id: string }).employee_id;
        if (id) loggedBy.set(id, (loggedBy.get(id) ?? 0) + 1);
      });
      const load = new Map<string, number>();
      (clients ?? []).forEach((c) => {
        const id = (c as { assigned_employee_id: string | null }).assigned_employee_id;
        if (id) load.set(id, (load.get(id) ?? 0) + 1);
      });

      const superIds = new Set(
        (superRoles ?? []).filter((r) => r.role === 'superadmin').map((r) => r.user_id as string),
      );
      const adminIds = new Set(
        (superRoles ?? []).filter((r) => r.role === 'admin').map((r) => r.user_id as string),
      );

      // Who counts as a case manager.
      //
      // Superadmins never do — the owner and the root accounts are not carrying
      // a caseload, and ReassignClientDialog leaves them out of the assignable
      // list for the same reason.
      //
      // Admins are the awkward case, because role does not settle it: one of
      // them carries the largest caseload in the agency and another carries
      // none. The caseload settles it. An admin with clients is a case manager
      // who also administers; an admin with none is an administrator, and a page
      // about whose month is whose has nothing to say about them. Staff with no
      // clients stay — new, or between assignments, and still expected here.
      const isCaseManager = (userId: string, profileId: string) => {
        if (superIds.has(userId)) return false;
        if (adminIds.has(userId)) return (load.get(profileId) ?? 0) > 0;
        return true;
      };

      setRows(
        (staff ?? [])
          .filter((p) => isCaseManager(p.user_id as string, p.id as string))
          .map((p) => {
            return {
              id: p.id as string,
              name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || (p.email as string),
              email: p.email as string,
              clients: load.get(p.id as string) ?? 0,
              logged: loggedBy.get(p.id as string) ?? 0,
            };
          }),
      );
      setLoading(false);
    };

    void run().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [month, nonce]);

  return { loading, rows, month, refresh };
}
