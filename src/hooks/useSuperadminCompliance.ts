import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { serviceStartDate, isSetupComplete, missingSetupParts } from '@/lib/workflow';
import { loadTouchpointSettings } from '@/lib/touchpointSettings';
import {
  ContactRow, requirementsForTier,
  todayAgency, startOfWeek, endOfWeek, daysBetween,
  currentBillingWindow, contactsInWindow, windowProgress, overdueReasons,
  isPreGoLiveCycle,
} from '@/lib/compliance';

export interface StaffOverdueRow {
  id: string;
  client_name: string;
  staff_name: string;
  staff_id: string;
  level_of_need: string | null;
  windowStart: string;
  windowEnd: string;
  contactDays: number;
  requiredContacts: number;
  inPersonDays: number;
  requiredInPerson: number;
  reasons: string[];
}

export interface StaffMissingRow {
  id: string;
  client_name: string;
  staff_name: string;
  staff_id: string;
  /** Plain-English list of what setup is still missing. */
  missing: string[];
}

export interface SuperadminComplianceData {
  loading: boolean;
  goLiveDate: string;
  /** Admin opt-in: cycles that closed before go-live are listed too. */
  showHistorical: boolean;
  /** Overdue cycles suppressed by the go-live floor. */
  preGoLiveCount: number;
  overdueRows: StaffOverdueRow[];
  missingRows: StaffMissingRow[];
  scheduledThisWeek: number;
  completedThisWeek: number;
  remainingThisWeek: number;
  refresh: () => void;
}

export function useSuperadminCompliance(): SuperadminComplianceData {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<Omit<SuperadminComplianceData, 'loading' | 'refresh'>>({
    goLiveDate: todayAgency(),
    showHistorical: false,
    preGoLiveCount: 0,
    overdueRows: [],
    missingRows: [],
    scheduledThisWeek: 0,
    completedThisWeek: 0,
    remainingThisWeek: 0,
  });

  const today = todayAgency();
  const wkStart = startOfWeek(today);
  const wkEnd = endOfWeek(today);

  const load = useCallback(async () => {
    setLoading(true);
    const settings = await loadTouchpointSettings();
    const goLive = settings.goLiveDate;

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email');
    const staffById: Record<string, string> = {};
    (profiles ?? []).forEach((p: any) => {
      staffById[p.id] = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email;
    });

    const { data: cls } = await supabase
      .from('clients')
      .select('id, first_name, last_name, level_of_need, hsp_submitted, auth_150_number, auth_180_number, auth_30_start, auth_150_start, hsp_150_date, status, assigned_employee_id')
      .eq('status', 'active')
      .not('assigned_employee_id', 'is', null);
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
        .select('id, client_id, start_time')
        .eq('event_type', 'touch_point')
        .in('client_id', ids);
      events = evs ?? [];
    }

    const overdueRows: StaffOverdueRow[] = [];
    const missingRows: StaffMissingRow[] = [];
    let preGoLiveCount = 0;

    for (const c of list) {
      const name = `${c.first_name} ${c.last_name}`;
      const staffName = c.assigned_employee_id ? (staffById[c.assigned_employee_id] ?? 'Unassigned') : 'Unassigned';
      if (!isSetupComplete(c)) {
        missingRows.push({
          id: c.id, client_name: name, staff_name: staffName, staff_id: c.assigned_employee_id ?? '',
          missing: missingSetupParts(c),
        });
        continue;
      }
      const window = currentBillingWindow(serviceStartDate(c), today);
      if (!window) continue;
      const req = requirementsForTier(c.level_of_need);
      const winContacts = contactsInWindow(contactsByClient[c.id] ?? [], window);
      const reasons = overdueReasons(req, window, winContacts, today);
      // Cycles that began before go-live are reference-only. They are counted
      // so the number is visible, but they never drive follow-up unless an
      // admin deliberately asks to see historical items.
      if (reasons.length && isPreGoLiveCycle(window, goLive)) {
        preGoLiveCount += 1;
        if (!settings.showHistorical) continue;
      }
      if (reasons.length) {
        const prog = windowProgress(req, winContacts);
        overdueRows.push({
          id: c.id,
          client_name: name,
          staff_name: staffName,
          staff_id: c.assigned_employee_id ?? '',
          level_of_need: c.level_of_need,
          windowStart: window.start,
          windowEnd: window.end,
          contactDays: prog.contactDays,
          requiredContacts: req.requiredContacts,
          inPersonDays: prog.inPersonSpaced,
          requiredInPerson: req.requiredInPerson,
          reasons,
        });
      }
    }

    // Sort overdue rows grouped by staff member.
    overdueRows.sort((a, b) => a.staff_name.localeCompare(b.staff_name) || a.client_name.localeCompare(b.client_name));
    missingRows.sort((a, b) => a.staff_name.localeCompare(b.staff_name) || a.client_name.localeCompare(b.client_name));

    const inThisWeek = (d: string) => daysBetween(wkStart, d) >= 0 && daysBetween(d, wkEnd) >= 0;

    let scheduledThisWeek = 0;
    let completedThisWeek = 0;
    let remainingThisWeek = 0;
    events.forEach((e: any) => {
      const date = e.start_time.slice(0, 10);
      if (!inThisWeek(date)) return;
      scheduledThisWeek += 1;
      const contacts = contactsByClient[e.client_id] ?? [];
      if (contacts.some((ct) => ct.contact_date === date)) completedThisWeek += 1;
      else remainingThisWeek += 1;
    });

    setState({
      goLiveDate: goLive,
      showHistorical: settings.showHistorical,
      preGoLiveCount,
      overdueRows, missingRows, scheduledThisWeek, completedThisWeek, remainingThisWeek,
    });
    setLoading(false);
  }, [today, wkStart, wkEnd]);

  useEffect(() => { load(); }, [load]);

  return { loading, refresh: load, ...state };
}
