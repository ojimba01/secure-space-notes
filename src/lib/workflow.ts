// Referral → intake → authorization lifecycle.
//
// The stage a client sits in drives what the app asks staff to do next, and
// which date anchors compliance and billing. Every screen reads these helpers
// so the lifecycle is described in exactly one place.

export const WORKFLOW_STAGES = [
  'referred',
  'initial_auth_pending',
  'initial_30_active',
  'active_authorization',
  'closed',
] as const;

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number];

export const STAGE_LABEL: Record<string, string> = {
  referred: 'Referral received',
  initial_auth_pending: 'Authorization pending',
  initial_30_active: 'Initial 30-day authorization',
  active_authorization: 'Active authorization',
  closed: 'Closed',
};

export const STAGE_CLASS: Record<string, string> = {
  referred: 'bg-slate-100 text-slate-800',
  initial_auth_pending: 'bg-amber-100 text-amber-900',
  initial_30_active: 'bg-blue-100 text-blue-900',
  active_authorization: 'bg-green-100 text-green-800',
  closed: 'bg-muted text-muted-foreground',
};

export const INTAKE_STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  scheduled: 'Scheduled',
  complete: 'Complete',
};

export interface WorkflowClient {
  workflow_stage?: string | null;
  intake_status?: string | null;
  auth_30_start?: string | null;
  auth_150_start?: string | null;
  hsp_150_date?: string | null;
  level_of_need?: string | null;
  hsp_submitted?: boolean | null;
}

/**
 * The date services actually began — the anchor for touchpoint compliance.
 * The initial 30-day authorization starts the clock; the 150-day
 * authorization only takes over when there was never a 30-day period.
 * hsp_150_date remains a fallback for records created before authorizations
 * were tracked separately.
 */
export function serviceStartDate(c: WorkflowClient): string | null {
  return c.auth_30_start || c.auth_150_start || c.hsp_150_date || null;
}

/**
 * Setup is complete when a client can actually be worked: the HSP has been
 * submitted, an approval / authorization start date anchors the 30-day cycles,
 * and a level of need sets how many touchpoints those cycles require.
 *
 * Staff only ever see setup-complete clients. Filling the gaps is Admin and
 * Superadmin work, so an incomplete client never reaches a staff work queue.
 */
export function isSetupComplete(c: WorkflowClient): boolean {
  const tier = c.level_of_need;
  return (
    c.hsp_submitted === true &&
    !!serviceStartDate(c) &&
    (tier === 'High Level' || tier === 'Low Level')
  );
}

/** Which setup pieces are missing — Admin/Superadmin facing. */
export function missingSetupParts(c: WorkflowClient): string[] {
  const parts: string[] = [];
  if (c.hsp_submitted !== true) parts.push('HSP submission');
  if (!serviceStartDate(c)) parts.push('HSP approval / authorization start date');
  if (c.level_of_need !== 'High Level' && c.level_of_need !== 'Low Level') parts.push('level of need');
  return parts;
}

export type NextActionKind =
  | 'submit_iat'
  | 'schedule_intake'
  | 'complete_lon'
  | 'submit_hsp'
  | 'record_authorization'
  | 'set_level_of_need'
  | 'none';

export interface NextAction {
  kind: NextActionKind;
  label: string;
  detail: string;
}

/**
 * The single next thing this client needs, in lifecycle order. Screens show
 * one action at a time so staff are never guessing which step comes next.
 */
