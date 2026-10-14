// Restarting a client's authorization after they disappeared past their window.
//
// Not a reopen: the case was never closed, and a reopen brings back the
// authorizations it already had. Not the next step either (30 → 150 → 180):
// the MCO has approved a fresh period after a gap, of whichever length it
// decided. So the restart:
//
//   - leaves every earlier authorization on record, marked expired, and every
//     billing cycle already generated as it is;
//   - starts a new billing round from the new start date;
//   - clears the touchpoints that fell in the gap, so time the client was gone
//     is not counted against the case manager;
//   - asks for the forms that type of authorization needs (FORMS_FOR_RESTART).
import { supabase } from '@/integrations/supabase/client';
import {
  defaultEndDate,
  mirrorAuthorizationToLegacyColumns,
  recordAuthorization,
  resyncDerivedSchedules,
  type AuthorizationType,
  type ClientAuthorization,
} from '@/lib/authorizations';

export const RESTART_TYPES: { type: AuthorizationType; label: string; days: number }[] = [
  { type: 'initial_30', label: '30-day', days: 30 },
  { type: 'continuation_150', label: '150-day', days: 150 },
  { type: 'reauthorization_180', label: '180-day', days: 180 },
];

/** The forms each kind of restart has to be filed again. */
export const FORMS_FOR_RESTART: Record<string, string[]> = {
  initial_30: ['Initial Assessment (IAT)', 'Level of Need (LON)', 'Housing Stabilization Plan (HSP)'],
  continuation_150: ['Housing Stabilization Plan (HSP)'],
  reauthorization_180: ['Level of Need (LON)', 'Housing Stabilization Plan (HSP)'],
};

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The day the client's last authorization ended, from the history. */
export function lastEnd(rows: Pick<ClientAuthorization, 'end_date'>[]): string | null {
  const ends = rows.map((r) => r.end_date).filter((d): d is string => !!d).sort();
  return ends.at(-1) ?? null;
}

/** Days between the last authorization's end and the new start (0 when they touch). */
export function gapDays(previousEnd: string | null, start: string): number | null {
  if (!previousEnd || !start) return null;
  return Math.max(0, Math.round((Date.parse(start) - Date.parse(previousEnd)) / DAY) - 1);
}

/** The latest restart on record, if the client's current authorization is one. */
export function latestRestart(rows: ClientAuthorization[]): ClientAuthorization | null {
  const latest = [...rows]
    .filter((r) => r.status !== 'cancelled' && r.status !== 'denied')
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))
    .at(-1);
  return latest && latest.restarted_after_days != null ? latest : null;
}

export interface RestartInput {
  clientId: string;
  type: AuthorizationType;
  startDate: string;
  endDate?: string | null;
  authorizationNumber?: string | null;
  createdBy?: string | null;
}

/** Every legacy authorization column, cleared so the new period stands alone. */
const CLEARED = {
  iat_date: null,
  auth_30_start: null,
  auth_30_end: null,
  auth_30_number: null,
  auth_150_start: null,
  auth_150_end: null,
  auth_150_number: null,
  hsp_150_date: null,
  auth_180_start: null,
  auth_180_end: null,
  auth_180_number: null,
  hsp_180_date: null,
  auth_180_approved: null,
  // Every restart needs a new plan.
  hsp_submitted: false,
  hsp_submitted_at: null,
};

export async function restartAuthorization(input: RestartInput): Promise<{ gap: number | null }> {
  const end = input.endDate || defaultEndDate(input.type, input.startDate);

  const [{ data: client, error: readError }, { data: history, error: histError }] = await Promise.all([
    supabase.from('clients').select('billing_round').eq('id', input.clientId).maybeSingle(),
    supabase.from('client_authorizations').select('id, end_date, status').eq('client_id', input.clientId),
  ]);
  if (readError) throw new Error(readError.message);
  if (histError) throw new Error(histError.message);
  const previousEnd = lastEnd(history ?? []);
  if (previousEnd && input.startDate <= previousEnd) {
    throw new Error(`The new start date has to be after the last authorization ended (${previousEnd}).`);
  }
  const gap = gapDays(previousEnd, input.startDate);

  // Earlier periods ended; they stay on record as they were billed.
  const open = (history ?? []).filter((r) => r.status === 'active' || r.status === 'pending').map((r) => r.id);
  if (open.length) {
    const { error } = await supabase.from('client_authorizations').update({ status: 'expired' }).in('id', open);
    if (error) throw new Error(error.message);
  }

  // A new billing round, with nothing from the old one feeding it.
  const round = ((client as { billing_round?: number } | null)?.billing_round ?? 1) + 1;
  const { error: clearError } = await supabase
    .from('clients')
    .update({ ...CLEARED, billing_round: round } as never)
    .eq('id', input.clientId);
  if (clearError) throw new Error(clearError.message);

  const { authorization } = await recordAuthorization({
    clientId: input.clientId,
    type: input.type,
    startDate: input.startDate,
    endDate: end,
    authorizationNumber: input.authorizationNumber?.trim() || null,
    createdBy: input.createdBy ?? null,
    notes: gap != null ? `Restarted after a gap of ${gap} days.` : 'Restarted.',
    mirrorLegacy: false,
  });
  const { error: markError } = await supabase
    .from('client_authorizations')
    .update({ restarted_after_days: gap ?? 0 })
    .eq('id', authorization.id);
  if (markError) throw new Error(markError.message);

  await mirrorAuthorizationToLegacyColumns(input.clientId, input.type, {
    authorizationNumber: input.authorizationNumber?.trim() || null,
    startDate: input.startDate,
    endDate: end,
  });

  // Touchpoints that fell due while the client was gone are not owed.
  if (previousEnd) await clearGapTouchpoints(input.clientId, addDays(previousEnd, 1), input.startDate);

  await resyncDerivedSchedules(input.clientId);
  return { gap };
}

/** Scheduled touchpoints in [from, to) that nobody adjusted and no contact covered. */
async function clearGapTouchpoints(clientId: string, from: string, to: string): Promise<void> {
  if (from >= to) return;
  const [{ data: events }, { data: contacts }] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('id, start_time, is_auto_generated, is_manually_adjusted')
      .eq('client_id', clientId)
      .eq('event_type', 'touch_point')
      .gte('start_time', `${from}T00:00:00`)
      .lt('start_time', `${to}T00:00:00`),
    supabase.from('client_contacts').select('contact_date').eq('client_id', clientId).gte('contact_date', from).lt('contact_date', to),
  ]);
  const covered = new Set((contacts ?? []).map((c) => c.contact_date));
  const ids = (events ?? [])
    .filter((e) => e.is_auto_generated && !e.is_manually_adjusted && !covered.has(e.start_time.slice(0, 10)))
    .map((e) => e.id);
  if (ids.length) {
    const { error } = await supabase.from('calendar_events').delete().in('id', ids);
    if (error) throw new Error(error.message);
  }
}
