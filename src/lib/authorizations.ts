// Repeatable authorization model.
//
// A case can collect any number of authorizations over its life: one initial
// 30-day period, one 150-day continuation, then 180-day reauthorizations that
// repeat indefinitely. `client_authorizations` is the record of all of them.
//
// The legacy authorization columns on `clients` are still what billing and
// touchpoint generation read, so every authorization recorded through the app
// is ALSO mirrored into those columns (most recent reauthorization wins). That
// keeps the transition non-destructive in both directions.
import { supabase } from '@/integrations/supabase/client';

export const AUTHORIZATION_TYPES = [
  'initial_30',
  'continuation_150',
  'reauthorization_180',
  'other',
] as const;

export type AuthorizationType = (typeof AUTHORIZATION_TYPES)[number];

export const AUTHORIZATION_TYPE_LABEL: Record<string, string> = {
  initial_30: 'Initial 30-day',
  continuation_150: 'Continuation (150-day)',
  reauthorization_180: 'Reauthorization (180-day)',
  other: 'Other',
};

export const AUTHORIZATION_STATUSES = [
  'pending',
  'active',
  'denied',
  'expired',
  'superseded',
  'cancelled',
] as const;

export type AuthorizationStatus = (typeof AUTHORIZATION_STATUSES)[number];

export const AUTHORIZATION_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  active: 'Active',
  denied: 'Denied',
  expired: 'Expired',
  superseded: 'Superseded',
  cancelled: 'Cancelled',
};

export const AUTHORIZATION_STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-900',
  active: 'bg-green-100 text-green-800',
  denied: 'bg-red-100 text-red-800',
  expired: 'bg-muted text-muted-foreground',
  superseded: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground',
};

export interface ClientAuthorization {
  id: string;
  client_id: string;
  authorization_type: string;
  sequence_number: number;
  mco: string | null;
  service_type: string | null;
  authorization_number: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  lon_score: number | null;
  level_of_need: string | null;
  billing_modifier: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
}

/** How long each authorization type runs, in days, when no end date is given. */
export const AUTHORIZATION_LENGTH_DAYS: Record<string, number> = {
  initial_30: 30,
  continuation_150: 150,
  reauthorization_180: 180,
};

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export function defaultEndDate(type: string, startDate: string): string | null {
  const len = AUTHORIZATION_LENGTH_DAYS[type];
  if (!len) return null;
  return addDays(startDate, len - 1);
}

/** Status implied purely by the period, used for backfilled and new rows. */
export function statusForPeriod(start: string | null, end: string | null): AuthorizationStatus {
  if (!start) return 'pending';
  const today = new Date().toISOString().slice(0, 10);
  if (start > today) return 'pending';
  if (end && end < today) return 'expired';
  return 'active';
}

export async function fetchClientAuthorizations(clientId: string): Promise<ClientAuthorization[]> {
  const { data, error } = await supabase
    .from('client_authorizations')
    .select('*')
    .eq('client_id', clientId)
    .order('start_date', { ascending: true, nullsFirst: false })
    .order('sequence_number', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ClientAuthorization[]) ?? [];
}

/** The authorization currently covering services, if any. */
export function currentAuthorization(rows: ClientAuthorization[]): ClientAuthorization | null {
  const active = rows.filter((r) => r.status === 'active');
  if (!active.length) return null;
  return active.reduce((latest, r) =>
    (r.start_date ?? '') > (latest.start_date ?? '') ? r : latest,
  );
}

/** Days until an authorization lapses; null when there is no end date. */
export function daysUntilEnd(auth: ClientAuthorization | null): number | null {
  if (!auth?.end_date) return null;
  const end = new Date(`${auth.end_date}T00:00:00`).getTime();
  const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  return Math.round((end - today) / 86_400_000);
}

/** True when the case should be preparing a reauthorization request. */
export function needsReauthorization(rows: ClientAuthorization[]): boolean {
  const current = currentAuthorization(rows);
  if (!current) return false;
  if (current.authorization_type === 'initial_30') return false;
  const days = daysUntilEnd(current);
  return days !== null && days <= 45;
}

