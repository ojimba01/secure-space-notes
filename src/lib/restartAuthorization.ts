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
import { reopenCaseFields } from '@/lib/reopenCase';

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
  /** What the MCO approved. Can wait: the restart is then pending. */
  type?: AuthorizationType | null;
  /** Can wait too; billing and touchpoints wait with it. */
  startDate?: string | null;
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

/** The client columns a restart changes, kept so it can be undone. */
const SNAPSHOT_COLUMNS = [
  ...Object.keys(CLEARED),
  'status',
  'workflow_stage',
  'workflow_stage_updated_at',
  'closed_date',
  'reason_closed',
];

/** What a restart replaced: stored on the client as restart_undo. */
export interface RestartSnapshot {
  round: number;
  fields: Record<string, unknown>;
  /** The authorizations the restart ended, with the status each had. */
  ended: { id: string; status: string }[];
}

/** A claim filed in the new round means the restart can no longer be undone. */
export const isFiled = (c: { billing_status?: string | null; payment_status?: string | null; claim_number?: string | null }) =>
  c.billing_status === 'Submitted' || c.payment_status === 'Paid' || !!c.claim_number;

/**
 * Take a restart back, pending or complete: the client returns to the round,
 * authorizations and dates they had before it (a closed case is closed again).
 * Documents filed since move back to that round. Refused once a claim from
 * the new round has been filed.
 */
