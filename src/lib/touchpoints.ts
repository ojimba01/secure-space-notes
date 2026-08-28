// Auto-scheduled touchpoints derived from a client's rolling 30-day cycle.
//
// Cycles are anchored to the date services actually started — the HSP approval
// / authorization start date (see serviceStartDate) — and the client's level of
// need sets how many touchpoints each cycle needs and how many must be in
// person. Events land in calendar_events with event_type 'touch_point'.
//
// Three rules govern regeneration:
//   - Manually moved events (is_manually_adjusted) are preserved, never
//     overwritten.
//   - Never two auto-generated touchpoints for one client on one day, and never
//     a day already covered by a logged contact.
//   - Never the same auto-generated touchpoint type twice in one cycle. Staff
//     can record whatever they like; only the suggestions rotate.
//
// Nothing is scheduled before the go-live floor, so switching the app on
// mid-cycle does not backfill a queue of touchpoints nobody could have made.
import { supabase } from '@/integrations/supabase/client';
import {
  requirementsForTier,
  hasValidTier,
  currentBillingWindow,
  contactsInWindow,
  spacedInPersonDates,
  distinctDays,
  addDays,
  daysBetween,
  toDate,
  todayAgency,
  schedulingFloor,
  touchpointTypeLabel,
  AUTO_TOUCHPOINT_TYPE_ROTATION,
  MIN_SPACING_DAYS,
  Modality,
  MODALITY_LABELS,
  ContactRow,
  BillingWindow,
} from '@/lib/compliance';
import { serviceStartDate, isSetupComplete } from '@/lib/workflow';
import { goLiveDate } from '@/lib/touchpointSettings';

export interface TouchpointDate {
  date: string; // YYYY-MM-DD
  modality: Modality;
  touchpointType: string;
}

interface TouchpointClient {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  level_of_need?: string | null;
  hsp_submitted?: boolean | null;
  auth_150_number?: string | null;
  auth_180_number?: string | null;
  auth_30_start?: string | null;
  auth_150_start?: string | null;
  hsp_150_date?: string | null;
  assigned_employee_id?: string | null;
}

const CLIENT_COLUMNS =
  'id, first_name, last_name, status, level_of_need, hsp_submitted, auth_150_number, auth_180_number, auth_30_start, auth_150_start, hsp_150_date, assigned_employee_id';

// Choose N evenly-spread dates inside [from, to], avoiding `used` days and keeping
// at least MIN_SPACING_DAYS apart when the window is roomy enough.
function pickDates(from: string, to: string, count: number, used: Set<string>, seed: number): string[] {
  if (count <= 0) return [];
  const span = Math.max(0, daysBetween(from, to));
  const picked: string[] = [];
  const idealGap = count > 1 ? span / count : 0;
  const enforceSpacing = idealGap >= MIN_SPACING_DAYS;

  for (let i = 0; i < count; i++) {
    // base target evenly across the window, nudged by seed to stagger caseloads
    let target = addDays(from, Math.round(idealGap * (i + 0.5)) + (seed % 3));
    if (daysBetween(target, to) < 0) target = to;
    if (daysBetween(from, target) < 0) target = from;

    // find nearest acceptable day
    let chosen: string | null = null;
    for (let step = 0; step <= span; step++) {
      const candidates = [addDays(target, step), addDays(target, -step)];
      const ok = candidates.find((d) => {
        if (daysBetween(from, d) < 0 || daysBetween(d, to) < 0) return false;
        if (used.has(d) || picked.includes(d)) return false;
        if (enforceSpacing && picked.some((p) => Math.abs(daysBetween(p, d)) < MIN_SPACING_DAYS)) return false;
        return true;
      });
      if (ok) { chosen = ok; break; }
      // last resort: relax spacing on the final steps
      if (step === span) {
        const relaxed = candidates.find(
          (d) => daysBetween(from, d) >= 0 && daysBetween(d, to) >= 0 && !used.has(d) && !picked.includes(d),
        );
        if (relaxed) chosen = relaxed;
      }
    }
    // Every free day in the window is taken — stop rather than double-book one.
    if (!chosen) break;
    picked.push(chosen);
    used.add(chosen);
  }
  return picked.sort((a, b) => a.localeCompare(b));
}

