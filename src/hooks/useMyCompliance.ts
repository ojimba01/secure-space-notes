// The staff touchpoint work queue.
//
// Two rules shape everything here:
//   1. Staff only see setup-complete clients. A client missing an HSP
//      submission, an approval start date, or a level of need is Admin work and
//      never appears in a staff queue.
//   2. Work starts today. Cycles that began before the go-live date are shown
//      for reference but never made overdue, so switching the app on does not
//      hand anyone a backlog they never had a chance to make.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { serviceStartDate, isSetupComplete } from '@/lib/workflow';
import { useMyProfileId } from '@/hooks/useMyProfileId';
import { regenerateTouchpointsForStaff } from '@/lib/touchpoints';
import { loadTouchpointSettings } from '@/lib/touchpointSettings';
import {
  ContactRow, Modality, requirementsForTier,
  todayAgency, startOfWeek, endOfWeek, daysBetween,
  currentBillingWindow, contactsInWindow, windowProgress, overdueReasons,
  cycleStatus, isPreGoLiveCycle, CycleStatus,
} from '@/lib/compliance';

export type TpStatus = 'scheduled' | 'completed' | 'missed' | 'moved' | 'overdue';

export interface ScheduledTouchpoint {
  id: string;
  client_id: string;
  client_name: string;
  level_of_need: string | null;
  date: string;
  modality: Modality;
  touchpoint_type: string | null;
  status: TpStatus;
  is_manually_adjusted: boolean;
}

/** One client's current 30-day cycle. */
export interface CycleRow {
  client_id: string;
  client_name: string;
  level_of_need: string | null;
  windowStart: string;
  windowEnd: string;
  contactDays: number;
  requiredContacts: number;
  inPersonDays: number;
  requiredInPerson: number;
  remaining: number;
  remainingInPerson: number;
  status: CycleStatus;
  reasons: string[];
  /** The cycle began before go-live, so it is reference-only. */
  isPreGoLive: boolean;
  /** The next touchpoint already on the calendar for this cycle, if any. */
  nextScheduled: ScheduledTouchpoint | null;
}

/**
 * A follow-up a supervisor would chase. Derived from cycle progress rather than
 * stored, so completing the touchpoint clears the reminder on the next load.
 * When a touchpoint is already scheduled the reminder points at it instead of
 * creating a second thing to do.
 */
export interface SupervisorReminder {
  id: string;
  client_id: string;
  client_name: string;
  message: string;
  dueDate: string;
  status: CycleStatus;
  touchpoint: ScheduledTouchpoint | null;
}

export interface MyComplianceData {
  loading: boolean;
  caseload: number;
  goLiveDate: string;
  reminders: SupervisorReminder[];
  /** Reminders satisfied today — shown as done so the queue confirms the save. */
  clearedReminders: SupervisorReminder[];
  upcomingThisWeek: ScheduledTouchpoint[];
  cycles: CycleRow[];
  completedThisWeek: number;
  remainingThisWeek: ScheduledTouchpoint[];
  overdueCount: number;
  refresh: () => void;
}