export function nextAction(
  c: WorkflowClient,
  forms: { form_type: string; status: string }[] = [],
): NextAction {
  const stage = c.workflow_stage ?? 'referred';
  const has = (type: string) =>
    forms.some((f) => f.form_type === type && f.status !== 'changes_requested');

  if (stage === 'closed') {
    return { kind: 'none', label: 'Case closed', detail: 'No further action is required.' };
  }

  if (stage === 'referred') {
    if (!has('Initial Assessment Tool')) {
      return {
        kind: 'submit_iat',
        label: 'Complete the Initial Assessment Tool',
        detail: 'The IAT starts the authorization request for this referral.',
      };
    }
    return {
      kind: 'record_authorization',
      label: 'Record the initial 30-day authorization',
      detail: 'Add the authorization number and start date once the MCO responds.',
    };
  }

  if (stage === 'initial_auth_pending') {
    return {
      kind: 'record_authorization',
      label: 'Record the initial 30-day authorization',
      detail: 'Add the authorization number and start date once the MCO responds.',
    };
  }

  if (stage === 'initial_30_active') {
    if (c.intake_status !== 'complete') {
      return {
        kind: 'schedule_intake',
        label: 'Hold the intake conversation',
        detail: 'Meet the member, then mark the intake complete to unlock the assessments.',
      };
    }
    if (!has('Level of Need Assessment Tool')) {
      return {
        kind: 'complete_lon',
        label: 'Complete the Level of Need assessment',
        detail: 'The LoN score sets the tier used for the continuation authorization.',
      };
    }
    if (!has('Housing Stabilization Plan')) {
      return {
        kind: 'submit_hsp',
        label: 'Submit the Housing Stabilization Plan',
        detail: 'The HSP must be filed inside the 30-day window to continue services.',
      };
    }
    return {
      kind: 'record_authorization',
      label: 'Record the continuation authorization',
      detail: 'Enter the 150-day authorization number and start date when it arrives.',
    };
  }

  // active_authorization
  if (!c.level_of_need) {
    return {
      kind: 'set_level_of_need',
      label: 'Set the level of need',
      detail: 'Billing cycles are already generated but cannot be priced without a tier.',
    };
  }
  return { kind: 'none', label: 'Up to date', detail: 'No outstanding lifecycle task.' };
}

// ---------------------------------------------------------------------------
// Continuation package (LoN + HSP)
//
// Internal review and the MCO's decision are tracked separately, so the packet
// has two dimensions: have we signed off on it, and where does it sit with the
// MCO. The package is only ever "ready to send" once BOTH documents are
// internally approved.
// ---------------------------------------------------------------------------

export const CONTINUATION_PACKAGE_FORMS = [
  'Level of Need Assessment Tool',
  'Housing Stabilization Plan',
] as const;

export type PackageState =
  | 'incomplete'
  | 'ready_to_send'
  | 'sent'
  | 'awaiting_mco'
  | 'authorized'
  | 'denied';

export const PACKAGE_STATE_LABEL: Record<PackageState, string> = {
  incomplete: 'Incomplete',
  ready_to_send: 'Ready to send',
  sent: 'Sent to MCO',
  awaiting_mco: 'Awaiting MCO response',
  authorized: 'Authorization received',
  denied: 'Denied',
};

export const PACKAGE_STATE_CLASS: Record<PackageState, string> = {
  incomplete: 'bg-muted text-muted-foreground',
  ready_to_send: 'bg-blue-100 text-blue-900',
  sent: 'bg-blue-100 text-blue-900',
  awaiting_mco: 'bg-amber-100 text-amber-900',
  authorized: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
};

export interface PackageForm {
  form_type: string;
  status: string;
  external_status?: string | null;
  created_at?: string;
}

/**
 * @param forms all forms for the client, newest first.
 */
export function continuationPackageState(forms: PackageForm[]): {
  state: PackageState;
  missing: string[];
} {
  const latest = (type: string) => forms.find((f) => f.form_type === type);
  const parts = CONTINUATION_PACKAGE_FORMS.map((type) => ({ type, form: latest(type) }));

  const missing = parts
    .filter(({ form }) => !form || form.status !== 'approved')
    .map(({ type }) => type);

  const externals = parts.map(({ form }) => form?.external_status ?? 'not_sent');

  if (externals.includes('denied')) return { state: 'denied', missing };
  if (externals.every((e) => e === 'accepted')) return { state: 'authorized', missing };
  if (missing.length) return { state: 'incomplete', missing };
  if (externals.includes('awaiting_response')) return { state: 'awaiting_mco', missing };
  if (externals.includes('sent_to_mco')) return { state: 'sent', missing };
  return { state: 'ready_to_send', missing };
}

