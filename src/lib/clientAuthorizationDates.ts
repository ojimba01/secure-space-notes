import { addDays } from './billing';

interface ClientDates {
  iat_date?: string | null;
  hsp_150_date?: string | null;
  hsp_180_date?: string | null;
  auth_30_start?: string | null;
  auth_150_start?: string | null;
  auth_180_start?: string | null;
  auth_30_number?: string | null;
  auth_150_number?: string | null;
  auth_180_number?: string | null;
}

/** The MCO writes these with a # in front; the agency files them without. */
const cleanNumber = (raw: string | null | undefined): string =>
  (raw ?? '').replace(/^#+/, '').trim();

const numberFields = ['auth_30_number', 'auth_150_number', 'auth_180_number'] as const;

const periods = [
  { field: 'iat_date', start: 'auth_30_start', end: 'auth_30_end', days: 30 },
  { field: 'hsp_150_date', start: 'auth_150_start', end: 'auth_150_end', days: 150 },
  { field: 'hsp_180_date', start: 'auth_180_start', end: 'auth_180_end', days: 180 },
] as const;

export function editAuthorizationDates(client: ClientDates) {
  return {
    iat_date: client.iat_date || client.auth_30_start || '',
    hsp_150_date: client.hsp_150_date || client.auth_150_start || '',
    hsp_180_date: client.hsp_180_date || client.auth_180_start || '',
  };
}

export function editAuthorizationNumbers(client: ClientDates) {
  return {
    auth_30_number: cleanNumber(client.auth_30_number),
    auth_150_number: cleanNumber(client.auth_150_number),
    auth_180_number: cleanNumber(client.auth_180_number),
  };
}

/**
 * The authorization numbers, written on the same terms as the dates.
 *
 * A number is the thing an MCO is billed against, so it belongs beside the
 * date it applies to rather than only in the Authorizations tab. Only changed
 * fields are written, for the same reason the dates are: a form loaded an hour
 * ago should not overwrite a number somebody recorded since.
 *
 * Clearing one is allowed, unlike clearing a start date — a number entered
 * wrongly has to be removable, and removing it does not end an authorization.
 */
export function authorizationNumberPatch(client: ClientDates, values: ClientDates) {
  const original = editAuthorizationNumbers(client);
  const patch: Record<string, string | null> = {};
  for (const field of numberFields) {
    const next = cleanNumber(values[field]);
    if (next === original[field]) continue;
    patch[field] = next || null;
  }
  return patch;
}

/** Update the complete period; database triggers only fill missing end dates. */
export function authorizationDatePatch(client: ClientDates, values: ClientDates) {
  const original = editAuthorizationDates(client);
  const patch: Record<string, string | null> = {};
  for (const period of periods) {
    const next = values[period.field] || '';
    const changed = next !== original[period.field];
    // Repair older HSP-only records on Save without replacing an existing
    // authorization from a stale HSP field during unrelated edits.
    const missingAuthorization = !!next && !client[period.start];
    if (!changed && !missingAuthorization) continue;
    if (!next && client[period.start]) {
      throw new Error('To remove an authorization, update its status in the Authorizations tab. Its start date cannot be cleared here.');
    }
    patch[period.field] = next || null;
    patch[period.start] = next || null;
    patch[period.end] = next ? addDays(next, period.days - 1) : null;
  }
  return patch;
}
