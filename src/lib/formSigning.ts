// The full set of documents the agency files, not just the three state
// assessments. Kept in lifecycle order so the picker reads like the workflow.
import { DOCUMENT_TYPES, type DocumentType } from '@/lib/documentRecognition';

export { DOCUMENT_TYPES as FORM_TYPES } from '@/lib/documentRecognition';
export type { DocumentType as FormType } from '@/lib/documentRecognition';

/**
 * What a person may choose from when filing a document by hand.
 *
 * The same list minus `Unsorted`. `Unsorted` is what the classifier records
 * when it cannot tell what a document is, so that it can be reviewed later —
 * it is a statement that nobody has read the file yet. Someone who is looking
 * straight at the document always knows better, so offering it as a choice
 * would only let a document be filed as unread.
 */
export const STAFF_SELECTABLE_TYPES = DOCUMENT_TYPES.filter(
  (t): t is Exclude<DocumentType, 'Unsorted'> => t !== 'Unsorted',
);

/** The three official assessments that have a fillable template in-app. */
export const ASSESSMENT_FORM_TYPES = [
  'Initial Assessment (IAT)',
  'Level of Need (LON)',
  'Housing Stabilization Plan (HSP)',
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

/**
 * The only two forms that are sent to an MCO.
 *
 * Misky, 2026-08-29: "The only ones that really matter to be sent to the MCO
 * is the IAT and the HSP."
 *
 * Named the right way round on purpose. A list of what is internal has to be
 * extended every time a document type is added, and a type nobody remembers to
 * add silently gains a status it can never truthfully hold. A list of what is
 * sent stays two long, and everything else is internal by default.
 *
 * Everything else in a client file is either the agency's own record (the
 * intake, a case note), something an MCO sent to the agency (an approval
 * letter, a denial), or the client's own paperwork (a lease, an ID). None of
 * them is ever sent anywhere.
 */
export const SENT_TO_MCO_TYPES: readonly string[] = [
  'Initial Assessment (IAT)',
  'Housing Stabilization Plan (HSP)',
];

/** Whether this form has an MCO track at all. */
export const goesToMco = (formType: string): boolean =>
  SENT_TO_MCO_TYPES.includes(formType);
