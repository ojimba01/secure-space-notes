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
  initial_auth_pending: 'Initial authorization pending',
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
