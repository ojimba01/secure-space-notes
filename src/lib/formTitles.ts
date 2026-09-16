/**
 * What to call a form when the client already has one of that kind.
 *
 * A client can need the same form more than once — a second Housing
 * Stabilization Plan on a continuation, a Level of Need redone after a change
 * in circumstances, an intake retaken because the first was wrong. They are
 * separate documents, both worth keeping, and filing the second one should not
 * mean replacing the first.
 *
 * The first of a kind is called what it is. Every one after it carries the day
 * it was filed, because that is the thing a case manager actually uses to tell
 * two of them apart — "the LON from March" — and it is the same date this
 * app already puts in the downloaded filename. Two on one day are numbered,
 * which is not pretty but is at least honest about what happened.
 */

/** `2026-09-16`, on the day it is where the user is rather than in UTC. */
function dayHere(when: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`;
}

export function nextFormTitle(
  formType: string,
  /** Titles already filed for this client under this form type. */
  existing: readonly (string | null | undefined)[],
  when: Date = new Date(),
): string {
  if (existing.length === 0) return formType;

  const taken = new Set(existing.filter((t): t is string => !!t));
  const dated = `${formType} — ${dayHere(when)}`;
  if (!taken.has(dated)) return dated;

  for (let n = 2; ; n += 1) {
    const numbered = `${dated} (${n})`;
    if (!taken.has(numbered)) return numbered;
  }
}
