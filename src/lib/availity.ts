// Availity staging.
//
// Eligibility checks and claims are filed on Availity's own website, not here.
// Rather than have the billing person read one screen and retype it into
// another, the app mirrors each Availity page field for field, in the same
// order, already filled in, with a copy button beside every box.
//
// Nothing is submitted to Availity from this app. It is a copy source.

import { supabase } from '@/integrations/supabase/client';
import {
  daysToFinalDeadline,
  finalDeadlineFor,
  hasCycleEnded,
  isCycleResolved,
  rateForLevel,
  todayAgency,
  type BillingCycle,
} from '@/lib/billing';
import type { ClientAuthorization } from '@/lib/authorizations';

export const AVAILITY_SETTINGS_KEY = 'availity_provider';

export interface AvailityProviderSettings {
  /** The "Organization" dropdown, on both pages. */
  organization: string;
  /** The provider as Availity lists it, also used for the last-name boxes. */
  providerName: string;
  contactName: string;
  specialtyCode: string;
  providerNpi: string;
  providerEin: string;
  addressLine1: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  fax: string;
  /** Line-level modifier on H0044 when the authorization does not set one. */
  defaultModifier: string;
  /** MCO on the client record → the exact Payer entry on the eligibility page. */
  payersEligibility: Record<string, string>;
  /** MCO on the client record → the exact Payer entry on the claims page. */
  payersClaims: Record<string, string>;
}

export const EMPTY_SETTINGS: AvailityProviderSettings = {
  organization: '',
  providerName: '',
  contactName: '',
  specialtyCode: '',
  providerNpi: '',
  providerEin: '',
  addressLine1: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  fax: '',
  defaultModifier: '',
  payersEligibility: {},
  payersClaims: {},
};

/** Which of the provider fields have to be filled in before a claim is usable. */
export const REQUIRED_PROVIDER_FIELDS: (keyof AvailityProviderSettings)[] = [
  'organization',
  'providerName',
  'providerNpi',
  'providerEin',
  'addressLine1',
  'city',
  'zip',
];

export async function loadAvailitySettings(): Promise<AvailityProviderSettings> {
  const { data, error } = await supabase
    .from('compliance_settings')
    .select('value')
    .eq('key', AVAILITY_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data?.value || typeof data.value !== 'object') return EMPTY_SETTINGS;
  const value = data.value as Partial<AvailityProviderSettings>;
  return { ...EMPTY_SETTINGS, ...value };
}

/** Admin-only, enforced by the settings table's policy. */
export async function saveAvailitySettings(settings: AvailityProviderSettings): Promise<void> {
  const { error } = await supabase
    .from('compliance_settings')
    .update({ value: settings as never })
    .eq('key', AVAILITY_SETTINGS_KEY);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Shared field shapes
// ---------------------------------------------------------------------------

export const RELATIONSHIP_OPTIONS = ['Self', 'Spouse', 'Child', 'Other Adult'] as const;
export type Relationship = (typeof RELATIONSHIP_OPTIONS)[number];

export const GENDER_OPTIONS = ['Female', 'Male'] as const;
export type AvailityGender = (typeof GENDER_OPTIONS)[number];

export interface AvailityField {
  label: string;
  value: string;
  /** True when Availity marks the field with a red asterisk. */
  required?: boolean;
  /** Why the value looks like it does, or what to check. */
  note?: string;
  /** What is missing, when the app cannot fill the field. */
  missing?: string;
}

export interface AvailitySection {
  title: string;
  fields: AvailityField[];
}

export interface AvailityClient {
  first_name: string;
  last_name: string;
  member_id: string | null;
  date_of_birth: string | null;
  address?: string | null;
  insurance: string | null;
  level_of_need?: string | null;
}

/** MM/DD/YYYY, the format every Availity date box uses. */
export function usDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return `${m}/${d}/${y}`;
}

// ---------------------------------------------------------------------------
// Page 1 — Eligibility and Benefits
// ---------------------------------------------------------------------------

export const PATIENT_SEARCH_OPTION = 'Patient ID, Date of Birth';

/**
 * The service type eligibility is checked under. Housing supports have no entry
 * of their own in Availity's list, so Case Management is what is used.
 */
export const BENEFIT_SERVICE_TYPE = 'Case Management - CQ';

