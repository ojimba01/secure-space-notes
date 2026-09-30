// Touchpoint reminders: sent by an administrator from Team touchpoints, shown
// to the case manager when they open Clients (docs/touchpoint-reminders.sql).
import { supabase } from '@/integrations/supabase/client';

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const reminders = () => (supabase.from as any)('touchpoint_reminders');

/** How long "Remind me later" hides a reminder. */
export const SNOOZE_HOURS = 4;

export interface Reminder {
  id: string;
  client_id: string;
  employee_id: string;
  note: string | null;
  created_at: string;
  clientName: string;
  levelOfNeed: string | null;
  senderName: string | null;
}

const name = (p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null) =>
  p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email || null : null;

/**
 * Send a reminder to each case manager about each client. A client who
 * already has an open reminder has it sent again rather than duplicated.
 */
export async function sendReminders(
  items: { clientId: string; employeeId: string }[],
  sentBy: string | null,
  note: string | null,
): Promise<void> {
  if (!items.length) return;
  const { data: open, error } = await reminders()
    .select('id, client_id, employee_id')
    .in('client_id', [...new Set(items.map((i) => i.clientId))])
    .is('completed_at', null);
  if (error) throw new Error(error.message);

  const existing = new Map<string, string>(
    ((open ?? []) as { id: string; client_id: string; employee_id: string }[]).map((r) => [
      `${r.client_id}:${r.employee_id}`,
      r.id,
    ]),
  );
  const fresh = {
    sent_by: sentBy,
    note: note?.trim() || null,
    created_at: new Date().toISOString(),
    snoozed_until: null,
  };

  const inserts = items.filter((i) => !existing.has(`${i.clientId}:${i.employeeId}`));
  const updates = items.map((i) => existing.get(`${i.clientId}:${i.employeeId}`)).filter(Boolean) as string[];

  if (inserts.length) {
    const { error: insertError } = await reminders().insert(
      inserts.map((i) => ({ client_id: i.clientId, employee_id: i.employeeId, ...fresh })),
    );
    if (insertError) throw new Error(insertError.message);
  }
  if (updates.length) {
    const { error: updateError } = await reminders().update(fresh).in('id', updates);
    if (updateError) throw new Error(updateError.message);
  }
}

/** A case manager's reminders that are open and not snoozed, oldest first. */
export async function loadMyReminders(employeeId: string): Promise<Reminder[]> {
  const { data, error } = await reminders()
    .select(
      'id, client_id, employee_id, note, created_at, snoozed_until, client:clients(first_name, last_name, level_of_need), sender:profiles!touchpoint_reminders_sent_by_fkey(first_name, last_name, email)',
    )
    .eq('employee_id', employeeId)
    .is('completed_at', null)
    .order('created_at', { ascending: true });
  if (error) return [];
  const now = Date.now();
  return (
    (data ?? []) as {
      id: string;
      client_id: string;
      employee_id: string;
      note: string | null;
      created_at: string;
      snoozed_until: string | null;
      client: { first_name: string; last_name: string; level_of_need: string | null } | null;
      sender: { first_name: string | null; last_name: string | null; email: string | null } | null;
    }[]
  )
    .filter((r) => !r.snoozed_until || Date.parse(r.snoozed_until) <= now)
    .map((r) => ({
      id: r.id,
      client_id: r.client_id,
      employee_id: r.employee_id,
      note: r.note,
      created_at: r.created_at,
      clientName: r.client ? `${r.client.first_name} ${r.client.last_name}`.trim() : 'A client',
      levelOfNeed: r.client?.level_of_need ?? null,
      senderName: name(r.sender),
    }));
}

export async function snoozeReminder(id: string): Promise<void> {
  const until = new Date(Date.now() + SNOOZE_HOURS * 3_600_000).toISOString();
  const { error } = await reminders().update({ snoozed_until: until }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function completeReminder(id: string, how: 'logged' | 'marked_done'): Promise<void> {
  const { error } = await reminders()
    .update({ completed_at: new Date().toISOString(), completed_how: how })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Open reminders by client id, with when each was sent, for Team touchpoints. */
export async function loadOpenReminderDates(): Promise<Record<string, string>> {
  const { data, error } = await reminders().select('client_id, created_at').is('completed_at', null);
  if (error) return {};
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { client_id: string; created_at: string }[]) out[r.client_id] = r.created_at;
  return out;
}
