// What the team actually did this week.
//
// The Touchpoints tab used to answer a different question here — which clients
// were missing setup information. That was never work an administrator could
// act on from this screen, and it is already flagged on the record itself, so
// it has been replaced by the thing a supervisor opens this tab to see: the
// touchpoints that came in.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { endOfWeek, startOfWeek, todayAgency } from '@/lib/compliance';

export interface TeamContact {
  id: string;
  date: string;
  clientId: string;
  clientName: string;
  staffName: string;
  modality: string;
}

export interface TeamWeekData {
  loading: boolean;
  contacts: TeamContact[];
  weekStart: string;
  weekEnd: string;
  refresh: () => void;
}

export function useTeamWeek(): TeamWeekData {
  const today = todayAgency();
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<TeamContact[]>([]);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setLoading(true);
      const [{ data: rows }, { data: staff }] = await Promise.all([
        supabase
          .from('client_contacts')
          .select('id, contact_date, modality, employee_id, client_id, clients!inner(first_name, last_name)')
          .gte('contact_date', weekStart)
          .lte('contact_date', weekEnd)
          .order('contact_date', { ascending: false }),
        supabase.from('profiles').select('id, first_name, last_name, email'),
      ]);
      if (cancelled) return;

      const nameById = new Map(
        (staff ?? []).map((p) => [
          p.id as string,
          `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || (p.email as string),
        ]),
      );

      type Joined = {
        id: string;
        contact_date: string;
        modality: string;
        employee_id: string;
        client_id: string;
        clients: { first_name: string; last_name: string } | null;
      };

      setContacts(
        ((rows ?? []) as unknown as Joined[]).map((r) => ({
          id: r.id,
          date: r.contact_date,
          clientId: r.client_id,
          clientName: `${r.clients?.first_name ?? ''} ${r.clients?.last_name ?? ''}`.trim(),
          staffName: nameById.get(r.employee_id) ?? 'Unassigned',
          modality: r.modality,
        })),
      );
      setLoading(false);
    };

    void run().catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [weekStart, weekEnd, nonce]);

  return { loading, contacts, weekStart, weekEnd, refresh };
}
