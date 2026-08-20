import type { FormType } from '@/lib/formSigning';

/**
 * Structured templates for the three NJ Housing Supports program forms
 * (February 2026 versions):
 *  - Initial Assessment Tool (IAT)
 *  - Level of Need Assessment Tool (LON)
 *  - Housing Stabilization Plan (HSP)
 *
 * Each template mirrors the sections and questions of the source PDF so the
 * data employees enter maps 1:1 back onto the paper form.
 */

export interface OptionDef {
  value: string;
  label: string;
  /** LON scoring weight for this option. */
  points?: number;
}

export interface ColumnDef {
  id: string;
  label: string;
  type?: 'text' | 'number' | 'date';
}

interface BaseField {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  placeholder?: string;
}

export type FieldDef =
  | (BaseField & { kind: 'text' | 'date' | 'email' | 'phone' | 'number' | 'currency' })
  | (BaseField & { kind: 'textarea' })
  | (BaseField & { kind: 'select'; options: OptionDef[] })
  | (BaseField & { kind: 'radio'; options: OptionDef[] })
  | (BaseField & { kind: 'checkboxes'; options: OptionDef[] })
  | (BaseField & { kind: 'table'; columns: ColumnDef[]; maxRows?: number; addLabel?: string });

export interface SectionDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
}

export type TableRowValue = Record<string, string>;
export type FieldValue = string | string[] | TableRowValue[];
export type FormDataMap = Record<string, FieldValue>;

export interface ScoreResult {
  total: number;
  category: 'Low level of need' | 'High level of need';
  breakdown: { label: string; points: number }[];
}

export interface FormTemplate {
  formType: FormType;
  intro: string;
  sections: SectionDef[];
  /** Present only on scored assessments (LON). */
  scoring?: (data: FormDataMap) => ScoreResult;
  /** Cross-field rules; returns human-readable errors. */
  validate?: (data: FormDataMap) => string[];
}

const NJ_COUNTIES = [
  'Atlantic', 'Bergen', 'Burlington', 'Camden', 'Cape May', 'Cumberland', 'Essex',
  'Gloucester', 'Hudson', 'Hunterdon', 'Mercer', 'Middlesex', 'Monmouth', 'Morris',
  'Ocean', 'Passaic', 'Salem', 'Somerset', 'Sussex', 'Union', 'Warren',
].map((c) => ({ value: c, label: c }));

const MCO_OPTIONS: OptionDef[] = [
  { value: 'aetna', label: 'Aetna Better Health of New Jersey' },
  { value: 'fidelis', label: 'Fidelis Care (formerly Wellcare)' },
  { value: 'horizon', label: 'Horizon NJ Health' },
  { value: 'uhc', label: 'United Health Care (UHC)' },
  { value: 'wellpoint', label: 'Wellpoint (formerly Amerigroup)' },
];

const HOUSEHOLD_MEMBER_COLUMNS: ColumnDef[] = [
  { id: 'first_name', label: 'First name' },
  { id: 'last_name', label: 'Last name' },
  { id: 'medicaid_id', label: 'Medicaid ID (if applicable)' },
  { id: 'mco_id', label: 'MCO ID (if applicable)' },
  { id: 'age', label: 'Age', type: 'number' },
];

const GOAL_GRID_COLUMNS: ColumnDef[] = [
  { id: 'goal', label: 'Goal' },
  { id: 'action', label: 'Action' },
  { id: 'person_responsible', label: 'Person responsible' },
  { id: 'target_date', label: 'Target date to complete', type: 'date' },
  { id: 'progress_update', label: 'Progress update' },
  { id: 'date_completed', label: 'Date completed', type: 'date' },
];

/* ------------------------------------------------------------------ */
/* Initial Assessment Tool                                             */
/* ------------------------------------------------------------------ */

