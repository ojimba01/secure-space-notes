// Every case manager, with the state of this month's log beside their name.
//
// The Touchpoints tab is organised around people, not metrics: an administrator
// checking the month wants to know who has filed and who has not, and a number
// that spans the whole team answers neither question.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { monthKey } from '@/lib/caseLog';

export interface CaseManagerRow {
  id: string;
  name: string;
  email: string;
  /** Open clients carried. */
  clients: number;
  logStatus: 'submitted' | 'draft' | 'not_started';
  submittedAt: string | null;
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
        supabase
          .from('case_logs')
          .select('employee_id, status, submitted_at')
          .eq('month', month),
        // Closed cases are filtered by policy for staff and by intent here: a
        // caseload is the work someone is carrying, not the work they finished.
        supabase
          .from('clients')
          .select('assigned_employee_id, status')
          .is('deleted_at', null)
          .eq('status', 'active'),
        // Superadmins are the owner and the root accounts. They are not case
        // managers, so they do not belong on a list of case managers — even the
        // ones carrying a client or two. ReassignClientDialog leaves them out of
        // the assignable list for the same reason.
        supabase.from('user_roles').select('user_id').eq('role', 'superadmin'),
      ]);

      if (cancelled) return;

      const logByStaff = new Map(
        (logs ?? []).map((l) => [l.employee_id as string, l as { status: string; submitted_at: string | null }]),
      );
      const load = new Map<string, number>();
      (clients ?? []).forEach((c) => {
        const id = (c as { assigned_employee_id: string | null }).assigned_employee_id;
        if (id) load.set(id, (load.get(id) ?? 0) + 1);
      });

      const superIds = new Set((superRoles ?? []).map((r) => r.user_id as string));

      setRows(
        (staff ?? [])
          .filter((p) => !superIds.has(p.user_id as string))
          .map((p) => {
            const log = logByStaff.get(p.id as string);
            return {
              id: p.id as string,
              name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || (p.email as string),
              email: p.email as string,
              clients: load.get(p.id as string) ?? 0,
              logStatus: !log ? 'not_started' : log.status === 'submitted' ? 'submitted' : 'draft',
              submittedAt: log?.submitted_at ?? null,
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
