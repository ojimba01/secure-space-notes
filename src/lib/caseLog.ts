// The monthly case log, built from work that was already recorded.
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
// from then on the form is their account of the month rather than the app's.
//
// There is no submitted state, deliberately. The app cannot reach HMIS, so a
// "Submit" button promised a transmission that never happened — the log is
// always current, and filing it means downloading it and sending it yourself.
// case_logs still carries status/submitted_at columns from the first cut of
// this; nothing reads them.
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import type { CaseLogEntry } from '@/lib/caseLogForm';

/** The first of a month, as the database stores it. */
export const monthKey = (d: Date | string): string => {
  const iso = typeof d === 'string' ? d : d.toISOString();
  return `${iso.slice(0, 7)}-01`;
};

/** "September 2026", for the blank at the top of the form. */
export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-');
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${names[Number(m) - 1] ?? ''} ${y}`.trim();
};

/** Last day of the month a key names, so a query can bound itself. */
const monthEnd = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 0))
    .toISOString()
    .slice(0, 10);
};

/**
 * Nothing before this exists. Touchpoints were not logged in the app until
 * September 2026, so a log for August would be a blank page pretending to be a
 * record.
 */
export const FIRST_LOG_MONTH = '2026-09-01';

export interface CaseLogRow {
  id: string;
  employee_id: string;
  month: string;
  entries: CaseLogEntry[] | null;
}

/**
 * The rows a month's logged touchpoints make.
 *
 * One row per touchpoint, oldest first, because that is the order the month
 * happened in and the order a reader checking the log against a calendar will
 * read it. A client met twice appears twice, each with its own date.
 */
export async function deriveEntries(
  employeeId: string,
  month: string,
): Promise<CaseLogEntry[]> {
  const { data, error } = await supabase
    .from('client_contacts')
    .select('client_id, contact_date, clients!inner(first_name, last_name, phone)')
    .eq('employee_id', employeeId)
    .gte('contact_date', month)
    .lte('contact_date', monthEnd(month))
    .order('contact_date', { ascending: true });

  if (error) throw error;

  type Joined = {
    client_id: string;
    contact_date: string;
    clients: { first_name: string; last_name: string; phone: string | null } | null;
  };

  return ((data ?? []) as unknown as Joined[])
    .map((r) => ({
      clientId: r.client_id,
      clientName: `${r.clients?.first_name ?? ''} ${r.clients?.last_name ?? ''}`.trim(),
      phone: r.clients?.phone ?? null,
      date: r.contact_date,
      // A logged contact is a contact that happened. There is no other kind:
      // the app records them after the fact, never in advance.
      completed: true,
    }))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || a.clientName.localeCompare(b.clientName));
}

/** The stored log for a month, or null when nobody has touched it yet. */
export async function loadCaseLog(
  employeeId: string,
  month: string,
): Promise<CaseLogRow | null> {
  const { data, error } = await supabase
    .from('case_logs')
    .select('id, employee_id, month, entries')
    .eq('employee_id', employeeId)
    .eq('month', month)
    .maybeSingle();
  if (error) throw error;
  // The column is jsonb, so the client hands back `Json`. `entries` is the
  // narrow shape this app writes into it — see saveCaseLog.
  return (data as unknown as CaseLogRow | null) ?? null;
}

/**
 * What the form should show: what a person wrote if they wrote anything,
 * otherwise what the month's touchpoints say.
 */
export async function caseLogEntries(
  employeeId: string,
  month: string,
  stored: CaseLogRow | null,
): Promise<CaseLogEntry[]> {
  if (stored?.entries) return stored.entries;
  return await deriveEntries(employeeId, month);
}

/** Write a person's version of the month down, creating the log if needed. */
export async function saveCaseLog(
  employeeId: string,
  month: string,
  entries: CaseLogEntry[],
): Promise<void> {
  const { error } = await supabase
    .from('case_logs')
    // `entries` is a jsonb column, so the client types it as `Json`. The shape
    // written here is exactly CaseLogEntry[] — the same shape loadCaseLog reads
    // back and caseLogEntries hands to the form.
    .upsert(
      { employee_id: employeeId, month, entries: entries as unknown as Json },
      { onConflict: 'employee_id,month' },
    );
  if (error) throw error;
}

/** Every month with a log to show, newest first. Never before September 2026. */
export function monthsAvailable(today: Date = new Date()): string[] {
  const out: string[] = [];
  let cursor = monthKey(today);
  while (cursor >= FIRST_LOG_MONTH) {
    out.push(cursor);
    const [y, m] = cursor.split('-').map(Number);
    cursor = m === 1
      ? `${y - 1}-12-01`
      : `${y}-${String(m - 1).padStart(2, '0')}-01`;
  }
  return out;
}
