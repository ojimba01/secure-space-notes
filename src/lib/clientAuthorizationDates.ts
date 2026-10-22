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
  { field: 'iat_date', start: 'auth_30_start', end: 'auth_30_end', number: 'auth_30_number', days: 30, type: 'initial_30', phase: 'Initial 30-Day' },
  { field: 'hsp_150_date', start: 'auth_150_start', end: 'auth_150_end', number: 'auth_150_number', days: 150, type: 'continuation_150', phase: '150-Day' },
  { field: 'hsp_180_date', start: 'auth_180_start', end: 'auth_180_end', number: 'auth_180_number', days: 180, type: 'reauthorization_180', phase: '180-Day' },
] as const;

export type ClearedPeriod = {
  type: (typeof periods)[number]['type'];
  phase: (typeof periods)[number]['phase'];
  /** The form field holding this authorization's number. */
  numberField: (typeof periods)[number]['number'];
  label: string;
};

/**
 * The authorizations whose start date was emptied on the form: the person
 * saving means to remove a date entered by mistake. saveClientEdit cancels
 * their history record so nothing is left behind.
 */
export function clearedAuthorizations(client: ClientDates, values: ClientDates): ClearedPeriod[] {
  return periods
    .filter((p) => !values[p.field] && !!client[p.start])
    .map((p) => ({ type: p.type, phase: p.phase, numberField: p.number, label: `${p.days}-day` }));
}

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
  const patch: Record<string, string | boolean | null> = {};
  for (const period of periods) {
    const next = values[period.field] || '';
    const changed = next !== original[period.field];
    // Repair older HSP-only records on Save without replacing an existing
    // authorization from a stale HSP field during unrelated edits.
    const missingAuthorization = !!next && !client[period.start];
    if (!changed && !missingAuthorization) continue;
    patch[period.field] = next || null;
    patch[period.start] = next || null;
    patch[period.end] = next ? addDays(next, period.days - 1) : null;
    // Otherwise the database fills a cleared 180-day start straight back in
    // from the 150-day one (set_billing_authorization_dates).
    if (!next && period.type === 'reauthorization_180') patch.auth_180_approved = null;
  }
  return patch;
}
