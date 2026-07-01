// Auto-generated monthly touch-point events derived from a client's HSP 150-Day date.
// These land in calendar_events with event_type 'touch_point' and is_auto_generated = true,
// so they render on the case manager's calendar and can be safely regenerated without
// touching manually-added events.
import { supabase } from '@/integrations/supabase/client';
import {
  requirementsForTier,
  addDays,
  daysBetween,
  toDate,
  Modality,
  MODALITY_LABELS,
} from '@/lib/compliance';

const WINDOW_DAYS = 150;

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
  hsp_150_date?: string | null;
  assigned_employee_id?: string | null;
}

// Generate a weekly touch-point every 7 days across the full 150-day window.
// `seed` offsets a client's day-of-week slightly so multiple clients don't all pile
// onto the same weekday (used when rebalancing a staff member's caseload).
export function generateTouchpointDates(
  hsp150: string,
  tier: string | null | undefined,
  seed = 0,
): TouchpointDate[] {
  const req = requirementsForTier(tier);
  if (req.requiredContacts <= 0) return [];

  const windowStart = addDays(hsp150, seed % 7); // small per-client day stagger
  const windowEnd = addDays(hsp150, WINDOW_DAYS - 1);
  const out: TouchpointDate[] = [];

  // High-level: aim for ~2 in-person visits per month, spaced at least 7 days apart.
  // Since touch-points are already weekly, flag every other week as in-person until the
  // monthly quota is met, then reset the quota at the start of each calendar month.
  const wantInPerson = req.requiredInPerson > 0;

  let cursor = windowStart;
  let weekIndex = 0;
  let currentMonth = cursor.slice(0, 7); // YYYY-MM
  let inPersonThisMonth = 0;

  while (daysBetween(cursor, windowEnd) >= 0) {
    const month = cursor.slice(0, 7);
    if (month !== currentMonth) {
      currentMonth = month;
      inPersonThisMonth = 0;
    }

    let isInPerson = false;
    if (wantInPerson && inPersonThisMonth < req.requiredInPerson && weekIndex % 2 === 0) {
      isInPerson = true;
      inPersonThisMonth++;
    }

    out.push({ date: cursor, modality: isInPerson ? 'in_person' : 'phone' });

    cursor = addDays(cursor, 7);
    weekIndex++;
  }

  // enforce chronological order and de-dupe identical dates
  out.sort((a, b) => a.date.localeCompare(b.date));
  const seen = new Set<string>();
  return out.filter((d) => (seen.has(d.date) ? false : (seen.add(d.date), true)));
}

async function insertTouchpoints(client: TouchpointClient, seed: number): Promise<void> {
  // Always clear existing auto-generated touch-points for this client first.
  await supabase
    .from('calendar_events')
    .delete()
    .eq('client_id', client.id)
    .eq('event_type', 'touch_point')
    .eq('is_auto_generated', true);

  if (client.status !== 'active') return;
  if (!client.hsp_150_date) return;
  if (!client.assigned_employee_id) return;

  const dates = generateTouchpointDates(client.hsp_150_date, client.level_of_need, seed);
  if (dates.length === 0) return;

  const rows = dates.map((d) => {
    const iso = toDate(d.date).toISOString();
    return {
      title: `Touchpoint (${MODALITY_LABELS[d.modality]}) — ${client.first_name} ${client.last_name}`,
      description: 'Auto-generated monthly touchpoint',
      event_type: 'touch_point',
      is_auto_generated: true,
      client_id: client.id,
      employee_id: client.assigned_employee_id,
      start_time: iso,
      end_time: iso,
    };
  });

  await supabase.from('calendar_events').insert(rows);
}

// Regenerate a single client's touch-point schedule.
export async function regenerateTouchpointsForClient(clientId: string): Promise<void> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, first_name, last_name, status, level_of_need, hsp_150_date, assigned_employee_id')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return;
  await insertTouchpoints(client as TouchpointClient, 0);
}

// Rebalance touch-points across all active clients assigned to a staff member so the
// load spreads evenly across each month rather than clustering on the same days.
export async function regenerateTouchpointsForStaff(employeeId: string | null | undefined): Promise<void> {
  if (!employeeId) return;
  const { data: clients } = await supabase
    .from('clients')
    .select('id, first_name, last_name, status, level_of_need, hsp_150_date, assigned_employee_id')
    .eq('assigned_employee_id', employeeId)
    .eq('status', 'active');

  const list = (clients as TouchpointClient[] | null) ?? [];
  let seed = 0;
  for (const c of list) {
    if (c.hsp_150_date) {
      await insertTouchpoints(c, seed);
      seed += 1;
    } else {
      // still clear any stale auto events
      await insertTouchpoints(c, 0);
    }
  }
}