export const INITIAL_ASSESSMENT_TEMPLATE: FormTemplate = {
  formType: 'Initial Assessment Tool',
  intro:
    'Requests Housing Supports services and documents eligibility. Eligibility requires Medicaid and MCO enrollment, at least one social risk criterion (Section B) and at least one clinical risk criterion (Section C). For households of more than one member, complete sections A–E for the member with the greatest observed need and list additional household members in Section F.',
  sections: [
    {
      id: 'member',
      title: 'A. Member Information',
      description: 'Please complete all information in this section.',
      fields: [
        { kind: 'text', id: 'member_name', label: 'Name (as written on Medicaid ID)', required: true },
        { kind: 'date', id: 'dob', label: 'Date of birth', required: true },
        { kind: 'phone', id: 'phone', label: 'Phone number (if applicable)' },
        { kind: 'email', id: 'email', label: 'Email address (if applicable)' },
        { kind: 'text', id: 'medicaid_id', label: 'Medicaid ID', required: true },
        { kind: 'select', id: 'mco', label: 'Managed Care Organization (MCO)', required: true, options: MCO_OPTIONS },
        { kind: 'text', id: 'mco_member_id', label: 'MCO Member ID (optional)' },
        { kind: 'select', id: 'county', label: 'Location (county)', required: true, options: NJ_COUNTIES },
      ],
    },
    {
      id: 'social_risk',
      title: 'B. Social Risk Criteria',
      description: 'Check every criterion that applies. At least one is required for eligibility.',
      fields: [
        {
          kind: 'checkboxes',
          id: 'social_risk',
          label: 'Does the member meet any social risk criteria?',
          required: true,
          options: [
            { value: 'homeless', label: 'Currently experiencing homelessness' },
            { value: 'at_risk_homeless', label: 'At risk of homelessness' },
            { value: 'at_risk_institutionalization', label: 'At risk of institutionalization and requiring a new housing arrangement' },
            { value: 'transitioning_institution', label: 'Transitioning from an institution to the community' },
            { value: 'released_corrections', label: 'Recently released from correctional facilities (within the past 12 months)' },
          ],
        },
      ],
    },
    {
      id: 'clinical_risk',
      title: 'C. Clinical Risk Criteria',
      description:
        'Self-reported or observed — a clinical diagnosis is not required. Check every criterion that applies; at least one is required for eligibility.',
      fields: [
        {
          kind: 'checkboxes',
          id: 'clinical_risk',
          label: 'Does the member meet any clinical risk criteria?',
          required: true,
          options: [
            { value: 'chronic_health', label: 'Chronic health condition' },
            { value: 'mental_health', label: 'Mental health condition' },
            { value: 'substance_misuse', label: 'Substance misuse' },
            { value: 'pregnancy', label: 'Pregnancy (currently pregnant or up to 12 months postpartum)' },
            { value: 'idd', label: 'Complex mental health condition from intellectual or developmental disability' },
            { value: 'violence', label: 'Victim of intimate partner violence, domestic violence, or human trafficking' },
            { value: 'adl_iadl', label: 'Requires assistance with activities of daily living (ADLs) or instrumental ADLs (IADLs)' },
            { value: 'repeated_ed', label: 'Repeated emergency department or hospital use' },
          ],
        },
      ],
    },
    {
      id: 'services',
      title: 'D. Services Needed',
      fields: [
        {
          kind: 'checkboxes',
          id: 'services_needed',
          label: 'What services does the member need?',
          required: true,
          hint: 'Pre-tenancy services and Tenancy Sustaining services cannot be delivered simultaneously.',
          options: [
            { value: 'pre_tenancy', label: 'Pre-tenancy Services (support in obtaining housing)' },
            { value: 'tenancy_sustaining', label: 'Tenancy Sustaining Services (support maintaining safe, stable housing)' },
            { value: 'move_in', label: 'Move-in Supports (one-time transitional expenses)' },
            { value: 'residential_mods', label: 'Residential Modifications and Remediation Services' },
          ],
        },
        {
          kind: 'radio',
          id: 'duplicate_services',
          label:
            'Confirm that the member (and household) is not currently receiving duplicate Medicaid-funded housing services (e.g., CSS, ICMS, MLTSS transition services, or exceeding Move-in / Residential Modification lifetime caps).',
          required: true,
          options: [
            { value: 'confirm', label: 'Confirm — not receiving duplicate services' },
            { value: 'unsure', label: 'Unsure' },
            { value: 'duplicate', label: 'Do not confirm — receiving duplicate services' },
          ],
        },
        {
          kind: 'text',
          id: 'preferred_provider',
          label: 'Preferred NJ FamilyCare Housing Supports provider (optional)',
          hint: 'Enter the housing provider organization the member would like to work with. Optional, but helps start services faster.',
        },
      ],
    },
    {
      id: 'requester',
      title: 'E. Requester Information',
      description:
        'Complete if someone other than the member is submitting this form. Household members submitting the form may skip role/title and organization.',
      fields: [
        { kind: 'text', id: 'requester_name', label: 'Name' },
        { kind: 'text', id: 'requester_relation', label: 'Relation to member' },
        { kind: 'text', id: 'requester_role', label: 'Role/title in organization (if applicable)' },
        { kind: 'text', id: 'requester_org', label: 'Organization name (if applicable)' },
        { kind: 'phone', id: 'requester_phone', label: 'Phone number' },
        { kind: 'email', id: 'requester_email', label: 'Email address' },
      ],
    },
    {
      id: 'household',
      title: 'F. Household Information',
      description:
        'Include the referred member and everyone who is part of their household, whether or not they are enrolled in Medicaid.',
      fields: [
        {
          kind: 'number',
          id: 'household_total',
          label: 'Total number of people in the household (including the member)',
          required: true,
        },
        {
          kind: 'table',
          id: 'household_members',
          label: 'Additional household members',
          columns: HOUSEHOLD_MEMBER_COLUMNS,
          maxRows: 10,
          addLabel: 'Add household member',
        },
      ],
    },
    {
      id: 'attestation',
      title: 'G. Statement of Truth & Signature',
      description:
        'Signing represents agreement that: the MCO may contact the member for more information; the information given is true, correct and complete under penalty of perjury; and providers giving false information may face penalties under state or federal law. A parent/guardian must sign for members younger than 18.',
      fields: [
        { kind: 'text', id: 'signature_member_name', label: 'Member name', required: true },
        { kind: 'text', id: 'parent_guardian_name', label: 'Parent/Guardian name (only if member is under 18)' },
        { kind: 'date', id: 'signature_date', label: 'Date', required: true },
      ],
    },
  ],
  validate: (data) => {
    const errors: string[] = [];
    const services = (data.services_needed as string[]) ?? [];
    if (services.includes('pre_tenancy') && services.includes('tenancy_sustaining')) {
      errors.push(
        'Pre-tenancy Services and Tenancy Sustaining Services cannot be delivered simultaneously — select only one of the two.',
      );
    }
    return errors;
  },
};

