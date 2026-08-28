// The agency's client intake form, as data.
//
// One intake row per client, plus child rows for household members. A few
// answers duplicate columns the client record already has; those are written
// through when the client's field is empty, and never overwritten silently
// when it is not — see writeThroughPlan.

import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export type IntakeRow = Database['public']['Tables']['client_intakes']['Row'];
export type IntakeInsert = Database['public']['Tables']['client_intakes']['Insert'];
export type HouseholdMemberRow =
  Database['public']['Tables']['client_intake_household_members']['Row'];

/** A household member as the form edits it, before it has an id. */
export interface HouseholdMemberDraft {
  id?: string;
  name: string;
  age: string;
  relationship: string;
}

/** Everything the form holds, minus the bookkeeping columns. */
export type IntakeDraft = Omit<
  IntakeInsert,
  'id' | 'client_id' | 'created_at' | 'updated_at' | 'created_by' | 'completed_at' | 'completed_by' | 'status'
>;

export const GENDER_OPTIONS = ['Male', 'Female'] as const;
export const MARITAL_STATUS_OPTIONS = ['Single', 'Married', 'Divorced', 'Other'] as const;

export const HOUSING_STATUS_OPTIONS = [
  'At risk of homelessness',
  'Already homeless',
  'Temporarily housed',
  'Permanently housed',
  'Other',
] as const;

export const ACCOMMODATION_OPTIONS = [
  'Wheelchair accessible',
  'Walker',
  'Elevator',
  'Ground-level unit',
] as const;

export const VOUCHER_TYPE_OPTIONS = [
  'NED voucher',
  '811 Mainstream voucher',
  'TRA voucher',
  'SRAP voucher',
] as const;

export const HOUSING_TYPE_OPTIONS = [
  'Apartment',
  'Individual home',
  'Family house',
  'Other',
] as const;

export const TRANSPORTATION_OPTIONS = [
  'Personal vehicle',
  'Public transportation',
  'Family/friend',
] as const;

export const APARTMENT_TYPE_OPTIONS = [
  'Lower level / ground floor',
  'Upper level',
  'Wheelchair accessible',
  'Elevator required',
  'No preference',
] as const;

export const BEDROOM_OPTIONS = ['Studio', '1 bedroom', '2 bedrooms', '3 bedrooms', '4+ bedrooms'] as const;

/** New Jersey's counties, for Q20 and Q39. Out-of-state goes in the Other box. */
export const NJ_COUNTIES = [
  'Atlantic',
  'Bergen',
  'Burlington',
  'Camden',
  'Cape May',
  'Cumberland',
  'Essex',
  'Gloucester',
  'Hudson',
  'Hunterdon',
  'Mercer',
  'Middlesex',
  'Monmouth',
  'Morris',
  'Ocean',
  'Passaic',
  'Salem',
  'Somerset',
  'Sussex',
  'Union',
  'Warren',
] as const;

/** The six itemised expenses in Q34. The total is derived, never typed. */
export const EXPENSE_FIELDS = [
  { key: 'expense_phone', label: 'Phone' },
  { key: 'expense_car_note', label: 'Car note' },
  { key: 'expense_car_insurance', label: 'Car insurance' },
  { key: 'expense_internet', label: 'Wi-Fi / internet' },
  { key: 'expense_utilities', label: 'Utilities' },
  { key: 'expense_other', label: 'Other' },
] as const;

export function emptyIntake(): IntakeDraft {
  return {
    accommodations: [],
    counties_of_interest: [],
    transportation_types: [],
    voucher_types: [],
  };
}

/** Sum of the itemised monthly expenses, or null when none were entered. */
export function expensesTotal(draft: IntakeDraft): number | null {
  const values = EXPENSE_FIELDS.map(({ key }) => draft[key] as number | null | undefined).filter(
    (v): v is number => typeof v === 'number' && !Number.isNaN(v),
  );
  if (!values.length) return null;
  return values.reduce((sum, v) => sum + v, 0);
}

export interface LoadedIntake {
  intake: IntakeRow | null;
  household: HouseholdMemberRow[];
}

export async function loadIntake(clientId: string): Promise<LoadedIntake> {
  const { data: intake, error } = await supabase
    .from('client_intakes')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  if (!intake) return { intake: null, household: [] };

  const { data: household, error: householdError } = await supabase
    .from('client_intake_household_members')
    .select('*')
    .eq('intake_id', intake.id)
    .order('sort_order', { ascending: true });
  if (householdError) throw householdError;

  return { intake, household: household ?? [] };
}

