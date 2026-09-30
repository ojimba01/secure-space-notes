import { addDays } from '@/lib/billing';
import { supabase } from '@/integrations/supabase/client';
import { displayStage } from '@/lib/workflow';
import { resyncDerivedSchedules } from '@/lib/authorizations';

/**
 * What reopening a closed case writes.
 *
 * Closing sets both `status` and `workflow_stage` to closed, and records the
 * day and the reason. Undoing that is the whole of an ordinary reopen — the
 * case comes back holding the authorizations it already had, at the stage
 * those authorizations put it at.
 *
 * `workflow_stage` goes back to the stage the case's authorizations put it at
 * (see `displayStage`). It cannot be left empty: the column is required, and
 * clearing it made every ordinary reopen fail.
 *
 * A client who has genuinely come back is a different matter: that round is a
 * second referral with its own 30-day authorization, and its plan has to go in
 * again, so `hsp_submitted` is cleared. Asking for that every time meant
 * undoing a misclick cost the case its stage and put the HSP back on the list,
 * which is why it is now something you opt into.
 */
export interface NewReferral {
  /** The 30-day start, which is also this round's IAT date. */
  startDate: string;
  authorizationNumber?: string | null;
}

/** The authorization fields the stage is read from. */
export interface StageFields {
  auth_30_start?: string | null;
  auth_30_number?: string | null;
  auth_150_start?: string | null;
  auth_150_number?: string | null;
  hsp_150_date?: string | null;
  auth_180_start?: string | null;
  auth_180_number?: string | null;
}

export const STAGE_COLUMNS =
  'auth_30_start, auth_30_number, auth_150_start, auth_150_number, hsp_150_date, auth_180_start, auth_180_number';

export function reopenCaseFields(
  newReferral?: NewReferral | null,
  now: Date = new Date(),
  current: StageFields = {},
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    status: 'active',
    workflow_stage_updated_at: now.toISOString(),
    closed_date: null,
    reason_closed: null,
  };

  if (!newReferral) {
    return { ...fields, workflow_stage: displayStage({ ...current, status: 'active', workflow_stage: null }) };
  }

  const round = {
    hsp_submitted: false,
    auth_30_start: newReferral.startDate,
    auth_30_end: addDays(newReferral.startDate, 29),
    auth_30_number: newReferral.authorizationNumber?.trim() || null,
    iat_date: newReferral.startDate,
  };
  return {
    ...fields,
    ...round,
    workflow_stage: displayStage({ ...current, ...round, status: 'active', workflow_stage: null }),
  };
}

/**
 * Put a case closed by mistake straight back: open again, same authorizations,
 * same stage, same case manager. Nothing else about the case changes.
 */
export async function restoreClosedCase(clientId: string): Promise<void> {
  const { data, error: readError } = await supabase
    .from('clients')
    .select(STAGE_COLUMNS)
    .eq('id', clientId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  const { error } = await supabase
    .from('clients')
    .update(reopenCaseFields(null, new Date(), (data ?? {}) as StageFields) as never)
    .eq('id', clientId);
  if (error) throw new Error(error.message);
  // Billing cycles and touchpoints, rebuilt for an open case again.
  await resyncDerivedSchedules(clientId).catch(() => undefined);
}