export async function undoRestart(clientId: string): Promise<void> {
  const { data: client, error: readError } = await supabase
    .from('clients')
    .select('billing_round, restart_undo')
    .eq('id', clientId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const snapshot = (client as unknown as { restart_undo?: RestartSnapshot | null } | null)?.restart_undo;
  const round = (client as { billing_round?: number } | null)?.billing_round ?? 1;
  if (!snapshot) throw new Error('There is no restart to undo.');

  const { data: cycles, error: cycleError } = await supabase
    .from('billing_cycles')
    .select('id, billing_status, payment_status, claim_number')
    .eq('client_id', clientId)
    .eq('round', round);
  if (cycleError) throw new Error(cycleError.message);
  if ((cycles ?? []).some(isFiled)) {
    throw new Error('A claim from the restarted authorization has been filed, so the restart cannot be undone.');
  }

  // The client record first, so anything filed from here on lands in the old round.
  const { error: clientError } = await supabase
    .from('clients')
    .update({ ...snapshot.fields, billing_round: snapshot.round, restart_pending_at: null, restart_pending_type: null } as never)
    .eq('id', clientId);
  if (clientError) throw new Error(clientError.message);

  const steps = [
    // The restart's own authorizations go; the ones it ended come back.
    supabase.from('client_authorizations').delete().eq('client_id', clientId).eq('round', round),
    supabase.from('billing_cycles').delete().eq('client_id', clientId).eq('round', round),
    // Documents filed since the restart are kept, in the round the client is back in.
    supabase.from('client_forms').update({ round: snapshot.round } as never).eq('client_id', clientId).eq('round', round),
    ...snapshot.ended.map((a) => supabase.from('client_authorizations').update({ status: a.status as never }).eq('id', a.id)),
  ];
  for (const step of steps) {
    const { error } = await step;
    if (error) throw new Error(error.message);
  }
  await moveChecklistTicks(clientId, round, snapshot.round);

  const { error: doneError } = await supabase.from('clients').update({ restart_undo: null } as never).eq('id', clientId);
  if (doneError) throw new Error(doneError.message);
  await resyncDerivedSchedules(clientId);
}

/** Ticks can only be added and removed, so a moved tick is removed and added again. */
async function moveChecklistTicks(clientId: string, from: number, to: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const table = () => (supabase as any).from('client_form_checklist');
  const { data } = await table().select('form_type, marked_by, round').eq('client_id', clientId).in('round', [from, to]);
  const rows = (data ?? []) as { form_type: string; marked_by: string | null; round: number }[];
  const have = new Set(rows.filter((r) => r.round === to).map((r) => r.form_type));
  const moving = rows.filter((r) => r.round === from);
  if (!moving.length) return;
  await table().delete().eq('client_id', clientId).eq('round', from);
  const add = moving.filter((r) => !have.has(r.form_type)).map((r) => ({ client_id: clientId, form_type: r.form_type, marked_by: r.marked_by, round: to }));
  if (add.length) await table().insert(add);
}

export interface PendingRestart {
  since: string;
  type: AuthorizationType | null;
}

/** The restart waiting for its start date (and maybe its type), if any. */
export const pendingRestart = (c: { restart_pending_at?: string | null; restart_pending_type?: string | null } | null | undefined): PendingRestart | null =>
  c?.restart_pending_at ? { since: c.restart_pending_at, type: (c.restart_pending_type as AuthorizationType | null) ?? null } : null;

/**
 * Restart a client's authorization, or finish a restart that was waiting.
 *
 * With a type and a start date the restart is complete. Without either, the
 * restart is pending: the old round is closed and a new one opened, the
 * forms it needs are asked for, and billing and touchpoints wait. Calling this
 * again with the type and date completes it, in the same round.
 */
export async function restartAuthorization(input: RestartInput): Promise<{ gap: number | null; pending: boolean }> {
  const [{ data: client, error: readError }, { data: history, error: histError }] = await Promise.all([
    supabase
      .from('clients')
      .select(`billing_round, restart_pending_at, restart_pending_type, ${SNAPSHOT_COLUMNS.join(', ')}`)
      .eq('id', input.clientId)
      .maybeSingle(),
    supabase.from('client_authorizations').select('id, end_date, status').eq('client_id', input.clientId).neq('status', 'cancelled'),
  ]);
  if (readError) throw new Error(readError.message);
  if (histError) throw new Error(histError.message);
  const already = pendingRestart(client as unknown as Record<string, string | null> | null);
  const previousEnd = lastEnd(history ?? []);
  const complete = !!(input.type && input.startDate);
  if (complete && previousEnd && input.startDate! <= previousEnd) {
    throw new Error(`The new start date has to be after the last authorization ended (${previousEnd}).`);
  }

  if (!already) {
    // Earlier periods ended; they stay on record as they were billed.
    const open = (history ?? []).filter((r) => r.status === 'active' || r.status === 'pending');
    if (open.length) {
      const { error } = await supabase.from('client_authorizations').update({ status: 'expired' }).in('id', open.map((r) => r.id));
      if (error) throw new Error(error.message);
    }
    // A new round, with nothing from the old one feeding it. What it replaces
    // is kept so the restart can be undone (undoRestart).
    const current = (client ?? {}) as unknown as Record<string, unknown>;
    const previousRound = (current.billing_round as number | undefined) ?? 1;
    const snapshot: RestartSnapshot = {
      round: previousRound,
      fields: Object.fromEntries(SNAPSHOT_COLUMNS.map((k) => [k, current[k] ?? null])),
      ended: open.map((r) => ({ id: r.id, status: r.status })),
    };
    // A closed case comes back open: the client has returned.
    const reopen = current.status === 'closed' ? reopenCaseFields(null, new Date(), {}) : {};
    const { error: clearError } = await supabase
      .from('clients')
      .update({ ...CLEARED, ...reopen, billing_round: previousRound + 1, restart_undo: snapshot } as never)
      .eq('id', input.clientId);
    if (clearError) throw new Error(clearError.message);
  }

  if (!complete) {
    const { error } = await supabase
      .from('clients')
      .update({ restart_pending_at: already?.since ?? new Date().toISOString(), restart_pending_type: input.type ?? already?.type ?? null } as never)
      .eq('id', input.clientId);
    if (error) throw new Error(error.message);
    // Nothing is owed while the client is not authorized.
    if (previousEnd) await clearGapTouchpoints(input.clientId, addDays(previousEnd, 1), '9999-12-31');
    await resyncDerivedSchedules(input.clientId);
    return { gap: null, pending: true };
  }

  const type = input.type!;
  const startDate = input.startDate!;
  const end = input.endDate || defaultEndDate(type, startDate);
  const gap = gapDays(previousEnd, startDate);

  const { authorization } = await recordAuthorization({
    clientId: input.clientId,
    type,
    startDate,
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

  await mirrorAuthorizationToLegacyColumns(input.clientId, type, {
    authorizationNumber: input.authorizationNumber?.trim() || null,
    startDate,
    endDate: end,
  });
  if (already) {
    const { error } = await supabase.from('clients').update({ restart_pending_at: null, restart_pending_type: null } as never).eq('id', input.clientId);
    if (error) throw new Error(error.message);
  }

  // Touchpoints that fell due while the client was gone are not owed.
  if (previousEnd) await clearGapTouchpoints(input.clientId, addDays(previousEnd, 1), startDate);

  await resyncDerivedSchedules(input.clientId);
  return { gap, pending: false };
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