export interface SaveIntakeArgs {
  clientId: string;
  draft: IntakeDraft;
  household: HouseholdMemberDraft[];
  profileId: string | null;
  /** True when the form is being signed off rather than saved as a draft. */
  complete: boolean;
}

/**
 * Writes the intake and its household rows. The household list is replaced
 * wholesale — it is short, and matching rows up one by one would only add ways
 * to lose one.
 */
export async function saveIntake({
  clientId,
  draft,
  household,
  profileId,
  complete,
}: SaveIntakeArgs): Promise<IntakeRow> {
  const payload: IntakeInsert = {
    ...draft,
    client_id: clientId,
    expenses_total: expensesTotal(draft),
    status: complete ? 'complete' : 'draft',
    completed_at: complete ? new Date().toISOString() : null,
    completed_by: complete ? profileId : null,
    created_by: profileId,
  };

  const { data, error } = await supabase
    .from('client_intakes')
    .upsert(payload, { onConflict: 'client_id' })
    .select()
    .single();
  if (error) throw error;

  const { error: clearError } = await supabase
    .from('client_intake_household_members')
    .delete()
    .eq('intake_id', data.id);
  if (clearError) throw clearError;

  const rows = household
    .map((m, index) => ({
      intake_id: data.id,
      name: m.name.trim(),
      age: m.age.trim() ? Number(m.age) : null,
      relationship: m.relationship.trim() || null,
      sort_order: index,
    }))
    .filter((m) => m.name.length > 0);

  if (rows.length) {
    const { error: insertError } = await supabase
      .from('client_intake_household_members')
      .insert(rows);
    if (insertError) throw insertError;
  }

  return data;
}

/**
 * Signing the intake also completes the lifecycle's intake step, which is what
 * unlocks the LoN and HSP assessments. Staff who take an intake by phone can
 * still mark that step complete on its own from the lifecycle card.
 */