export interface RecordAuthorizationInput {
  clientId: string;
  type: AuthorizationType;
  startDate: string;
  endDate?: string | null;
  authorizationNumber?: string | null;
  mco?: string | null;
  serviceType?: string | null;
  levelOfNeed?: string | null;
  lonScore?: number | null;
  receivedAt?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  /** Skip writing the legacy columns (used by preview / practice flows). */
  mirrorLegacy?: boolean;
}

export interface RecordAuthorizationResult {
  authorization: ClientAuthorization;
  sequenceNumber: number;
}

/**
 * Create the next authorization of a type. Reauthorizations increment their
 * sequence number so a client can have a 2nd, 3rd, nth 180-day period without
 * any new columns; earlier active rows of the same type become superseded.
 */
export async function recordAuthorization(
  input: RecordAuthorizationInput,
): Promise<RecordAuthorizationResult> {
  const end = input.endDate || defaultEndDate(input.type, input.startDate);

  const { data: existing, error: seqError } = await supabase
    .from('client_authorizations')
    .select('id, sequence_number, status')
    .eq('client_id', input.clientId)
    .eq('authorization_type', input.type)
    .order('sequence_number', { ascending: false });
  if (seqError) throw new Error(seqError.message);

  const sequenceNumber = (existing?.[0]?.sequence_number ?? 0) + 1;

  const { data: inserted, error: insertError } = await supabase
    .from('client_authorizations')
    .insert({
      client_id: input.clientId,
      authorization_type: input.type,
      sequence_number: sequenceNumber,
      authorization_number: input.authorizationNumber || null,
      start_date: input.startDate,
      end_date: end,
      status: statusForPeriod(input.startDate, end),
      mco: input.mco || null,
      service_type: input.serviceType || null,
      level_of_need: input.levelOfNeed || null,
      lon_score: input.lonScore ?? null,
      received_at: input.receivedAt || null,
      notes: input.notes || null,
      created_by: input.createdBy || null,
    })
    .select('*')
    .single();
  if (insertError) throw new Error(insertError.message);

  // Anything earlier of the same type is no longer the operative authorization.
  const supersede = (existing ?? []).filter((r) => r.status === 'active' || r.status === 'pending');
  if (supersede.length) {
    const { error: supersedeError } = await supabase
      .from('client_authorizations')
      .update({ status: 'superseded' })
      .in(
        'id',
        supersede.map((r) => r.id),
      );
    if (supersedeError) throw new Error(supersedeError.message);
  }

  if (input.mirrorLegacy !== false) {
    await mirrorAuthorizationToLegacyColumns(input.clientId, input.type, {
      authorizationNumber: input.authorizationNumber || null,
      startDate: input.startDate,
      endDate: end,
    });
  }

  return { authorization: inserted as ClientAuthorization, sequenceNumber };
}

/**
 * Copy the confirmed authorization values into the legacy `clients` columns
 * that billing cycles and touchpoint generation still read from.
 */
export async function mirrorAuthorizationToLegacyColumns(
  clientId: string,
  type: AuthorizationType,
  values: { authorizationNumber: string | null; startDate: string; endDate: string | null },
): Promise<void> {
  const stamp = new Date().toISOString();
  let payload: Record<string, unknown>;

  if (type === 'initial_30') {
    payload = {
      auth_30_number: values.authorizationNumber,
      auth_30_start: values.startDate,
      auth_30_end: values.endDate,
      initial_authorization_status: 'active',
      workflow_stage: 'initial_30_active',
      workflow_stage_updated_at: stamp,
    };
  } else if (type === 'continuation_150') {
    payload = {
      auth_150_number: values.authorizationNumber,
      auth_150_start: values.startDate,
      auth_150_end: values.endDate,
      continuation_authorization_status: 'active',
      workflow_stage: 'active_authorization',
      workflow_stage_updated_at: stamp,
    };
  } else if (type === 'reauthorization_180') {
    // Only the most recent reauthorization is mirrored; the full history lives
    // in client_authorizations.
    payload = {
      auth_180_number: values.authorizationNumber,
      auth_180_start: values.startDate,
      auth_180_end: values.endDate,
      auth_180_approved: true,
      workflow_stage: 'active_authorization',
      workflow_stage_updated_at: stamp,
    };
  } else {
    return;
  }

  const { error } = await supabase.from('clients').update(payload).eq('id', clientId);
  if (error) throw new Error(error.message);
}

export const formatAuthDate = (d?: string | null) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString() : '—';