// Suggested types for the touchpoints still to be scheduled, skipping any type
// already used in this cycle so a client is never asked the same thing twice.
function pickTypes(count: number, usedTypes: Set<string>): string[] {
  const fresh = AUTO_TOUCHPOINT_TYPE_ROTATION.filter((t) => !usedTypes.has(t));
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    // Once the rotation is exhausted, fall back to the neutral check-in rather
    // than inventing a category the contact may not be about.
    out.push(fresh[i] ?? 'general_checkin');
  }
  return out;
}

// Compute the touchpoints that still need to be auto-scheduled for the current cycle.
export function generateTouchpointDates(
  /** The service start date — NOT the HSP submission date. */
  serviceStart: string,
  tier: string | null | undefined,
  loggedContacts: ContactRow[],
  manualEvents: { date: string; modality: Modality; touchpointType?: string | null }[],
  today: string,
  seed = 0,
  /** Nothing is scheduled before this date. Defaults to today. */
  goLive: string | null = null,
  /** Types already used in this cycle, from contacts staff have logged. */
  loggedTypes: string[] = [],
): TouchpointDate[] {
  if (!hasValidTier(tier) || !serviceStart) return [];
  const window = currentBillingWindow(serviceStart, today);
  if (!window) return [];
  const req = requirementsForTier(tier);

  const winContacts = contactsInWindow(loggedContacts, window);
  const winManual = manualEvents.filter(
    (m) => daysBetween(window.start, m.date) >= 0 && daysBetween(m.date, window.end) >= 0,
  );

  // days already covered by logged contacts or preserved manual events
  const usedDays = new Set<string>([
    ...distinctDays(winContacts),
    ...winManual.map((m) => m.date),
  ]);

  const coveredCount = usedDays.size;
  const remaining = Math.max(0, req.requiredContacts - coveredCount);

  const inPersonCovered =
    spacedInPersonDates(winContacts).length + winManual.filter((m) => m.modality === 'in_person').length;
  let inPersonRemaining = Math.max(0, req.requiredInPerson - inPersonCovered);

  if (remaining <= 0) return [];

  // Schedule across the remainder of the cycle: never in the past, and never
  // before the agency went live.
  const floor = schedulingFloor(today, goLive);
  const from = daysBetween(window.start, floor) > 0 ? floor : window.start;
  const to = window.end;
  if (daysBetween(from, to) < 0) return []; // cycle already closed
  const dates = pickDates(from, to, remaining, new Set(usedDays), seed);

  const usedTypes = new Set<string>([
    ...loggedTypes.filter(Boolean),
    ...winManual.map((m) => m.touchpointType).filter((t): t is string => !!t),
  ]);
  const types = pickTypes(dates.length, usedTypes);

  return dates.map((d, i) => {
    let modality: Modality = 'phone';
    if (inPersonRemaining > 0) {
      modality = 'in_person';
      inPersonRemaining--;
    }
    return { date: d, modality, touchpointType: types[i] };
  });
}

async function loadContext(client: TouchpointClient) {
  const today = todayAgency();
  const window = currentBillingWindow(serviceStartDate(client), today);
  const { data: cts } = await supabase
    .from('client_contacts')
    .select('id, contact_date, modality, touchpoint_type')
    .eq('client_id', client.id);
  const contacts = (cts ?? []) as (ContactRow & { touchpoint_type: string | null })[];

  const { data: evs } = await supabase
    .from('calendar_events')
    .select('id, start_time, event_type, is_auto_generated, is_manually_adjusted, modality, touchpoint_type')
    .eq('client_id', client.id)
    .eq('event_type', 'touch_point');
  return { today, window, contacts, events: evs ?? [] };
}

