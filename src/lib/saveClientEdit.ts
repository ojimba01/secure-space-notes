// Saving an edit to a client record.
//
// Lifted out of the dialog that used to own it, unchanged, so the record's own
// in-place editor and anything else that edits a client run the same path: the
// same patches, the same two synchronisation calls in the same order, the same
// retry after a partial save.
import { supabase } from '@/integrations/supabase/client';
import { syncAuthorizationsFromLegacyColumns, resyncDerivedSchedules } from '@/lib/authorizations';
import { regenerateClientCycles } from '@/lib/billingSync';
import { authorizationDatePatch, authorizationNumberPatch } from '@/lib/clientAuthorizationDates';
import { hspDueDateFor } from '@/lib/billing';

export interface ClientEditValues {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  address?: string;
  member_id?: string;
  medicaid_id?: string;
  njhmis_id?: string;
  insurance?: string;
  level_of_need?: string;
  /**
   * Left out, the column is left alone. The record no longer shows a LoN
   * score, and writing an absent one as null would erase every score on the
   * next save of a phone number.
   */
  lon_score?: string;
  county?: string;
  mco_housing_manager?: string;
  date_of_birth?: string;
  intake_date?: string;
  iat_date?: string;
  hsp_150_date?: string;
  hsp_180_date?: string;
  auth_30_number?: string;
  auth_150_number?: string;
  auth_180_number?: string;
  closed_date?: string;
  reason_closed?: string;
  /**
   * Carried through as it is, never narrowed.
   *
   * Mapping anything unrecognised to 'active' would have reopened a closed
   * case on a save that was about a phone number. Closing and reopening are
   * their own acts; this only ever writes back what it was given.
   */
  status: string;
  notes?: string;
}

export interface SaveClientEditResult {
  /** True when the authorization history and derived schedules were rebuilt. */
  rebuilt: boolean;
}

/**
 * Write the edit, then rebuild whatever it invalidated.
 *
 * The two rebuild calls run in order and neither is optional when a date or a
 * number changed: the authorization history first, then the cycles and
 * touchpoints derived from it. Doing one without the other is the most
 * repeated source of defects in this app.
 */
export interface EditableClient {
  id: string;
  level_of_need?: string | null;
  auth_30_start?: string | null;
  auth_150_start?: string | null;
  auth_180_start?: string | null;
  iat_date?: string | null;
  hsp_150_date?: string | null;
  hsp_180_date?: string | null;
  auth_30_number?: string | null;
  auth_150_number?: string | null;
  auth_180_number?: string | null;
}

export async function saveClientEdit(
  client: EditableClient,
  data: ClientEditValues,
  /** True while retrying a save that failed after the row was already written. */
  retrying = false,
): Promise<SaveClientEditResult> {
  const datePatch = authorizationDatePatch(client, data);
  const numberPatch = authorizationNumberPatch(client, data);
  const isUnited = (data.insurance ?? '').toLowerCase().includes('united');
  const derivedHspDue = hspDueDateFor(data.iat_date || client.auth_30_start || null);

  const { error } = await supabase
    .from('clients')
    .update({
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email || null,
      phone: data.phone || null,
      address: data.address || null,
      member_id: data.member_id || null,
      // The same rule for these two, so a caller that does not show them
      // cannot blank them.
      ...(data.medicaid_id !== undefined ? { medicaid_id: data.medicaid_id || null } : {}),
      ...(data.njhmis_id !== undefined ? { njhmis_id: data.njhmis_id || null } : {}),
      insurance: data.insurance || null,
      level_of_need: data.level_of_need || null,
      ...(data.lon_score !== undefined
        ? { lon_score: data.lon_score ? Number(data.lon_score) : null }
        : {}),
      county: data.county || null,
      date_of_birth: data.date_of_birth || null,
      intake_date: data.intake_date || null,
      ...datePatch,
      ...numberPatch,
      hsp_due_date: derivedHspDue,
      closed_date: data.closed_date || null,
      reason_closed: data.reason_closed || null,
      ...(isUnited ? { mco_housing_manager: data.mco_housing_manager || null } : {}),
      status: data.status,
      notes: data.notes || null,
    })
    .eq('id', client.id)
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  // A number alone is enough to need the sync: it is what the MCO is billed
  // against, and it lives on the authorization record, not here.
  const authorizationChanged =
    Object.keys(datePatch).length > 0 || Object.keys(numberPatch).length > 0;
  const billingChanged = (data.level_of_need || '') !== (client.level_of_need || '');

  // Retrying a partial save must run the synchronisation again even when the
  // client row already holds the requested date.
  if (authorizationChanged || retrying) {
    await syncAuthorizationsFromLegacyColumns(client.id);
  }
  if (authorizationChanged || billingChanged || retrying) {
    await resyncDerivedSchedules(client.id);
  }
  if (billingChanged) {
    await regenerateClientCycles(client.id).catch(() => {});
  }

  return { rebuilt: authorizationChanged || billingChanged || retrying };
}