export async function markLifecycleIntakeComplete(clientId: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ intake_status: 'complete', intake_completed_at: new Date().toISOString() })
    .eq('id', clientId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Write-through to the client record
// ---------------------------------------------------------------------------

/** The client columns an intake answer can populate. */
export type WriteThroughKey = 'date_of_birth' | 'member_id' | 'medicaid_id';

export interface ClientWriteThroughSource {
  date_of_birth?: string | null;
  member_id?: string | null;
  medicaid_id?: string | null;
}

export interface WriteThroughField {
  key: WriteThroughKey;
  label: string;
  /** What the intake says. */
  intakeValue: string;
  /** What the client record says, when it says anything. */
  clientValue: string | null;
}

export interface WriteThroughPlan {
  /** Client fields that are empty and can simply be filled. */
  fill: WriteThroughField[];
  /** Client fields that already hold something different. Never written automatically. */
  conflicts: WriteThroughField[];
}

const norm = (v: string | null | undefined) => (v ?? '').trim();

/**
 * What the intake would change on the client record. Empty client fields are
 * filled; fields that already disagree are reported so a person decides, because
 * member_id and medicaid_id are billing identifiers and a typo in either is
 * expensive to unpick.
 */
export function writeThroughPlan(
  draft: IntakeDraft,
  client: ClientWriteThroughSource,
): WriteThroughPlan {
  const candidates: WriteThroughField[] = [];
  const add = (key: WriteThroughKey, label: string, intakeValue: string | null | undefined) => {
    const value = norm(intakeValue);
    if (!value) return;
    const existing = norm(client[key]);
    candidates.push({
      key,
      label,
      intakeValue: value,
      clientValue: existing || null,
    });
  };

  add('date_of_birth', 'Date of birth', draft.birth_date);
  add('member_id', 'MCO number', draft.mco_number);
  add('medicaid_id', 'Medicaid number', draft.medicaid_number);

  return {
    fill: candidates.filter((c) => !c.clientValue),
    conflicts: candidates.filter((c) => c.clientValue && c.clientValue !== c.intakeValue),
  };
}

/** Applies chosen write-through values to the client record. */
export async function applyWriteThrough(
  clientId: string,
  fields: WriteThroughField[],
): Promise<void> {
  if (!fields.length) return;
  const update: Record<string, string> = {};
  fields.forEach((f) => {
    update[f.key] = f.intakeValue;
  });
  const { error } = await supabase.from('clients').update(update).eq('id', clientId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// The intake PDF's fields, mapped to this table's columns
//
// The template is the agency's own fillable form. Its field names are close to
// the column names but not identical, so the correspondence is written down
// here rather than inferred. Anything absent from these maps is not stored:
// full_name (the client record holds the name) and the two signature fields
// (the typed name and date beside them are what is kept).
// ---------------------------------------------------------------------------

/** Form field → column, for the fields whose names differ. */
export const INTAKE_FIELD_TO_COLUMN: Record<string, string> = {
  birth_certificate: 'has_birth_certificate',
  valid_id: 'has_valid_id',
  ss_card: 'has_social_security_card',
  developmental_disability_explain: 'developmental_disability_detail',
  physical_condition_explain: 'physical_condition_detail',
  mh_provider_name: 'mental_health_provider',
  mh_provider_phone: 'mental_health_provider_phone',
  income_proof: 'has_income_proof',
  income_monthly: 'income_monthly_amount',
  bank_account: 'has_bank_account',
  voucher_applied: 'applied_for_voucher',
  employed: 'currently_employed',
  employer_hours: 'hours_per_week',
  employer_wage: 'wage',
  last_hospitalization: 'last_hospitalization_date',
  benefits: 'receives_benefits',
  benefit_amount: 'benefit_monthly_amount',
  living_outside: 'living_unsheltered',
  living_outside_explain: 'living_unsheltered_detail',
  history_flags: 'has_eviction_or_record',
  history_flags_explain: 'eviction_or_record_detail',
  accommodation_needed: 'needs_accommodation',
  accom_other_text: 'accommodation_other',
  exp_phone: 'expense_phone',
  exp_car_note: 'expense_car_note',
  exp_car_insurance: 'expense_car_insurance',
  exp_internet: 'expense_internet',
  exp_utilities: 'expense_utilities',
  exp_other: 'expense_other',
  exp_total: 'expenses_total',
  app_fee_available: 'has_application_fee_funds',
  app_fee_amount: 'application_fee_amount',
  rent_budget: 'planned_monthly_rent',
  housing_self_only: 'housing_for_self_only',
  hiv_status: 'hiv_aids',
  substance_use_explain: 'substance_use_detail',
  domestic_violence: 'domestic_violence_victim',
  education_level: 'highest_grade',
  vocational_training: 'in_vocational_training',
  housing_type: 'preferred_housing_type',
  housing_type_other: 'preferred_housing_type_other',
  transportation: 'has_transportation',
  apartment_type: 'preferred_apartment_type',
  bedrooms: 'bedrooms_needed',
  household_members: 'has_household_members',
  homeless_reason: 'homelessness_cause',
  cert_client_name: 'client_signature_name',
  cert_client_date: 'client_signed_date',
  cert_staff_name: 'staff_signature_name',
  cert_staff_date: 'staff_signed_date',
};

/**
 * Tick-box groups that become one array column. Each entry is the form field
 * and the value it contributes when ticked.
 */
export const INTAKE_ARRAY_FIELDS: Record<string, { column: string; value: string }> = {
  accom_wheelchair: { column: 'accommodations', value: 'Wheelchair accessible' },
  accom_walker: { column: 'accommodations', value: 'Walker' },
  accom_elevator: { column: 'accommodations', value: 'Elevator' },
  accom_ground: { column: 'accommodations', value: 'Ground-level unit' },
  accom_other: { column: 'accommodations', value: 'Other' },
};

/** Free-text fields that each contribute one entry to an array column. */
export const INTAKE_ARRAY_TEXT_FIELDS: Record<string, string> = {
  county_1: 'counties_of_interest',
  county_2: 'counties_of_interest',
  county_3: 'counties_of_interest',
  county_4: 'counties_of_interest',
};

/** Household member rows: form prefix → child-row index. */
export const INTAKE_HOUSEHOLD_PREFIXES = ['member_1', 'member_2', 'member_3', 'member_4'];

/** The column a form field writes to, when it writes to one at all. */
export function intakeColumnFor(field: string): string | null {
  if (INTAKE_FIELD_TO_COLUMN[field]) return INTAKE_FIELD_TO_COLUMN[field];
  if (field in INTAKE_ARRAY_FIELDS) return INTAKE_ARRAY_FIELDS[field].column;
  if (field in INTAKE_ARRAY_TEXT_FIELDS) return INTAKE_ARRAY_TEXT_FIELDS[field];
  return null;
}
