// Auto-generated monthly touch-point events derived from a client's HSP 150-Day date.
// These land in calendar_events with event_type 'touch_point' and is_auto_generated = true,
// so they render on the case manager's calendar and can be safely regenerated without
// touching manually-added events.
import { supabase } from '@/integrations/supabase/client';
import {
  requirementsForTier,
  addDays,
  daysBetween,
  firstOfMonth,
  lastOfMonth,
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

// Generate evenly-spread touch-point dates across the 150-day window, month by month.
// `seed` offsets a client's dates slightly so multiple clients don't all pile onto the
// same day of the month (used when rebalancing a staff member's caseload).
export function generateTouchpointDates(
  hsp150: string,
  tier: string | null | undefined,
  seed = 0,
): TouchpointDate[] {
  const req = requirementsForTier(tier);
  const n = req.requiredContacts;
  if (n <= 0) return [];

  const windowStart = hsp150;
  const windowEnd = addDays(hsp150, WINDOW_DAYS - 1);
  const out: TouchpointDate[] = [];

  let cursor = windowStart;
  while (daysBetween(cursor, windowEnd) >= 0) {
    const segStart = cursor;
    const monthEnd = lastOfMonth(cursor);
    const segEnd = daysBetween(monthEnd, windowEnd) < 0 ? windowEnd : monthEnd;
    const span = Math.max(0, daysBetween(segStart, segEnd));

    let inPersonPlaced = 0;
    for (let i = 0; i < n; i++) {
      const frac = (i + 1) / (n + 1);
      let offset = Math.round(frac * span);
      // small per-client stagger so caseloads don't cluster on identical days
      if (span > 0) offset = (offset + (seed % Math.max(1, Math.floor(span / n) || 1))) % (span + 1);
      const date = addDays(segStart, offset);
      // High-level: mark the required in-person visits on the wider-spaced (even) slots
      const isInPerson = inPersonPlaced < req.requiredInPerson && i % 2 === 0;
      if (isInPerson) inPersonPlaced++;
      out.push({ date, modality: isInPerson ? 'in_person' : 'phone' });
    }

    // advance to the first day of the next month
    const next = firstOfMonth(addDays(monthEnd, 1));
    cursor = next;
  }

  // enforce chronological order and de-dupe identical dates
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
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
      title: `Touch-point (${MODALITY_LABELS[d.modality]}) — ${client.first_name} ${client.last_name}`,
      description: 'Auto-generated monthly touch-point',
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
