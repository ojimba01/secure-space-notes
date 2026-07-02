import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMyProfileId } from '@/hooks/useMyProfileId';
import { regenerateTouchpointsForStaff } from '@/lib/touchpoints';
import {
  ContactRow, Modality, requirementsForTier, hasValidTier,
  todayAgency, startOfWeek, endOfWeek, daysBetween,
  currentBillingWindow, contactsInWindow, windowProgress, overdueReasons,
} from '@/lib/compliance';

export type TpStatus = 'scheduled' | 'completed' | 'missed' | 'moved' | 'overdue';

export interface ScheduledTouchpoint {
  id: string;
  client_id: string;
  client_name: string;
  level_of_need: string | null;
  date: string;
  modality: Modality;
  status: TpStatus;
  is_manually_adjusted: boolean;
}

export interface MissingSetupClient {
  id: string;
  client_name: string;
  missingDate: boolean;
  missingLevelOfNeed: boolean;
}

export interface OverdueClient {
  id: string;
  client_name: string;
  level_of_need: string | null;
  windowStart: string;
  windowEnd: string;
  contactDays: number;
  requiredContacts: number;
  reasons: string[];
}

export interface MyComplianceData {
  loading: boolean;
  caseload: number;
  scheduledThisWeek: ScheduledTouchpoint[];
  completedThisWeek: number;
  remainingThisWeek: ScheduledTouchpoint[];
  missingSetupClients: MissingSetupClient[];
  overdueClients: OverdueClient[];
  upcoming: ScheduledTouchpoint[];
  unscheduledInPerson: number;
  behindCount: number;
  refresh: () => void;
}

export function useMyCompliance(overrideProfileId?: string | null): MyComplianceData {
  const myProfileId = useMyProfileId();
  const profileId = overrideProfileId !== undefined ? overrideProfileId : myProfileId;
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<Omit<MyComplianceData, 'loading' | 'refresh'>>({
    caseload: 0,
    scheduledThisWeek: [],
    completedThisWeek: 0,
    remainingThisWeek: [],
    missingSetupClients: [],
    overdueClients: [],
    upcoming: [],
    unscheduledInPerson: 0,
    behindCount: 0,
  });

  const today = todayAgency();
  const wkStart = startOfWeek(today);
  const wkEnd = endOfWeek(today);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);

    // regenerate schedule (preserves manual edits) before reading.
    // Only for the real signed-in user — never write from the view-as sandbox.
    if (profileId === myProfileId) {
      await regenerateTouchpointsForStaff(profileId).catch(() => {});
    }

    const { data: cls } = await supabase
      .from('clients')
      .select('id, first_name, last_name, level_of_need, hsp_150_date, status')
      .eq('assigned_employee_id', profileId)
      .eq('status', 'active');
    const list = cls ?? [];
    const ids = list.map((c) => c.id);

    const contactsByClient: Record<string, ContactRow[]> = {};
    let events: any[] = [];
    if (ids.length) {
      const { data: cts } = await supabase
        .from('client_contacts')
        .select('id, client_id, contact_date, modality')
        .in('client_id', ids);
      (cts ?? []).forEach((c: any) => {
        (contactsByClient[c.client_id] ||= []).push({ id: c.id, contact_date: c.contact_date, modality: c.modality });
      });
      const { data: evs } = await supabase
        .from('calendar_events')
        .select('id, client_id, start_time, modality, status, is_manually_adjusted')
        .eq('event_type', 'touch_point')
        .in('client_id', ids);
      events = evs ?? [];
    }

    const missingSetupClients: MissingSetupClient[] = [];
    const overdueClients: OverdueClient[] = [];
    let caseload = 0;

    for (const c of list) {
      const name = `${c.first_name} ${c.last_name}`;
      const missingDate = !c.hsp_150_date;
      const missingLon = !hasValidTier(c.level_of_need);
      if (missingDate || missingLon) {
        missingSetupClients.push({ id: c.id, client_name: name, missingDate, missingLevelOfNeed: missingLon });
        continue;
      }
      caseload += 1;
      const window = currentBillingWindow(c.hsp_150_date, today);
      if (!window) continue;
      const req = requirementsForTier(c.level_of_need);
      const winContacts = contactsInWindow(contactsByClient[c.id] ?? [], window);
      const reasons = overdueReasons(req, window, winContacts, today);
      if (reasons.length) {
        const prog = windowProgress(req, winContacts);
        overdueClients.push({
          id: c.id,
          client_name: name,
          level_of_need: c.level_of_need,
          windowStart: window.start,
          windowEnd: window.end,
          contactDays: prog.contactDays,
          requiredContacts: req.requiredContacts,
          reasons,
        });
      }
    }

    const clientById: Record<string, any> = {};
    list.forEach((c) => (clientById[c.id] = c));

    const toTp = (e: any): ScheduledTouchpoint => {
      const c = clientById[e.client_id];
      const date = e.start_time.slice(0, 10);
      const contacts = contactsByClient[e.client_id] ?? [];
      const completed = contacts.some((ct) => ct.contact_date === date);
      let status: TpStatus = 'scheduled';
      if (completed) status = 'completed';
      else if (daysBetween(date, today) > 0) status = 'overdue';
      else if (e.is_manually_adjusted) status = 'moved';
      return {
        id: e.id,
        client_id: e.client_id,
        client_name: c ? `${c.first_name} ${c.last_name}` : 'Client',
        level_of_need: c?.level_of_need ?? null,
        date,
        modality: (e.modality as Modality) ?? 'phone',
        status,
        is_manually_adjusted: !!e.is_manually_adjusted,
      };
    };

    const inThisWeek = (d: string) => daysBetween(wkStart, d) >= 0 && daysBetween(d, wkEnd) >= 0;
    const inNext30 = (d: string) => daysBetween(today, d) >= 0 && daysBetween(d, today) >= -30 && daysBetween(today, d) <= 30;

    const allTps = events.map(toTp).sort((a, b) => a.date.localeCompare(b.date));
    const scheduledThisWeek = allTps.filter((t) => inThisWeek(t.date));
    const remainingThisWeek = scheduledThisWeek.filter((t) => t.status !== 'completed');
    const upcoming = allTps.filter((t) => daysBetween(today, t.date) >= 0 && daysBetween(today, t.date) <= 30);

    // completed this week: distinct client contacts logged in this week window
    let completedThisWeek = 0;
    Object.values(contactsByClient).forEach((cs) => {
      completedThisWeek += cs.filter((ct) => inThisWeek(ct.contact_date)).length;
    });

    const unscheduledInPerson = remainingThisWeek.filter((t) => t.modality === 'in_person' && t.status !== 'completed').length;

    setState({
      caseload,
      scheduledThisWeek,
      completedThisWeek,
      remainingThisWeek,
      missingSetupClients,
      overdueClients,
      upcoming,
      unscheduledInPerson,
      behindCount: overdueClients.length,
    });
    setLoading(false);
  }, [profileId, today, wkStart, wkEnd]);

  useEffect(() => { load(); }, [load]);

  return { loading, refresh: load, ...state };
}
