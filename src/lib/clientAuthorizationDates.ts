import { addDays } from './billing';

interface ClientDates {
  iat_date?: string | null;
  hsp_150_date?: string | null;
  hsp_180_date?: string | null;
  auth_30_start?: string | null;
  auth_150_start?: string | null;
  auth_180_start?: string | null;
}

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