/* ------------------------------------------------------------------ */
/* Level of Need Assessment Tool                                       */
/* ------------------------------------------------------------------ */

export const LEVEL_OF_NEED_TEMPLATE: FormTemplate = {
  formType: 'Level of Need Assessment Tool',
  intro:
    'Used to request continued authorization (within the first 30 days of service) and reauthorization (every 180 days) for Pre-tenancy and Tenancy Sustaining Services. Answer for the individual authorized member only — providers may only bill for one member per household. Points are tallied automatically and classify the member as lower or higher level of need.',
  sections: [
    {
      id: 'demographics',
      title: 'A. Demographics',
      fields: [
        { kind: 'text', id: 'member_name', label: '1. Name', required: true, hint: 'Not scored.' },
        {
          kind: 'date',
          id: 'dob',
          label: '2. Date of birth',
          required: true,
          hint: 'Scores 1 point automatically if the member is under 18 or over 60.',
        },
        { kind: 'text', id: 'medicaid_id', label: '3. Medicaid ID', required: true, hint: 'Not scored, but Medicaid and MCO enrollment are required for eligibility.' },
        { kind: 'text', id: 'mco_member_id', label: '4. MCO Member ID', hint: 'Not scored, but Medicaid and MCO enrollment are required for eligibility.' },
        {
          kind: 'radio',
          id: 'household_size',
          label: '5. Number of people in household (including member)',
          required: true,
          options: [
            { value: 'multiple', label: '2+ members', points: 5 },
            { value: 'single', label: '1 member', points: 0 },
          ],
        },
        { kind: 'number', id: 'household_total', label: 'Total number of people in household', hint: 'Not scored.' },
        {
          kind: 'table',
          id: 'household_members',
          label: 'If multiple people in the household, list all names, ages, Medicaid IDs and MCO IDs as known',
          columns: HOUSEHOLD_MEMBER_COLUMNS,
          maxRows: 10,
          addLabel: 'Add household member',
        },
        {
          kind: 'radio',
          id: 'employed',
          label: '6. Is the member employed?',
          required: true,
          hint: 'Answer for the authorized member only. If the member is a child without a job, answer No.',
          options: [
            { value: 'yes', label: 'Yes', points: 0 },
            { value: 'no', label: 'No', points: 1 },
          ],
        },
      ],
    },
    {
      id: 'housing_history',
      title: 'B. Housing and Social History',
      fields: [
        {
          kind: 'radio',
          id: 'sleep_location',
          label: '7. Where does the member sleep most frequently? (select only one)',
          required: true,
          options: [
            { value: 'unsheltered', label: 'Homeless — unsheltered, including areas not meant for human habitation (vehicle, abandoned building, outdoors)', points: 5 },
            { value: 'shelter', label: 'Homeless — emergency shelter, safe haven, or hotel/motel paid by charity or government', points: 5 },
            { value: 'other_homeless', label: 'Homeless — other definitions (lacks fixed/regular/adequate nighttime residence; imminent risk within 14 days; fleeing domestic violence; homeless youth under 25 under federal statutes)', points: 5 },
            { value: 'at_risk', label: 'Unstably housed — at risk of homelessness (couch-surfing, eviction within 21 days, overcrowded housing)', points: 1 },
            { value: 'unsafe_home', label: 'Unstably housed — living in a physically unsafe home', points: 1 },
            { value: 'at_risk_institutionalization', label: 'Unstably housed — at risk of institutionalization', points: 1 },
            { value: 'transitioning_institution', label: 'Unstably housed — transitioning out of an institution', points: 1 },
            { value: 'released_corrections', label: 'Unstably housed — recently released (within 12 months) from a correctional facility', points: 1 },
            { value: 'stable', label: 'Stably, safely housed (none of the above)', points: 0 },
          ],
        },
        {
          kind: 'radio',
          id: 'duration',
          label: '8. How long has the member been living there? (select only one)',
          required: true,
          options: [
            { value: 'homeless_gt1y', label: 'Homeless for greater than 1 year', points: 3 },
            { value: 'homeless_lt1y', label: 'Homeless for less than 1 year', points: 2 },
            { value: 'unstable_gt1y', label: 'Unstably housed for greater than 1 year', points: 2 },
            { value: 'unstable_lt1y', label: 'Unstably housed for less than 1 year', points: 1 },
            { value: 'stable', label: 'Stably housed', points: 0 },
          ],
        },
        {
          kind: 'number',
          id: 'stably_housed_months',
          label: 'If stably housed, for how many months?',
          hint: 'Not scored.',
        },
        {
          kind: 'radio',
          id: 'times_homeless',
          label: '9. How many times has the member been homeless (including currently)?',
          required: true,
          options: [
            { value: 'past_year', label: 'Experienced homelessness at least once in the past year', points: 3 },
            { value: 'past_3_years', label: 'Experienced homelessness at least once in the past 3 years but not in the past year', points: 2 },
            { value: 'lifetime', label: 'Experienced homelessness over lifetime but not in the past 3 years', points: 1 },
            { value: 'never', label: 'Never been homeless', points: 0 },
          ],
        },
        {
          kind: 'radio',
          id: 'eviction',
          label: '10. Has the member experienced an eviction before?',
          required: true,
          options: [
            { value: 'evicted', label: 'Yes — received an eviction notice and was evicted', points: 3 },
            { value: 'avoided', label: 'No — received an eviction notice but avoided eviction, or currently in the eviction process', points: 1 },
            { value: 'never', label: 'No — never received an eviction notice', points: 0 },
          ],
        },
        {
          kind: 'radio',
          id: 'criminal_justice',
          label: '11. Has the member been involved with the criminal justice system?',
          required: true,
          options: [
            { value: 'past_12_months', label: 'Yes — charged with, convicted of, imprisoned for, or on probation for a criminal offense in the past 12 months', points: 2 },
            { value: 'older_or_witness', label: 'Yes — offense more than 12 months ago, and/or witness to or victim of a criminal offense reported in the past 12 months', points: 1 },
            { value: 'none', label: 'No — none of the above', points: 0 },
          ],
        },
      ],
    },
    {
      id: 'health',
      title: 'C. Health',
      description: 'Answers are self-reported or observed by the provider — a clinical diagnosis is not required.',
      fields: [
        {
          kind: 'radio',
          id: 'ed_visits',
          label: '12. Hospitalizations or emergency department visits in the last 6 months',
          required: true,
          options: [
            { value: 'gt4', label: 'More than 4 visits', points: 7 },
            { value: '2_3', label: '2 to 3 visits', points: 2 },
            { value: 'lte1', label: '1 or no visits', points: 0 },
          ],
        },
        {
          kind: 'radio',
          id: 'ipv',
          label: '13. Has the member faced intimate partner violence or domestic violence?',
          required: true,
          options: [
            { value: 'last_6_months', label: 'Within the last 6 months', points: 3 },
            { value: 'last_12_months', label: 'Within the last 12 months but not within the last 6 months', points: 2 },
            { value: 'lifetime', label: 'At some point during lifetime but not in the last 12 months', points: 1 },
            { value: 'never', label: 'No — none of the above', points: 0 },
          ],
        },
        {
          kind: 'radio',
          id: 'substance_misuse',
          label: '14. Any substance misuse (drug or alcohol) issues that make it difficult to maintain stable housing?',
          required: true,
          hint: 'Answer for the authorized member only.',
          options: [
            { value: 'yes', label: 'Yes', points: 5 },
            { value: 'no', label: 'No', points: 0 },
          ],
        },
        {
          kind: 'radio',
          id: 'mental_health',
          label: '15. Any mental health conditions that make it difficult to maintain stable housing?',
          required: true,
          options: [
            { value: 'yes', label: 'Yes', points: 2 },
            { value: 'no', label: 'No', points: 0 },
          ],
        },
        {
          kind: 'radio',
          id: 'idd',
          label: '16. Any intellectual or developmental disabilities that make it difficult to maintain stable housing?',
          required: true,
          options: [
            { value: 'yes', label: 'Yes', points: 8 },
            { value: 'no', label: 'No', points: 0 },
          ],
        },
        {
          kind: 'radio',
          id: 'pregnancy',
          label: '17. Currently pregnant, or pregnant in the last 12 months?',
          required: true,
          options: [
            { value: 'current', label: 'Currently pregnant', points: 1 },
            { value: 'last_12_months', label: 'Not currently pregnant but pregnant within the last 12 months', points: 1 },
            { value: 'no', label: 'Not currently pregnant nor pregnant in the last 12 months', points: 0 },
          ],
        },
        {
          kind: 'radio',
          id: 'chronic_health',
          label: '18. Any chronic health conditions?',
          required: true,
          options: [
            { value: 'yes', label: 'Yes', points: 1 },
            { value: 'no', label: 'No', points: 0 },
          ],
        },
        {
          kind: 'checkboxes',
          id: 'adl_iadl',
          label: '19. Does the member need assistance with ADLs or instrumental ADLs? (check all that apply; points sum)',
          options: [
            { value: 'adl', label: 'Requires assistance with at least 1 ADL (e.g., bathing, dressing, eating, using the toilet)', points: 1 },
            { value: 'iadl', label: 'Requires assistance with at least 3 IADLs (e.g., cooking, shopping, managing medication) and has a behavioral health condition or cognitive impairment', points: 1 },
          ],
        },
      ],
    },
    {
      id: 'provider_record',
      title: 'Provider Assessment Record',
      description: 'Required — completed by the case manager who administered the assessment.',
      fields: [
        { kind: 'text', id: 'case_manager_name', label: 'Name of case manager who completed the assessment', required: true },
        { kind: 'text', id: 'provider_org', label: 'Provider organization name', required: true },
        { kind: 'date', id: 'completion_date', label: 'Date of completion', required: true },
        {
          kind: 'radio',
          id: 'service_requested',
          label: 'Service requested',
          required: true,
          options: [
            { value: 'pre_tenancy', label: 'Pre-tenancy Services' },
            { value: 'tenancy_sustaining', label: 'Tenancy Sustaining Services' },
          ],
        },
        {
          kind: 'radio',
          id: 'authorization_reason',
          label: 'Reason for authorization request',
          required: true,
          options: [
            { value: 'extend_first', label: 'Continue authorization past the first 30 days by extending the first authorization by 150 days (total 180 days; no changes to service type, provider, level of need, or MCO)' },
            { value: 'reauthorize_180', label: 'Re-authorization for an additional 180 days of service (no change in provider, level of need, service type, or MCO)' },
            { value: 'switch_provider', label: 'Authorization request to switch member’s provider' },
            { value: 'update_lon', label: 'Authorization request to update level of need' },
            { value: 'change_service', label: 'Authorization request to change type of services (e.g., Pre-tenancy to Tenancy Sustaining)' },
            { value: 'switch_mco', label: 'Authorization request due to member switching MCOs' },
            { value: 'other', label: 'Other (specify below)' },
          ],
        },
        { kind: 'textarea', id: 'authorization_reason_other', label: 'If other, please specify' },
      ],
    },
  ],
  scoring: (data) => {
    const breakdown: { label: string; points: number }[] = [];
    let total = 0;

    const dob = data.dob as string | undefined;
    if (dob) {
      const birth = new Date(dob);
      if (!Number.isNaN(birth.getTime())) {
        const now = new Date();
        let age = now.getFullYear() - birth.getFullYear();
        const beforeBirthday =
          now.getMonth() < birth.getMonth() ||
          (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
        if (beforeBirthday) age -= 1;
        if (age < 18 || age > 60) {
          total += 1;
          breakdown.push({ label: `Age ${age} (under 18 or over 60)`, points: 1 });
        }
      }
    }

    for (const section of LEVEL_OF_NEED_TEMPLATE.sections) {
      for (const field of section.fields) {
        if (field.kind === 'radio' && 'options' in field) {
          const chosen = field.options.find((o) => o.value === data[field.id]);
          if (chosen?.points) {
            total += chosen.points;
            breakdown.push({ label: field.label, points: chosen.points });
          }
        }
        if (field.kind === 'checkboxes' && 'options' in field) {
          const selected = (data[field.id] as string[]) ?? [];
          for (const option of field.options) {
            if (option.points && selected.includes(option.value)) {
              total += option.points;
              breakdown.push({ label: option.label, points: option.points });
            }
          }
        }
      }
    }

    return {
      total,
      category: total >= 18 ? 'High level of need' : 'Low level of need',
      breakdown,
    };
  },
  validate: (data) => {
    const errors: string[] = [];
    if (data.authorization_reason === 'other' && !String(data.authorization_reason_other ?? '').trim()) {
      errors.push('Please specify the "Other" reason for the authorization request.');
    }
    return errors;
  },
};

/* ------------------------------------------------------------------ */
/* Housing Stabilization Plan                                          */
/* ------------------------------------------------------------------ */

export const HOUSING_STABILIZATION_TEMPLATE: FormTemplate = {
  formType: 'Housing Stabilization Plan',
  intro:
    'Completed with the member (or parent/guardian for children) on or after the first date of authorized services, and submitted within the first 30 days of service. Update at least once every 180 days during reauthorization, or when the member’s condition meaningfully changes. For reauthorization, the plan must show clear accomplishments or progress in the past 180 days.',
  sections: [
    {
      id: 'header',
      title: 'Member & Provider Information',
      fields: [
        { kind: 'text', id: 'member_name', label: 'Member name', required: true },
        { kind: 'date', id: 'plan_date', label: 'Date', required: true },
        { kind: 'text', id: 'medicaid_id', label: 'Medicaid ID', required: true },
        { kind: 'text', id: 'hmis_id', label: 'NJ HMIS ID' },
        { kind: 'date', id: 'next_review', label: 'Next scheduled review', required: true },
        { kind: 'text', id: 'provider', label: 'Housing Supports provider', required: true },
        { kind: 'text', id: 'case_manager_name', label: 'Provider case manager name', required: true },
        { kind: 'phone', id: 'case_manager_phone', label: 'Provider case manager phone', required: true },
        { kind: 'email', id: 'case_manager_email', label: 'Provider case manager e-mail', required: true },
        {
          kind: 'radio',
          id: 'general_goal',
          label: 'This plan is focused on the following general goal (select one based on current situation/needs)',
          required: true,
          options: [
            { value: 'pre_tenancy', label: 'Helping me/my family find safe, stable housing (Pre-tenancy Services)' },
            { value: 'tenancy_sustaining', label: 'Helping me/my family stabilize in new or current housing once secured (Tenancy Sustaining Services)' },
          ],
        },
        {
          kind: 'textarea',
          id: 'overall_goal',
          label: 'What is your overall goal for housing?',
          required: true,
          hint: 'Required — please limit to a couple of sentences.',
        },
      ],
    },
    {
      id: 'housing_search',
      title: 'i. Housing Search / Stabilization and Retention',
      description: 'Please complete all information in this section, including relevant actions from individuals across the household.',
      fields: [
        {
          kind: 'textarea',
          id: 'housing_next_steps',
          label: 'What are the next steps for obtaining housing or immediate stabilization where the member is living?',
          required: true,
        },
        {
          kind: 'table',
          id: 'housing_activities',
          label: 'Housing search/stabilization and retention activities',
          columns: GOAL_GRID_COLUMNS,
          addLabel: 'Add activity',
        },
      ],
    },
    {
      id: 'income',
      title: 'ii. Income / Expenses / Other Resources',
      description: 'Please complete all information in this section, including relevant activities for individuals across the household.',
      fields: [
        {
          kind: 'currency',
          id: 'income_goal_individual',
          label: 'Overall monthly income goal — individual ($)',
          required: true,
          hint: 'May be $0 if other household members are expected to earn income.',
        },
        {
          kind: 'currency',
          id: 'income_goal_household',
          label: 'Overall monthly income goal — total household ($)',
          required: true,
        },
        {
          kind: 'table',
          id: 'income_activities',
          label: 'Income/expenses/other resources activities',
          columns: GOAL_GRID_COLUMNS,
          addLabel: 'Add activity',
        },
      ],
    },
    {
      id: 'health_needs',
      title: 'iii. Health Needs',
      description:
        'Include mental health and substance use needs, and any relevant needs from individuals across the household that may impact the ability to obtain and maintain housing.',
      fields: [
        {
          kind: 'textarea',
          id: 'health_needs',
          label:
            'What health needs does the member need assistance with to be successful in obtaining a home, stabilizing their living situation, and/or meeting other important needs?',
          required: true,
        },
        {
          kind: 'table',
          id: 'health_activities',
          label: 'Health needs activities',
          columns: GOAL_GRID_COLUMNS,
          addLabel: 'Add activity',
        },
      ],
    },
    {
      id: 'notes_signatures',
      title: 'Notes & Signatures',
      description:
        'Member signature may be left blank if the member is under 18; in that case only the parent/guardian signs. Case managers must maintain minimum monthly touchpoints (2× for lower level of need, 4× for higher) documented in NJ HMIS or an HMIS-comparable system.',
      fields: [
        { kind: 'textarea', id: 'notes', label: 'Notes' },
        { kind: 'text', id: 'member_signature_name', label: 'Member signature (name)' },
        { kind: 'date', id: 'member_signature_date', label: 'Member signature date' },
        { kind: 'text', id: 'guardian_signature_name', label: 'Parent/Guardian signature (name — only if member is under 18)' },
        { kind: 'date', id: 'guardian_signature_date', label: 'Parent/Guardian signature date' },
      ],
    },
  ],
  validate: (data) => {
    const errors: string[] = [];
    if (
      !String(data.member_signature_name ?? '').trim() &&
      !String(data.guardian_signature_name ?? '').trim()
    ) {
      errors.push('Enter the member signature name, or the parent/guardian signature name for members under 18.');
    }
    return errors;
  },
};

export const FORM_TEMPLATES: Partial<Record<FormType, FormTemplate>> = {
  'Initial Assessment Tool': INITIAL_ASSESSMENT_TEMPLATE,
  'Level of Need Assessment Tool': LEVEL_OF_NEED_TEMPLATE,
  'Housing Stabilization Plan': HOUSING_STABILIZATION_TEMPLATE,
};

export const TEMPLATE_FORM_TYPES = Object.keys(FORM_TEMPLATES) as FormType[];

/** Format a stored answer for read-only display. */
export const formatFieldValue = (field: FieldDef, value: FieldValue | undefined): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (field.kind === 'radio' || field.kind === 'select') {
    return field.options.find((o) => o.value === value)?.label ?? String(value);
  }
  if (field.kind === 'checkboxes') {
    const selected = value as string[];
    if (!selected.length) return '—';
    return field.options
      .filter((o) => selected.includes(o.value))
      .map((o) => o.label)
      .join('; ');
  }
  if (field.kind === 'currency') return `$${value}`;
  return String(value);
};
