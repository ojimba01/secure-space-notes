import { addDays } from '@/lib/billing';

/**
 * What reopening a closed case writes.
 *
 * Closing sets both `status` and `workflow_stage` to closed, and records the
 * day and the reason. Undoing that is the whole of an ordinary reopen — the
 * case comes back holding the authorizations it already had, at the stage
 * those authorizations put it at.
 *
 * `workflow_stage` goes back to unset rather than to a stage of its own. The
 * stage a case is at is read off its authorizations (see `displayStage`), so a
 * value here would only be one more thing for them to disagree with; an
 * earlier version wrote 'intake', which is not even a stage this app has.
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

export function reopenCaseFields(
  newReferral?: NewReferral | null,
  now: Date = new Date(),
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    status: 'active',
    workflow_stage: null,
    workflow_stage_updated_at: now.toISOString(),
    closed_date: null,
    reason_closed: null,
  };

  if (!newReferral) return fields;

  return {
    ...fields,
    hsp_submitted: false,
    auth_30_start: newReferral.startDate,
    auth_30_end: addDays(newReferral.startDate, 29),
    auth_30_number: newReferral.authorizationNumber?.trim() || null,
    iat_date: newReferral.startDate,
  };
}
