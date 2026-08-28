// Identifiers the MCOs use — member IDs, Medicaid IDs, authorization numbers —
// are digits. Letters and punctuation in them come from typos, from pasting a
// label along with the value, or from a spreadsheet cell that held a note.
//
// Stripping as the value is typed is deliberate: rejecting after the fact means
// someone has to work out which character was wrong.

/** Everything that is not a digit, removed. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** True when a stored identifier carries anything other than digits. */
export function hasNonDigits(value: string | null | undefined): boolean {
  return !!value && /\D/.test(value);
}

export const DIGITS_ONLY_HINT = 'Numbers only.';