export interface EligibilityInput {
  client: AvailityClient;
  settings: AvailityProviderSettings;
  gender: AvailityGender;
  /** True when the app is guessing the gender rather than reading it. */
  genderAssumed: boolean;
  relationship: Relationship;
  /** YYYY-MM-DD. Defaults to today in the agency's timezone. */
  asOfDate?: string;
}

export function eligibilitySections({
  client,
  settings,
  gender,
  genderAssumed,
  relationship,
  asOfDate,
}: EligibilityInput): AvailitySection[] {
  const mco = client.insurance?.trim() ?? '';
  const payer = mco ? settings.payersEligibility[mco] : '';

  return [
    {
      title: 'Get Started',
      fields: [
        {
          label: 'Organization',
          required: true,
          value: settings.organization,
          missing: settings.organization ? undefined : 'Set the organization in the agency boxes above',
        },
        {
          label: 'Payer',
          required: true,
          value: payer ?? '',
          note: payer ? `${mco} appears more than once in the list — this is the entry that works.` : undefined,
          missing: !mco
            ? 'No MCO on the client record'
            : payer
              ? undefined
              : `No eligibility payer recorded for ${mco} — add it in the agency boxes above`,
        },
      ],
    },
    {
      title: 'Provider Information',
      fields: [
        {
          label: 'Provider',
          value: settings.providerName,
          missing: settings.providerName ? undefined : 'Set the provider in the agency boxes above',
        },
        {
          label: 'Provider NPI',
          value: settings.providerNpi,
          missing: settings.providerNpi ? undefined : 'Set the NPI in the agency boxes above',
        },
        {
          label: 'Provider Tax ID',
          value: settings.providerEin,
          missing: settings.providerEin ? undefined : 'Set the EIN in the agency boxes above',
        },
        {
          label: 'Organization or Provider Last Name',
          value: settings.providerName,
          missing: settings.providerName ? undefined : 'Set the provider in the agency boxes above',
        },
        { label: 'Provider First Name', value: '', note: 'Left blank — the provider is an organisation.' },
      ],
    },
    {
      title: 'Patient Information',
      fields: [
        { label: 'Patient Search Option', value: PATIENT_SEARCH_OPTION },
        {
          label: 'Patient ID',
          required: true,
          value: client.member_id ?? '',
          missing: client.member_id ? undefined : 'No member ID on the client record',
        },
        {
          label: 'Date of Birth',
          required: true,
          value: usDate(client.date_of_birth),
          missing: client.date_of_birth ? undefined : 'No date of birth on the client record',
        },
        {
          label: 'Patient Gender',
          value: gender,
          note: genderAssumed
            ? 'Assumed — the client record does not say. Check before submitting.'
            : 'From the client intake.',
        },
        {
          label: "Patient's Relationship to Subscriber",
          value: relationship,
          note: relationship === 'Self' ? 'The default. Change it above if it is wrong.' : undefined,
        },
      ],
    },
    {
      title: 'Service Information',
      fields: [
        {
          label: 'As of Date',
          required: true,
          value: usDate(asOfDate ?? todayAgency()),
          note: 'Today, unless you are checking a past date.',
        },
        {
          label: 'Benefit / Service Type',
          required: true,
          value: BENEFIT_SERVICE_TYPE,
          note: 'Housing supports have no entry of their own, so Case Management is used.',
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Page 2 — Claims and Encounters (professional claim)
// ---------------------------------------------------------------------------

export const CLAIM_TYPE = 'Professional Claim';
export const RESPONSIBILITY_SEQUENCE = 'Primary';
export const REMIT_TO_PROVIDER = 'Y - Yes';
export const PLACE_OF_SERVICE = '12 - Home';
export const FREQUENCY_TYPE = '1 - Admit Through Discharge Claim (a)';
export const ACCEPTS_ASSIGNMENT = 'A - Assigned';
export const RELEASE_OF_INFORMATION =
  'Y - Yes Provider has a Signed Statement Permitting Release of Medical Billing Data Related to a Claim';
export const SIGNATURE_ON_FILE = 'Yes';
export const CLAIM_FILING_INDICATOR = 'MC - Medicaid';
export const COUNTRY = 'United States';
export const QUANTITY_TYPE = 'UN - Unit';

/** Housing supports. Availity fills the description in once the code is picked. */
export const PROCEDURE_CODE = 'H0044';

/**
 * The patient control number the agency uses: the client's initials followed by
 * the member ID, with no separator — Nytia Ruffin on member 233170923305 is
 * NR233170923305.
 */
export function patientControlNumber(client: AvailityClient): string {
  const initials = `${client.first_name.trim().charAt(0)}${client.last_name.trim().charAt(0)}`;
  const memberId = client.member_id?.trim() ?? '';
  if (!initials || !memberId) return '';
  return `${initials.toUpperCase()}${memberId}`;
}

export interface DiagnosisCode {
  code: string;
  description: string;
  /**
   * False for a category that has more specific codes beneath it. ICD-10-CM
   * has to be coded to the finest level available, so these are rejected on a
   * claim even though Availity lists them.
   */
  billable?: boolean;
}

/**
 * The codes the agency actually uses, in the order they are usually weighed up.
 * Which one applies is a judgement about the client, not something the app can
 * derive, so the choice is made per client and kept on the client record.
 *
 * Availity drops the decimal point: Z59.00 is typed Z5900.
 */
export const AGENCY_DIAGNOSIS_CODES: DiagnosisCode[] = [
  { code: 'Z59819', description: 'Housing instability, housed, unspecified' },
  { code: 'Z5900', description: 'Homelessness, unspecified' },
  { code: 'Z59811', description: 'Housing instability, housed, with risk of homelessness' },
  { code: 'Z5902', description: 'Unsheltered homelessness' },
  { code: 'Z5901', description: 'Sheltered homelessness' },
];

/** The rest of the Z59 family, for the cases the five above do not cover. */
export const OTHER_DIAGNOSIS_CODES: DiagnosisCode[] = [
  { code: 'Z59812', description: 'Housing instability, housed, homelessness in past 12 months' },
  { code: 'Z590', description: 'Homelessness', billable: false },
  { code: 'Z591', description: 'Inadequate housing', billable: false },
  { code: 'Z5910', description: 'Inadequate housing, unspecified' },
  { code: 'Z5911', description: 'Inadequate housing environmental temperature' },
  { code: 'Z5912', description: 'Inadequate housing utilities' },
];

export const ALL_DIAGNOSIS_CODES = [...AGENCY_DIAGNOSIS_CODES, ...OTHER_DIAGNOSIS_CODES];

export const DEFAULT_DIAGNOSIS_CODE = 'Z5900';

export function findDiagnosisCode(code: string): DiagnosisCode | undefined {
  return ALL_DIAGNOSIS_CODES.find((d) => d.code === code.trim().toUpperCase());
}

/** "Z5900 - Homelessness, unspecified", or the bare code when it is not listed. */
export function diagnosisLabel(code: string): string {
  const known = findDiagnosisCode(code);
  return known ? `${known.code} - ${known.description}` : code.trim().toUpperCase();
}

export interface BillableCycle {
  cycle: BillingCycle;
  /** cycle_end + six months: the last day this cycle can be filed. */
  deadline: string;
  daysLeft: number;
  /** False once the six-month window has closed. */
  billable: boolean;
  /** The authorization number that covers this cycle's service dates. */
  priorAuthNumber: string | null;
  /** The authorization's own modifier, when it sets one. */
  modifier: string | null;
}

/** The authorization whose dates cover a given day. */
function authorizationFor(
  authorizations: ClientAuthorization[],
  day: string,
): ClientAuthorization | null {
  return (
    authorizations.find(
      (a) => a.start_date && a.start_date <= day && (!a.end_date || a.end_date >= day),
    ) ?? null
  );
}

/**
 * Cycles that can still be filed, oldest first.
 *
 * A cycle is filed after its service period ends, and Availity will not take it
 * more than six months after that. The oldest cycle still inside that window is
 * the one closest to being lost, so it is the one the screen opens on.
 */
export function billableCycles(
  cycles: BillingCycle[],
  authorizations: ClientAuthorization[],
  today = todayAgency(),
): BillableCycle[] {
  return cycles
    .filter((c) => hasCycleEnded(c, today))
    .sort((a, b) => a.cycle_start.localeCompare(b.cycle_start))
    .map((cycle) => {
      const auth = authorizationFor(authorizations, cycle.cycle_start);
      const daysLeft = daysToFinalDeadline(cycle, today);
      return {
        cycle,
        deadline: finalDeadlineFor(cycle),
        daysLeft,
        billable: daysLeft >= 0,
        priorAuthNumber: auth?.authorization_number ?? null,
        modifier: auth?.billing_modifier ?? null,
      };
    });
}

/**
 * Which cycle to open on: the oldest one that can still be filed and has not
 * been dealt with. Falls back to the oldest still inside the window.
 */
export function defaultCycle(rows: BillableCycle[]): BillableCycle | null {
  const open = rows.filter(
    (r) => r.billable && !isCycleResolved(r.cycle) && r.cycle.billing_status !== 'Submitted',
  );
  return open[0] ?? rows.find((r) => r.billable) ?? null;
}

export interface ClaimInput {
  client: AvailityClient;
  settings: AvailityProviderSettings;
  gender: AvailityGender;
  genderAssumed: boolean;
  relationship: Relationship;
  selected: BillableCycle;
  diagnosisCode: string;
}

export function claimSections({
  client,
  settings,
  gender,
  genderAssumed,
  relationship,
  selected,
  diagnosisCode,
}: ClaimInput): AvailitySection[] {
  const mco = client.insurance?.trim() ?? '';
  const payer = mco ? settings.payersClaims[mco] : '';
  const controlNumber = patientControlNumber(client);
  const charge =
    selected.cycle.billed_amount ?? rateForLevel(client.level_of_need) ?? null;
  const modifier = selected.modifier?.trim() || settings.defaultModifier;

  const providerMissing = (value: string, field: string) =>
    value ? undefined : `Set the ${field} in the agency boxes above`;

  return [
    {
      title: 'Insurance Company / Benefit Plan Information',
      fields: [
        {
          label: 'Organization',
          value: settings.organization,
          missing: providerMissing(settings.organization, 'organization'),
        },
        { label: 'Claim Type', value: CLAIM_TYPE },
        {
          label: 'Payer',
          value: payer ?? '',
          note: payer ? `${mco}'s claims entry — worded differently from the eligibility list.` : undefined,
          missing: !mco
            ? 'No MCO on the client record'
            : payer
              ? undefined
              : `No claims payer recorded for ${mco} — add it in the agency boxes above`,
        },
        { label: 'Responsibility Sequence', value: RESPONSIBILITY_SEQUENCE },
      ],
    },
    {
      title: 'Patient Information',
      fields: [
        {
          label: 'Select a Patient',
          value: `${client.last_name}, ${client.first_name}`,
          note: 'Type this into the search. Picking the registered patient fills the boxes below.',
        },
        { label: 'Last Name', required: true, value: client.last_name },
        { label: 'First Name', required: true, value: client.first_name },
        { label: 'Middle Name', value: '' },
        { label: 'Suffix', value: '' },
        {
          label: 'Date of Birth',
          required: true,
          value: usDate(client.date_of_birth),
          missing: client.date_of_birth ? undefined : 'No date of birth on the client record',
        },
        {
          label: 'Gender',
          required: true,
          value: gender,
          note: genderAssumed ? 'Assumed — the client record does not say.' : 'From the client intake.',
        },
        { label: 'Relationship', required: true, value: relationship },
        {
          label: 'Address',
          required: true,
          value: client.address?.trim() ?? '',
          note: client.address?.trim()
            ? 'One line on the client record. Availity splits address, city, state and ZIP — separate them as you paste.'
            : undefined,
          missing: client.address?.trim() ? undefined : 'No address on the client record',
        },
        { label: 'Address 2', value: '' },
        { label: 'Country', value: COUNTRY },
      ],
    },
    {
      title: 'Subscriber Information',
      fields: [
        {
          label: 'Subscriber / Insured ID',
          required: true,
          value: client.member_id ?? '',
          missing: client.member_id ? undefined : 'No member ID on the client record',
        },
        { label: 'Group Number', value: '' },
        { label: 'Authorized Plan to Remit Payment to Provider?', required: true, value: REMIT_TO_PROVIDER },
      ],
    },
    {
      title: 'Billing Provider Information',
      fields: [
        {
          label: 'Organization / Last Name',
          required: true,
          value: settings.providerName,
          missing: providerMissing(settings.providerName, 'provider name'),
        },
        { label: 'First Name', value: '' },
        { label: 'Middle Name', value: '' },
        {
          label: 'NPI',
          required: true,
          value: settings.providerNpi,
          missing: providerMissing(settings.providerNpi, 'NPI'),
        },
        {
          label: 'EIN',
          required: true,
          value: settings.providerEin,
          missing: providerMissing(settings.providerEin, 'EIN'),
        },
        { label: 'Specialty Code', value: settings.specialtyCode },
        {
          label: 'Address',
          required: true,
          value: settings.addressLine1,
          missing: providerMissing(settings.addressLine1, 'billing address'),
        },
        { label: 'Address 2', value: '' },
        { label: 'Country', value: COUNTRY },
        {
          label: 'City',
          required: true,
          value: settings.city,
          missing: providerMissing(settings.city, 'city'),
        },
        { label: 'State', required: true, value: settings.state },
        {
          label: 'Zip Code',
          required: true,
          value: settings.zip,
          missing: providerMissing(settings.zip, 'ZIP code'),
        },
        {
          label: 'Pay-to address is the same as the billing address',
          value: 'Ticked',
          note: 'A checkbox, not a box to paste into.',
        },
      ],
    },
    {
      title: 'Contact Information',
      fields: [
        {
          label: 'Contact Name',
          required: true,
          value: settings.contactName,
          missing: providerMissing(settings.contactName, 'contact name'),
        },
        { label: 'Phone', value: settings.phone, missing: providerMissing(settings.phone, 'phone') },
        { label: 'Extension', value: '' },
        { label: 'Fax', value: settings.fax, missing: providerMissing(settings.fax, 'fax') },
        { label: 'Email', value: '' },
      ],
    },
    {
      title: 'Claim Information',
      fields: [
        {
          label: 'Patient Control Number / Claim Number',
          required: true,
          value: controlNumber,
          note: controlNumber ? "The client's initials, then the member ID." : undefined,
          missing: controlNumber ? undefined : 'No member ID on the client record',
        },
        { label: 'Place of Service', required: true, value: PLACE_OF_SERVICE, note: 'Always 12 - Home.' },
        { label: 'Frequency Type', required: true, value: FREQUENCY_TYPE },
        { label: 'Provider Accepts Assignment', required: true, value: ACCEPTS_ASSIGNMENT },
        { label: 'Release of Information', required: true, value: RELEASE_OF_INFORMATION },
        { label: 'Provider Signature on File', required: true, value: SIGNATURE_ON_FILE },
        { label: 'Claim Filing Indicator', required: true, value: CLAIM_FILING_INDICATOR },
        {
          label: 'Prior Authorization Number',
          value: selected.priorAuthNumber ?? '',
          note: selected.priorAuthNumber
            ? 'The authorization covering these service dates.'
            : undefined,
          missing: selected.priorAuthNumber
            ? undefined
            : 'No authorization number recorded for the period these dates fall in',
        },
        { label: 'Medical Record Number', value: '' },
      ],
    },
    {
      title: 'Diagnosis Codes',
      fields: [
        {
          label: 'Principal Diagnosis Code',
          required: true,
          value: diagnosisCode,
          note: `${diagnosisLabel(diagnosisCode)}. Availity drops the decimal point, so Z59.00 is typed Z5900.`,
          missing:
            findDiagnosisCode(diagnosisCode)?.billable === false
              ? `${diagnosisCode} is a category, not a billable code — choose one of the codes beneath it`
              : undefined,
        },
      ],
    },
    {
      title: 'Lines — line 1',
      fields: [
        { label: 'Service From Date', required: true, value: usDate(selected.cycle.cycle_start) },
        { label: 'Service To Date', value: usDate(selected.cycle.cycle_end) },
        { label: 'Place of Service', value: PLACE_OF_SERVICE },
        {
          label: 'Procedure Code',
          required: true,
          value: PROCEDURE_CODE,
          note: 'Type the code alone — Availity fills in the description.',
        },
        {
          label: 'Modifier',
          value: modifier,
          note: selected.modifier?.trim()
            ? 'From this authorization.'
            : 'The default. An authorization can override it.',
          missing: modifier ? undefined : 'No modifier set in the agency boxes above',
        },
        { label: 'Diagnosis Code Pointer 1', required: true, value: diagnosisCode },
        {
          label: 'Charge Amount',
          required: true,
          value: charge === null ? '' : charge.toFixed(2),
          note:
            charge === null
              ? undefined
              : selected.cycle.billed_amount !== null
                ? "This cycle's billed amount."
                : `The ${client.level_of_need ?? 'level of need'} rate.`,
          missing: charge === null ? 'No level of need, so the cycle has no rate' : undefined,
        },
        { label: 'Quantity', required: true, value: '1' },
        { label: 'Quantity Type', required: true, value: QUANTITY_TYPE },
      ],
    },
  ];
}
