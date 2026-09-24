// The test account, kept out of sight.
//
// It is a real login used to try things out, so it holds cases, logs and
// touchpoints like anybody else — and it turned up in every case manager
// list, on Team touchpoints and in the case logs, where nobody could tell it
// from a person. It is hidden from all of those unless somebody turns it on
// in Advanced tools, which is remembered in this browser only.
//
// Nothing marks the account in the database, so it is known by its name: an
// account called "Test …" or "… Test", or whose email starts with "test".

const KEY = 'showTestAccounts';

export interface NamedProfile {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}

export function isTestAccount(p: NamedProfile | null | undefined): boolean {
  if (!p) return false;
  const first = (p.first_name ?? '').trim().toLowerCase();
  const last = (p.last_name ?? '').trim().toLowerCase();
  const email = (p.email ?? '').trim().toLowerCase();
  return first === 'test' || last === 'test' || email.startsWith('test');
}

export function showTestAccounts(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Turn the test account on or off, and reload so every list reads it again. */
export function setShowTestAccounts(show: boolean): void {
  try {
    if (show) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Private windows can refuse storage; the account just stays hidden.
  }
  window.location.reload();
}

/** The profiles a list should show: everybody, less the test account unless it is on. */
export function visibleProfiles<T extends NamedProfile>(rows: T[] | null | undefined): T[] {
  const all = rows ?? [];
  return showTestAccounts() ? all : all.filter((p) => !isTestAccount(p));
}

/** Ids of the test account, for lists keyed by staff id rather than holding profiles. */
export function hiddenProfileIds(rows: (NamedProfile & { id: string })[] | null | undefined): Set<string> {
  if (showTestAccounts()) return new Set();
  return new Set((rows ?? []).filter((p) => isTestAccount(p)).map((p) => p.id));
}
