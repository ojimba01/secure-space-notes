// Where a member is moving to, and who holds the keys.
//
// The Move-in Supports Request forms ask for a handful of facts the client
// record had nowhere to put: the date somebody is expected to move, the address
// they are moving TO — not `address`, which is where they are now — and the
// landlord or realtor a deposit is paid to.
//
// None of it is required. A member with no move planned has all of it empty,
// which is the ordinary state of a client record rather than a gap in it. It is
// filled in either by hand on the record or from a submitted form, and a form
// only ever fills a column that is empty: a disagreement is put to the person
// filing it rather than settled behind them, which is the rule the intake
// already follows.
import { supabase } from '@/integrations/supabase/client';

export interface MoveInDetails {
  move_in_date: string | null;
  new_address: string | null;
  new_city_state_zip: string | null;
  apartment_complex_name: string | null;
  landlord_name: string | null;
  landlord_phone: string | null;
  landlord_email: string | null;
  realtor_name: string | null;
  realtor_phone: string | null;
  realtor_email: string | null;
}

export type MoveInKey = keyof MoveInDetails;

export const MOVE_IN_COLUMNS: MoveInKey[] = [
  'move_in_date', 'new_address', 'new_city_state_zip', 'apartment_complex_name',
  'landlord_name', 'landlord_phone', 'landlord_email',
  'realtor_name', 'realtor_phone', 'realtor_email',
];

interface FieldSpec {
  key: MoveInKey;
  label: string;
  type: 'date' | 'text' | 'tel' | 'email';
  /** What it is for, where the label alone would not say. */
  hint?: string;
}

/** The three groups the forms themselves keep these facts in. */
export const MOVE_IN_SECTIONS: { title: string; fields: FieldSpec[] }[] = [
  {
    title: 'The move',
    fields: [
      {
        key: 'move_in_date',
        label: 'Anticipated move-in date',
        type: 'date',
        hint: 'Move-in Supports must be requested within 45 days of it.',
      },
      { key: 'new_address', label: 'New address', type: 'text', hint: 'Street and apartment they are moving to.' },
      { key: 'new_city_state_zip', label: 'City, state and ZIP', type: 'text' },
      { key: 'apartment_complex_name', label: 'Apartment complex', type: 'text' },
    ],
  },
  {
    title: 'Landlord',
    fields: [
      { key: 'landlord_name', label: 'Landlord', type: 'text', hint: 'The official business name a security deposit is paid to.' },
      { key: 'landlord_phone', label: 'Telephone', type: 'tel' },
      { key: 'landlord_email', label: 'Email', type: 'email' },
    ],
  },
  {
    title: 'Realtor',
    fields: [
      { key: 'realtor_name', label: 'Realtor', type: 'text', hint: 'Where a realtor fee is being paid rather than a deposit.' },
      { key: 'realtor_phone', label: 'Telephone', type: 'tel' },
      { key: 'realtor_email', label: 'Email', type: 'email' },
    ],
  },
];

export const emptyMoveIn = (): MoveInDetails =>
  Object.fromEntries(MOVE_IN_COLUMNS.map((k) => [k, null])) as unknown as MoveInDetails;

export async function loadMoveIn(clientId: string): Promise<MoveInDetails> {
  const { data, error } = await supabase
    .from('clients')
    .select(MOVE_IN_COLUMNS.join(', '))
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { ...emptyMoveIn(), ...((data ?? {}) as Partial<MoveInDetails>) };
}

export async function saveMoveIn(clientId: string, details: MoveInDetails): Promise<void> {
  const payload = Object.fromEntries(
    MOVE_IN_COLUMNS.map((k) => [k, (details[k] ?? '').toString().trim() || null]),
  );
  const { error } = await supabase.from('clients').update(payload).eq('id', clientId);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// The Move-in Supports Request form, in both directions
// ---------------------------------------------------------------------------

/**
 * Column → the form field that carries it.
 *
 * Read the other way round, this is also what a submitted form can tell the
 * client record. The form's field names are pinned in
 * `scripts/move-in/place-fields.py` precisely so this map can rely on them.
 */
export const MOVE_IN_FORM_FIELDS: Record<MoveInKey, string> = {
  move_in_date: 'anticipated_move_in_date',
  new_address: 'new_street_address',
  new_city_state_zip: 'new_city_town_zip',
  apartment_complex_name: 'apartment_complex_name',
  landlord_name: 'name_of_landlord',
  landlord_phone: 'landlord_phone',
  landlord_email: 'landlord_email',
  realtor_name: 'name_of_realtor',
  realtor_phone: 'realtor_phone',
  realtor_email: 'realtor_email',
};

/** What a submitted form says about the move, keyed by column. */
export function moveInFromFormFields(raw: Record<string, string>): Partial<MoveInDetails> {
  const out: Partial<MoveInDetails> = {};
  for (const key of MOVE_IN_COLUMNS) {
    const value = (raw[MOVE_IN_FORM_FIELDS[key]] ?? '').trim();
    if (!value) continue;
    out[key] = key === 'move_in_date' ? isoDate(value) ?? null : value;
  }
  return out;
}

export interface MoveInConflict {
  key: MoveInKey;
  label: string;
  formValue: string;
  recordValue: string;
}

export interface MoveInWriteBack {
  /** Columns the form can fill, because the record has nothing there. */
  fill: Partial<MoveInDetails>;
  /** Columns where the two disagree. Reported, never overwritten. */
  conflicts: MoveInConflict[];
}

const LABELS: Record<MoveInKey, string> = Object.fromEntries(
  MOVE_IN_SECTIONS.flatMap((s) => s.fields.map((f) => [f.key, f.label])),
) as Record<MoveInKey, string>;

export function moveInWriteBack(
  fromForm: Partial<MoveInDetails>,
  onRecord: Partial<MoveInDetails>,
): MoveInWriteBack {
  const fill: Partial<MoveInDetails> = {};
  const conflicts: MoveInConflict[] = [];

  for (const key of MOVE_IN_COLUMNS) {
    const formValue = (fromForm[key] ?? '').toString().trim();
    if (!formValue) continue;
    const recordValue = (onRecord[key] ?? '').toString().trim();
    if (!recordValue) fill[key] = formValue;
    else if (recordValue !== formValue) {
      conflicts.push({ key, label: LABELS[key] ?? key, formValue, recordValue });
    }
  }
  return { fill, conflicts };
}

/** `10/01/2026` or `2026-10-01` as a date column will take it, or null. */
function isoDate(value: string): string | null {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return trimmed.slice(0, 10);
  const us = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!us) return null;
  const [, m, d, y] = us;
  const year = y.length === 2 ? `20${y}` : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
