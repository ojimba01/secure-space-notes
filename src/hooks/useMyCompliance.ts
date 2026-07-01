import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMyProfileId } from '@/hooks/useMyProfileId';
import {
  ContactRow, requirementsForTier, computeProgress, deriveStatus,
  firstOfMonth, todayAgency, weeklyTarget, startOfWeek, endOfWeek,
  daysBetween, ENFORCEMENT_START, ComplianceStatus,
} from '@/lib/compliance';

export interface ClientCompliance {
  id: string;
  first_name: string;
  last_name: string;
  level_of_need?: string | null;
  created_at?: string | null;
  status: ComplianceStatus;
  contactDays: number;
  requiredContacts: number;
  inPersonSpaced: number;
  requiredInPerson: number;
  dueThisWeek: boolean;
}

export interface MyComplianceData {
  loading: boolean;
  caseload: number;
  weeklyTarget: number;
  touchpointsDueThisWeek: number;
  onTrackCount: number;
  behindCount: number;
  clients: ClientCompliance[];
  dueClients: ClientCompliance[];
  behindClients: ClientCompliance[];
  refresh: () => void;
}

export function useMyCompliance(overrideProfileId?: string | null): MyComplianceData {
  const myProfileId = useMyProfileId();
  const profileId = overrideProfileId !== undefined ? overrideProfileId : myProfileId;
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientCompliance[]>([]);

  const today = todayAgency();
  const month = firstOfMonth(today);
  const wkStart = startOfWeek(today);
  const wkEnd = endOfWeek(today);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);

    const { data: cls } = await supabase
      .from('clients')
      .select('id, first_name, last_name, level_of_need, created_at, status, assigned_employee_id')
      .eq('assigned_employee_id', profileId)
      .eq('status', 'active');

    const list = cls ?? [];
    const ids = list.map((c) => c.id);

    let contactsByClient: Record<string, ContactRow[]> = {};
    let complianceByClient: Record<string, { activities: string[]; note: string | null; plan: any[] }> = {};
    if (ids.length) {
      const { data: cts } = await supabase
        .from('client_contacts')
        .select('id, client_id, contact_date, modality')
        .in('client_id', ids)
        .gte('contact_date', month);
      (cts ?? []).forEach((c: any) => {
        (contactsByClient[c.client_id] ||= []).push({ id: c.id, contact_date: c.contact_date, modality: c.modality });
      });
      const { data: comp } = await supabase
        .from('client_month_compliance')
        .select('client_id, activities_done, summary_note, plan_dates')
        .in('client_id', ids)
        .eq('month', month);
      (comp ?? []).forEach((r: any) => {
        complianceByClient[r.client_id] = {
          activities: Array.isArray(r.activities_done) ? r.activities_done : [],
          note: r.summary_note,
          plan: Array.isArray(r.plan_dates) ? r.plan_dates : [],
        };
      });
    }

    const computed: ClientCompliance[] = list.map((c) => {
      const tier = c.level_of_need === 'High Level' ? 'High Level' : 'Low Level';
      const req = requirementsForTier(tier);
      const contacts = contactsByClient[c.id] ?? [];
      const comp = complianceByClient[c.id];
      const activities = comp?.activities ?? [];
      const note = comp?.note ?? null;
      const prog = computeProgress(req, contacts, activities, note);
      const isNewFirstWeek =
        !!c.created_at &&
        daysBetween(ENFORCEMENT_START, c.created_at.slice(0, 10)) >= 0 &&
        daysBetween(c.created_at.slice(0, 10), today) >= 0 &&
        daysBetween(c.created_at.slice(0, 10), today) < 7;
      const status = deriveStatus(req, contacts, activities, note, today, isNewFirstWeek);

      // due this week: a planned date within this week, or incomplete + behind/feasible but no contact this week
      const plan = comp?.plan ?? [];
      const plannedThisWeek = plan.some(
        (p: any) => p.date && daysBetween(wkStart, p.date) >= 0 && daysBetween(p.date, wkEnd) >= 0,
      );
      const contactThisWeek = contacts.some(
        (ct) => daysBetween(wkStart, ct.contact_date) >= 0 && daysBetween(ct.contact_date, wkEnd) >= 0,
      );
      const dueThisWeek = !prog.isComplete && (plannedThisWeek || !contactThisWeek);

      return {
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        level_of_need: c.level_of_need,
        created_at: c.created_at,
        status,
        contactDays: prog.contactDays,
        requiredContacts: req.requiredContacts,
        inPersonSpaced: prog.inPersonSpaced,
        requiredInPerson: req.requiredInPerson,
        dueThisWeek,
      };
    });

    setClients(computed);
    setLoading(false);
  }, [profileId, month, today, wkStart, wkEnd]);

  useEffect(() => { load(); }, [load]);

  const caseload = clients.length;
  const behindClients = clients.filter((c) => c.status === 'behind' || c.status === 'incomplete_escalated');
  const dueClients = clients.filter((c) => c.dueThisWeek);
  const onTrackCount = clients.filter((c) => c.status === 'on_track' || c.status === 'complete').length;

  return {
    loading,
    caseload,
    weeklyTarget: weeklyTarget(caseload),
    touchpointsDueThisWeek: dueClients.length,
    onTrackCount,
    behindCount: behindClients.length,
    clients,
    dueClients,
    behindClients,
    refresh: load,
  };
}
