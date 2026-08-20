export const FORM_TYPES = [
  'Initial Assessment Tool',
  'Level of Need Assessment Tool',
  'Housing Stabilization Plan',
  'Other',
] as const;

export type FormType = (typeof FORM_TYPES)[number];

export const FORM_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};