export function useMyCompliance(overrideProfileId?: string | null): MyComplianceData {
  const myProfileId = useMyProfileId();
  const profileId = overrideProfileId !== undefined ? overrideProfileId : myProfileId;
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<Omit<MyComplianceData, 'loading' | 'refresh'>>({
    caseload: 0,
    goLiveDate: todayAgency(),
    reminders: [],
    clearedReminders: [],
    upcomingThisWeek: [],
    cycles: [],
    completedThisWeek: 0,
    remainingThisWeek: [],
    overdueCount: 0,
  });

  const today = todayAgency();
  const wkStart = startOfWeek(today);
  const wkEnd = endOfWeek(today);

  const load = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);

    const settings = await loadTouchpointSettings();
    const goLive = settings.goLiveDate;

    // Regenerate the schedule (preserving manual moves) before reading, so a
    // cycle that needs a touchpoint always has one on the calendar before its
    // due date. Only for the real signed-in user — never write from view-as.
    if (profileId === myProfileId) {
      await regenerateTouchpointsForStaff(profileId).catch(() => {});
    }

    const { data: cls } = await supabase
      .from('clients')
      .select('id, first_name, last_name, level_of_need, hsp_submitted, auth_30_start, auth_150_start, hsp_150_date, status')
      .eq('assigned_employee_id', profileId)
      .eq('status', 'active');

    // Setup-complete only. Missing information belongs to Admin and Superadmin.
    const list = (cls ?? []).filter((c) => isSetupComplete(c));
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
        .select('id, client_id, start_time, modality, touchpoint_type, status, is_manually_adjusted')
        .eq('event_type', 'touch_point')
        .in('client_id', ids);
      events = evs ?? [];
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
        touchpoint_type: (e.touchpoint_type as string | null) ?? null,
        status,
        is_manually_adjusted: !!e.is_manually_adjusted,
      };
    };

    const allTps = events.map(toTp).sort((a, b) => a.date.localeCompare(b.date));
    const tpsByClient: Record<string, ScheduledTouchpoint[]> = {};
    allTps.forEach((t) => (tpsByClient[t.client_id] ||= []).push(t));

    const cycles: CycleRow[] = [];
    const reminders: SupervisorReminder[] = [];
    const clearedReminders: SupervisorReminder[] = [];

    for (const c of list) {
      const name = `${c.first_name} ${c.last_name}`;
      const window = currentBillingWindow(serviceStartDate(c), today);
      if (!window) continue;
      const req = requirementsForTier(c.level_of_need);
      const winContacts = contactsInWindow(contactsByClient[c.id] ?? [], window);
      const prog = windowProgress(req, winContacts);
      const preGoLive = isPreGoLiveCycle(window, goLive);
      const status = cycleStatus(req, window, winContacts, today, goLive);
      const reasons = preGoLive ? [] : overdueReasons(req, window, winContacts, today);

      const nextScheduled =
        (tpsByClient[c.id] ?? [])
          .filter((t) => t.status !== 'completed'
            && daysBetween(window.start, t.date) >= 0
            && daysBetween(t.date, window.end) >= 0)
          .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

      cycles.push({
        client_id: c.id,
        client_name: name,
        level_of_need: c.level_of_need,
        windowStart: window.start,
        windowEnd: window.end,
        contactDays: prog.contactDays,
        requiredContacts: req.requiredContacts,
        inPersonDays: prog.inPersonSpaced,
        requiredInPerson: req.requiredInPerson,
        remaining: prog.remaining,
        remainingInPerson: prog.remainingInPerson,
        status,
        reasons,
        isPreGoLive: preGoLive,
        nextScheduled,
      });

      // Reminders track the two things a supervisor actually chases.
      const reminder = (message: string): SupervisorReminder => ({
        id: `${c.id}-${window.start}`,
        client_id: c.id,
        client_name: name,
        message,
        dueDate: window.end,
        status,
        touchpoint: nextScheduled,
      });

      if (status === 'overdue' || status === 'due_soon') {
        const bits: string[] = [];
        if (prog.remaining > 0) {
          bits.push(`${prog.remaining} touchpoint${prog.remaining === 1 ? '' : 's'} still needed`);
        }
        if (prog.remainingInPerson > 0) {
          bits.push(`${prog.remainingInPerson} must be in person`);
        }
        if (bits.length) reminders.push(reminder(bits.join(', ')));
      } else if (status === 'completed' && winContacts.some((ct) => ct.contact_date === today)) {
        // Satisfied by something logged today — confirm it rather than
        // silently dropping the reminder staff were just looking at.
        clearedReminders.push(reminder('Cycle requirement met'));
      }
    }

    cycles.sort((a, b) => {
      const rank: Record<CycleStatus, number> = { overdue: 0, due_soon: 1, incomplete: 2, completed: 3 };
      return rank[a.status] - rank[b.status] || a.windowEnd.localeCompare(b.windowEnd);
    });
    reminders.sort((a, b) => (a.status === b.status ? a.dueDate.localeCompare(b.dueDate) : a.status === 'overdue' ? -1 : 1));

    const inThisWeek = (d: string) => daysBetween(wkStart, d) >= 0 && daysBetween(d, wkEnd) >= 0;
    const scheduledThisWeek = allTps.filter((t) => inThisWeek(t.date));
    const remainingThisWeek = scheduledThisWeek.filter((t) => t.status !== 'completed');

    let completedThisWeek = 0;
    Object.values(contactsByClient).forEach((cs) => {
      completedThisWeek += cs.filter((ct) => inThisWeek(ct.contact_date)).length;
    });

    setState({
      caseload: list.length,
      goLiveDate: goLive,
      reminders,
      clearedReminders,
      upcomingThisWeek: scheduledThisWeek,
      cycles,
      completedThisWeek,
      remainingThisWeek,
      overdueCount: cycles.filter((c) => c.status === 'overdue').length,
    });
    setLoading(false);
  }, [profileId, myProfileId, today, wkStart, wkEnd]);

  useEffect(() => { load(); }, [load]);

  return { loading, refresh: load, ...state };
}
