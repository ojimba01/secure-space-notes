import { supabase } from '@/integrations/supabase/client';

/**
 * Which document types a case manager cannot see on their own clients.
 *
 * The list is the same one the database reads. It is enforced there, by the
 * `Staff read documents on their own clients` policy and its storage
 * counterpart — this module only reads and writes the setting, and lets the
 * screens leave a hidden type out of a filter that would return nothing.
 *
 * Administrators see every type regardless of what is in here.
 */
const KEY = 'staff_hidden_form_types';

interface HiddenTypesValue {
  types?: unknown;
}

const readTypes = (value: unknown): string[] => {
  const raw = (value as HiddenTypesValue | null)?.types;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === 'string');
};

/** The hidden types, or an empty list if the setting is missing or malformed. */
export async function loadHiddenFormTypes(): Promise<string[]> {
  const { data, error } = await supabase
    .from('compliance_settings')
    .select('value')
    .eq('key', KEY)
    .maybeSingle();

  // A read failure must not read as "nothing is hidden" to a caller deciding
  // what to show, so it is reported rather than swallowed.
  if (error) throw new Error(error.message);
  return readTypes(data?.value);
}

/** Admin only. Replaces the list outright. */
export async function setHiddenFormTypes(types: string[]): Promise<void> {
  const unique = [...new Set(types)].sort();
  const { error } = await supabase
    .from('compliance_settings')
    .update({ value: { types: unique } as never })
    .eq('key', KEY);
  if (error) throw new Error(error.message);
}