// Regenerate a single client's touchpoint schedule for the current 30-day cycle,
// preserving any staff-adjusted events.
async function insertTouchpoints(
  client: TouchpointClient,
  seed: number,
  window: BillingWindow,
  contacts: (ContactRow & { touchpoint_type?: string | null })[],
  events: any[],
  goLive: string,
): Promise<void> {
  const today = todayAgency();

  const inWindow = (iso: string) => {
    const d = iso.slice(0, 10);
    return daysBetween(window.start, d) >= 0 && daysBetween(d, window.end) >= 0;
  };

  // Delete only auto-generated, NON-manual, NOT-yet-completed events in this cycle.
  const contactDays = new Set(contacts.map((c) => c.contact_date));
  const toDelete = events
    .filter((e) => e.is_auto_generated && !e.is_manually_adjusted && inWindow(e.start_time))
    .filter((e) => !contactDays.has(e.start_time.slice(0, 10)))
    .map((e) => e.id);
  if (toDelete.length) {
    await supabase.from('calendar_events').delete().in('id', toDelete);
  }

  if (client.status !== 'active') return;
  // Setup-complete clients only. An incomplete client is Admin work, and
  // scheduling one would put a client in a staff queue that cannot show it.
  if (!isSetupComplete(client)) return;
  if (!client.assigned_employee_id) return;

  // Preserved manual events feed into the coverage calculation.
  const manualEvents = events
    .filter((e) => e.is_manually_adjusted && inWindow(e.start_time))
    .map((e) => ({
      date: e.start_time.slice(0, 10),
      modality: (e.modality as Modality) ?? 'phone',
      touchpointType: (e.touchpoint_type as string | null) ?? null,
    }));

  const loggedTypes = contactsInWindow(contacts, window)
    .map((c) => (c as { touchpoint_type?: string | null }).touchpoint_type)
    .filter((t): t is string => !!t);

  const dates = generateTouchpointDates(
    serviceStartDate(client)!,
    client.level_of_need,
    contacts,
    manualEvents,
    today,
    seed,
    goLive,
    loggedTypes,
  );
  if (dates.length === 0) return;

  const rows = dates.map((d) => {
    const iso = toDate(d.date).toISOString();
    const label = d.modality === 'in_person' ? 'In person' : 'Phone, text, email, or video';
    return {
      title: `Touchpoint — ${client.first_name} ${client.last_name}`,
      description: `${touchpointTypeLabel(d.touchpointType)} · suggested contact method: ${label}. Auto-scheduled for the current 30-day cycle.`,
      event_type: 'touch_point',
      is_auto_generated: true,
      is_manually_adjusted: false,
      status: 'scheduled',
      modality: d.modality,
      touchpoint_type: d.touchpointType,
      client_id: client.id,
      employee_id: client.assigned_employee_id,
      start_time: iso,
      end_time: iso,
    };
  });

  await supabase.from('calendar_events').insert(rows);
}

export async function regenerateTouchpointsForClient(clientId: string): Promise<void> {
  const { data: client } = await supabase
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return;
  const goLive = await goLiveDate();
  const ctx = await loadContext(client as TouchpointClient);
  if (!ctx.window) return;
  await insertTouchpoints(client as TouchpointClient, 0, ctx.window, ctx.contacts, ctx.events, goLive);
}

export async function regenerateTouchpointsForStaff(employeeId: string | null | undefined): Promise<void> {
  if (!employeeId) return;
  const { data: clients } = await supabase
    .from('clients')
    .select(CLIENT_COLUMNS)
    .eq('assigned_employee_id', employeeId)
    .eq('status', 'active')
    // Stable order so the per-client seed — and therefore the dates picked —
    // does not shuffle between page loads.
    .order('id');

  const list = (clients as TouchpointClient[] | null) ?? [];
  const goLive = await goLiveDate();
  let seed = 0;
  for (const c of list) {
    const ctx = await loadContext(c);
    if (!ctx.window) continue;
    await insertTouchpoints(c, seed, ctx.window, ctx.contacts, ctx.events, goLive);
    seed += 1;
  }
}

export { MODALITY_LABELS };
