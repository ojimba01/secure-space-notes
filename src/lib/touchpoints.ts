// Auto-scheduled touchpoints derived from a client's rolling 30-day billing window.
// Anchored to the date services actually started (the initial 30-day
// authorization, falling back to the 150-day authorization — see serviceStartDate)
// and the client's level of need. Events land in calendar_events with
// event_type 'touch_point'. Manually moved events (is_manually_adjusted = true) are
// preserved and never overwritten by regeneration.
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
  MIN_SPACING_DAYS,
  Modality,
  MODALITY_LABELS,
  ContactRow,
  BillingWindow,
} from '@/lib/compliance';
import { serviceStartDate } from '@/lib/workflow';

export interface TouchpointDate {
  date: string; // YYYY-MM-DD
  modality: Modality;
}

interface TouchpointClient {
  id: string;
  first_name: string;
  last_name: string;
  status: string;
  level_of_need?: string | null;
  auth_30_start?: string | null;
  auth_150_start?: string | null;
  hsp_150_date?: string | null;
  assigned_employee_id?: string | null;
}

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
    let chosen = target;
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
    picked.push(chosen);
    used.add(chosen);
  }
  return picked.sort((a, b) => a.localeCompare(b));
}

// Compute the touchpoints that still need to be auto-scheduled for the current window.
export function generateTouchpointDates(
  hsp150: string,
  tier: string | null | undefined,
  loggedContacts: ContactRow[],
  manualEvents: { date: string; modality: Modality }[],
  today: string,
  seed = 0,
): TouchpointDate[] {
  if (!hasValidTier(tier) || !hsp150) return [];
  const window = currentBillingWindow(hsp150, today);
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

  // schedule across the remainder of the window (never in the past)
  const from = daysBetween(window.start, today) > 0 ? today : window.start;
  const to = window.end;
  const dates = pickDates(from, to, remaining, new Set(usedDays), seed);

  return dates.map((d) => {
    let modality: Modality = 'phone';
    if (inPersonRemaining > 0) {
      modality = 'in_person';
      inPersonRemaining--;
    }
    return { date: d, modality };
  });
}

async function loadContext(client: TouchpointClient) {
  const today = todayAgency();
  const window = currentBillingWindow(serviceStartDate(client), today);
  const { data: cts } = await supabase
    .from('client_contacts')
    .select('id, contact_date, modality')
    .eq('client_id', client.id);
  const contacts = (cts as ContactRow[]) ?? [];

  const { data: evs } = await supabase
    .from('calendar_events')
    .select('id, start_time, event_type, is_auto_generated, is_manually_adjusted, modality')
    .eq('client_id', client.id)
    .eq('event_type', 'touch_point');
  return { today, window, contacts, events: evs ?? [] };
}

// Regenerate a single client's touchpoint schedule for the current 30-day window,
// preserving any staff-adjusted events.
async function insertTouchpoints(client: TouchpointClient, seed: number, window: BillingWindow, contacts: ContactRow[], events: any[]): Promise<void> {
  const today = todayAgency();

  const inWindow = (iso: string) => {
    const d = iso.slice(0, 10);
    return daysBetween(window.start, d) >= 0 && daysBetween(d, window.end) >= 0;
  };

  // Delete only auto-generated, NON-manual, NOT-yet-completed events in this window.
  const contactDays = new Set(contacts.map((c) => c.contact_date));
  const toDelete = events
    .filter((e) => e.is_auto_generated && !e.is_manually_adjusted && inWindow(e.start_time))
    .filter((e) => !contactDays.has(e.start_time.slice(0, 10)))
    .map((e) => e.id);
  if (toDelete.length) {
    await supabase.from('calendar_events').delete().in('id', toDelete);
  }

  if (client.status !== 'active') return;
  if (!serviceStartDate(client) || !hasValidTier(client.level_of_need)) return;
  if (!client.assigned_employee_id) return;

  // Preserved manual events feed into the coverage calculation.
  const manualEvents = events
    .filter((e) => e.is_manually_adjusted && inWindow(e.start_time))
    .map((e) => ({ date: e.start_time.slice(0, 10), modality: (e.modality as Modality) ?? 'phone' }));

  const dates = generateTouchpointDates(
    serviceStartDate(client)!,
    client.level_of_need,
    contacts,
    manualEvents,
    today,
    seed,
  );
  if (dates.length === 0) return;

  const rows = dates.map((d) => {
    const iso = toDate(d.date).toISOString();
    const label = d.modality === 'in_person' ? 'Face-to-face / in-person' : 'Phone, text, email, or virtual';
    return {
      title: `Touchpoint — ${client.first_name} ${client.last_name}`,
      description: `Suggested modality: ${label}. Auto-scheduled for the current 30-day billing window.`,
      event_type: 'touch_point',
      is_auto_generated: true,
      is_manually_adjusted: false,
      status: 'scheduled',
      modality: d.modality,
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
    .select('id, first_name, last_name, status, level_of_need, auth_30_start, auth_150_start, hsp_150_date, assigned_employee_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return;
  const ctx = await loadContext(client as TouchpointClient);
  if (!ctx.window) return;
  await insertTouchpoints(client as TouchpointClient, 0, ctx.window, ctx.contacts, ctx.events);
}

export async function regenerateTouchpointsForStaff(employeeId: string | null | undefined): Promise<void> {
  if (!employeeId) return;
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name, status, level_of_need, auth_30_start, auth_150_start, hsp_150_date, assigned_employee_id')
    .eq('assigned_employee_id', employeeId)
    .eq('status', 'active');

  const list = (clients as TouchpointClient[] | null) ?? [];
  let seed = 0;
  for (const c of list) {
    const ctx = await loadContext(c);
    if (!ctx.window) continue;
    await insertTouchpoints(c, seed, ctx.window, ctx.contacts, ctx.events);
    seed += 1;
  }
}

export { MODALITY_LABELS };
