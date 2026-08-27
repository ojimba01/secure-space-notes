// The full set of documents the agency files, not just the three state
// assessments. Kept in lifecycle order so the picker reads like the workflow.
export { DOCUMENT_TYPES as FORM_TYPES } from '@/lib/documentRecognition';
export type { DocumentType as FormType } from '@/lib/documentRecognition';

/** The three official assessments that have a fillable template in-app. */
export const ASSESSMENT_FORM_TYPES = [
  'Initial Assessment Tool',
  'Level of Need Assessment Tool',
  'Housing Stabilization Plan',
] as const;

/**
 * INTERNAL review status. This is our own sign-off chain only — it says nothing
 * about what the MCO has decided. "approved" therefore reads as "internally
 * approved / ready to send", never as an MCO approval.
 */
export const FORM_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Ready for review',
  approved: 'Internally approved (Ready to send)',
  changes_requested: 'Changes requested',
};

/** Compact variant for table cells where the long label does not fit. */
export const FORM_STATUS_SHORT_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Ready for review',
  approved: 'Internally approved',
  changes_requested: 'Changes requested',
};

export const FORM_STATUS_CLASS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  submitted: 'bg-amber-100 text-amber-900',
  approved: 'bg-green-100 text-green-800',
  changes_requested: 'bg-red-100 text-red-800',
};

/** EXTERNAL status — where the document sits with the MCO. */
export const EXTERNAL_STATUSES = [
  'not_sent',
  'sent_to_mco',
  'awaiting_response',
  'accepted',
  'denied',
  'not_applicable',
] as const;

export type ExternalStatus = (typeof EXTERNAL_STATUSES)[number];

export const EXTERNAL_STATUS_LABEL: Record<string, string> = {
  not_sent: 'Not sent',
  sent_to_mco: 'Sent to MCO',
  awaiting_response: 'Awaiting MCO response',
  accepted: 'Accepted by MCO',
  denied: 'Denied by MCO',
  not_applicable: 'Not applicable',
};

export const EXTERNAL_STATUS_CLASS: Record<string, string> = {
  not_sent: 'bg-muted text-muted-foreground',
  sent_to_mco: 'bg-blue-100 text-blue-900',
  awaiting_response: 'bg-amber-100 text-amber-900',
  accepted: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  not_applicable: 'bg-muted text-muted-foreground',
};

export const WORKFLOW_PURPOSES = [
  'initial_authorization',
  'continuation',
  'reauthorization',
  'other',
] as const;

export const WORKFLOW_PURPOSE_LABEL: Record<string, string> = {
  initial_authorization: 'Initial authorization',
  continuation: 'Continuation',
  reauthorization: 'Reauthorization',
  other: 'Other',
};

export const FORM_SOURCE_LABEL: Record<string, string> = {
  created_in_app: 'Created in app',
  manual_upload: 'Manual upload',
  bulk_import: 'Bulk import',
};
