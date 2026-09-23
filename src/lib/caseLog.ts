// The weekly case log, built from work that was already recorded.
//
// A case manager logs a touchpoint once, in the app. The log is that same work
// read back a second way — one row per touchpoint, in the order it happened.
// Nobody retypes anything, which is the point: a form filled by hand from a
// list the app already holds is a list the app should have filled.
//
// A log stays derived until somebody edits it. `entries` on the row is null
// while that is true, and the rows come fresh from client_contacts every time
// it is opened, so a touchpoint logged this afternoon is on the form tonight.
// The moment a person changes a row the whole list is written down, because
// from then on the form is their account of the week rather than the app's.
//
// There is no submitted state, deliberately. The app cannot reach HMIS, so a
// "Submit" button promised a transmission that never happened — the log is
// always current, and filing it means downloading it and sending it yourself.
// case_logs still carries status/submitted_at columns from the first cut of
// this; nothing reads them.
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { CaseLogEntry } from '@/lib/caseLogForm';

// A work week runs Monday to Sunday, and a log is named for its Sunday — the
// "Week Ending" the form asks for. Dates are handled as plain calendar days
// (YYYY-MM-DD), never instants, so a touchpoint logged late on a Sunday
// evening cannot slide into Monday's week by way of a time zone.

const iso = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

/** A calendar day, as a Date at midnight UTC so arithmetic stays whole days. */
const day = (key: string): Date => {
  const [y, m, d] = key.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const addDays = (key: string, n: number): string => {
  const d = day(key);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

/** Today where the person is, as a calendar day. */
export const today = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

/** The Sunday that ends the week a calendar day falls in. */
export const weekKey = (date: string): string => {
  const dow = day(date).getUTCDay(); // 0 is Sunday
  return addDays(date, dow === 0 ? 0 : 7 - dow);
};

/** The Monday a week starts on. */
export const weekStart = (key: string): string => addDays(key, -6);

/** "09/27/2026", the way the form's Week Ending blank is filled in. */
export const weekEndingText = (key: string): string => {
  const [y, m, d] = key.split('-');
  return `${m}/${d}/${y}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Sep 21 – 27, 2026", or "Sep 28 – Oct 4, 2026" across a month end. */
export const weekLabel = (key: string): string => {
  const [sy, sm, sd] = weekStart(key).split('-').map(Number);
  const [ey, em, ed] = key.split('-').map(Number);
  const start = `${MONTHS[sm - 1]} ${sd}`;
  if (sy !== ey) return `${start}, ${sy} – ${MONTHS[em - 1]} ${ed}, ${ey}`;
  return sm === em ? `${start} – ${ed}, ${ey}` : `${start} – ${MONTHS[em - 1]} ${ed}, ${ey}`;
};

// The team dashboard still counts a month's touchpoints; that tally is not the
// log, so it keeps its months.

/** The first of a month, as the database stores it. */
export const monthKey = (d: Date | string): string => {
  const iso = typeof d === 'string' ? d : d.toISOString();
  return `${iso.slice(0, 7)}-01`;
};

/** "September 2026". */
export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-');
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[Number(m) - 1] ?? ''} ${y}`.trim();
};

/**
 * Nothing before this exists. Touchpoints were not logged in the app until
 * September 2026, so the first log is the week September 1st falls in.
 */
export const FIRST_LOG_WEEK = '2026-09-06';

export interface CaseLogRow {
  id: string;
  employee_id: string;
  week_ending: string;
  entries: CaseLogEntry[] | null;
}

/**
 * The rows a week's logged touchpoints make.
 *
 * One row per touchpoint, oldest first, because that is the order the week
 * happened in and the order a reader checking the log against a calendar will
 * read it. A client met twice appears twice, each with its own date.
 */
export async function deriveEntries(
  employeeId: string,
  week: string,
): Promise<CaseLogEntry[]> {
  const { data, error } = await supabase
    .from('client_contacts')
    .select('client_id, contact_date, clients!inner(first_name, last_name)')
    .eq('employee_id', employeeId)
    .gte('contact_date', weekStart(week))
    .lte('contact_date', week)
    .order('contact_date', { ascending: true });

  if (error) throw error;

  type Joined = {
    client_id: string;
    contact_date: string;
    clients: { first_name: string; last_name: string } | null;
  };

  return ((data ?? []) as unknown as Joined[])
    .map((r) => ({
      clientId: r.client_id,
      clientName: `${r.clients?.first_name ?? ''} ${r.clients?.last_name ?? ''}`.trim(),
      date: r.contact_date,
      // A logged contact is a contact that happened. There is no other kind:
      // the app records them after the fact, never in advance.
      completed: true,
    }))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.clientName.localeCompare(b.clientName));
}

/** The stored log for a week, or null when nobody has touched it yet. */
export async function loadCaseLog(
  employeeId: string,
  week: string,
): Promise<CaseLogRow | null> {
  const { data, error } = await supabase
    .from('case_logs')
    .select('id, employee_id, week_ending, entries')
    .eq('employee_id', employeeId)
    .eq('week_ending', week)
    .maybeSingle();
  if (error) throw error;
  // The column is jsonb, so the client hands back `Json`. `entries` is the
  // narrow shape this app writes into it — see saveCaseLog.
  return (data as unknown as CaseLogRow | null) ?? null;
}

/**
 * What the form should show: what a person wrote if they wrote anything,
 * otherwise what the week's touchpoints say.
 */
export async function caseLogEntries(
  employeeId: string,
  week: string,
  stored: CaseLogRow | null,
): Promise<CaseLogEntry[]> {
  if (stored?.entries) return stored.entries;
  return await deriveEntries(employeeId, week);
}

/** Write a person's version of the week down, creating the log if needed. */
export async function saveCaseLog(
  employeeId: string,
  week: string,
  entries: CaseLogEntry[],
): Promise<void> {
  const { error } = await supabase
    .from('case_logs')
    // `entries` is a jsonb column, so the client types it as `Json`. The shape
    // written here is exactly CaseLogEntry[] — the same shape loadCaseLog reads
    // back and caseLogEntries hands to the form.
    .upsert(
      { employee_id: employeeId, week_ending: week, entries: entries as unknown as Json },
      { onConflict: 'employee_id,week_ending' },
    );
  if (error) throw error;
}

/** Every week with a log to show, newest first. Never before September 2026. */
export function weeksAvailable(now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let cursor = weekKey(today(now)); cursor >= FIRST_LOG_WEEK; cursor = addDays(cursor, -7)) {
    out.push(cursor);
  }
  return out;
}
