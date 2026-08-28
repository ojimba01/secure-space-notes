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
