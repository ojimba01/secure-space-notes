/**
 * Show a date-only value on the day it says.
 *
 * `new Date('1981-10-14')` is parsed as midnight UTC, and New Jersey is behind
 * UTC, so it renders as 13 October. Every date in this app that has no time -
 * a birthday, an intake date, an authorization start - is a plain day, and a
 * client's date of birth showing a day early is the kind of error nobody
 * queries and everybody copies onward.
 */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return new Date(y, m - 1, d).toLocaleDateString();
}
