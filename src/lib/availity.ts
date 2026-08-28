// Availity staging.
//
// Eligibility checks happen on Availity's own website, not here. Rather than
// have the billing person read one screen and retype it into another, the app
// mirrors the Availity page field for field, in the same order, with the
// client's answers already filled in and a copy button beside each one.
//
// Nothing is submitted to Availity from this app. It is a copy source.

import { supabase } from '@/integrations/supabase/client';
import { todayAgency } from '@/lib/billing';

export const AVAILITY_SETTINGS_KEY = 'availity_provider';

export interface AvailityProviderSettings {
  /** The "Organization" dropdown on Availity's Get Started panel. */
  organization: string;
  /** The provider as Availity lists it, also used for the last-name box. */
  providerName: string;
  providerNpi: string;
  providerTaxId: string;
  /** MCO on the client record → the exact entry to pick in Availity's Payer list. */
  payers: Record<string, string>;
}

const EMPTY: AvailityProviderSettings = {
  organization: '',
  providerName: '',
  providerNpi: '',
  providerTaxId: '',
  payers: {},
};

export async function loadAvailitySettings(): Promise<AvailityProviderSettings> {
  const { data, error } = await supabase
    .from('compliance_settings')
    .select('value')
    .eq('key', AVAILITY_SETTINGS_KEY)
    .maybeSingle();
  if (error || !data?.value || typeof data.value !== 'object') return EMPTY;
  const value = data.value as Partial<AvailityProviderSettings>;
  return {
    organization: value.organization ?? '',
    providerName: value.providerName ?? '',
    providerNpi: value.providerNpi ?? '',
    providerTaxId: value.providerTaxId ?? '',
    payers: (value.payers as Record<string, string>) ?? {},
  };
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
// The Eligibility and Benefits page
// ---------------------------------------------------------------------------

export const RELATIONSHIP_OPTIONS = ['Self', 'Spouse', 'Child', 'Other Adult'] as const;
export type Relationship = (typeof RELATIONSHIP_OPTIONS)[number];

export const GENDER_OPTIONS = ['Female', 'Male'] as const;
export type AvailityGender = (typeof GENDER_OPTIONS)[number];

/** Availity's own wording for how the patient is looked up. */
export const PATIENT_SEARCH_OPTION = 'Patient ID, Date of Birth';

/**
 * The service type the agency's work is checked under. Housing supports do not
 * have an obvious entry in Availity's list, so Case Management is what is used
 * until that is settled.
 */
export const BENEFIT_SERVICE_TYPE = 'Case Management - CQ';

export interface AvailityClient {
  first_name: string;
  last_name: string;
  member_id: string | null;
  date_of_birth: string | null;
  insurance: string | null;
}

export interface AvailityField {
  label: string;
  value: string;
  /** True when Availity marks the field with a red asterisk. */
  required?: boolean;
  /** Why the value looks like it does, or what to check. */
  note?: string;
  /** What is missing, when the app cannot fill the field. */
  missing?: string;
  /** Fields Availity fills in itself once the provider is picked. */
  copyable?: boolean;
}

export interface AvailitySection {
  title: string;
  fields: AvailityField[];
}

/** MM/DD/YYYY, the format the Availity date boxes use. */
export function usDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return '';
  return `${m}/${d}/${y}`;
}

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

/**
 * The Eligibility and Benefits page, section by section, in Availity's order.
 */
export function eligibilitySections({
  client,
  settings,
  gender,
  genderAssumed,
  relationship,
  asOfDate,
}: EligibilityInput): AvailitySection[] {
  const mco = client.insurance?.trim() ?? '';
  const payer = mco ? settings.payers[mco] : '';

  return [
    {
      title: 'Get Started',
      fields: [
        {
          label: 'Organization',
          required: true,
          value: settings.organization,
          missing: settings.organization ? undefined : 'Set the organization in provider details',
        },
        {
          label: 'Payer',
          required: true,
          value: payer ?? '',
          note: payer
            ? `${mco} clients use this exact entry — there is more than one ${mco} in the list.`
            : undefined,
          missing: !mco
            ? 'No MCO on the client record'
            : payer
              ? undefined
              : `No Availity payer recorded for ${mco} — add it in provider details`,
        },
      ],
    },
    {
      title: 'Provider Information',
      fields: [
        {
          label: 'Provider',
          value: settings.providerName,
          missing: settings.providerName ? undefined : 'Set the provider in provider details',
        },
        {
          label: 'Provider NPI',
          value: settings.providerNpi,
          missing: settings.providerNpi ? undefined : 'Set the NPI in provider details',
        },
        {
          label: 'Provider Tax ID',
          value: settings.providerTaxId,
          missing: settings.providerTaxId ? undefined : 'Set the tax ID in provider details',
        },
        {
          label: 'Organization or Provider Last Name',
          value: settings.providerName,
          missing: settings.providerName ? undefined : 'Set the provider in provider details',
        },
        {
          label: 'Provider First Name',
          value: '',
          note: 'Left blank — the provider is an organisation.',
        },
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
