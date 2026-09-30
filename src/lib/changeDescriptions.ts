// Turning audit log rows into sentences a person can read.
//
// Used by Staff activity (what somebody did) and a client's History (what was
// done to the record). The rows come from staff_activity_changes
// (docs/staff-activity.sql), which returns which fields changed and a few
// names, not the whole record.
import { supabase } from '@/integrations/supabase/client';
import { EXTERNAL_STATUS_LABEL } from '@/lib/formSigning';

export interface ChangeRow {
  id: string;
  created_at: string;
  user_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  table_name: string;
  record_id: string | null;
  client_id: string | null;
  changed: string[] | null;
  details: Record<string, string | undefined> | null;
}

export type ChangeKind = 'client' | 'document' | 'form' | 'touchpoint' | 'billing' | 'calendar' | 'staff' | 'other';

export interface DescribedChange {
  kind: ChangeKind;
  /** The sentence, without the client's name: "Edited client details: Medicaid ID". */
  text: string;
}

/** Bookkeeping the app or the document reader writes; nobody edited these. */
const IGNORED_FIELDS = new Set([
  'updated_at',
  'created_at',
  'processing_status',
  'processing_error',
  'processing_started_at',
  'processed_at',
  'extracted_text',
  'text_char_count',
  'page_count',
  'ocr_applied',
  'text_truncated',
  'fields_extracted_at',
  'fields_conflict',
  'name_matches_client',
  'search_vector',
  'file_hash',
]);

/** Tables the app keeps up to date by itself; a row there is not somebody's work. */
const IGNORED_TABLES = new Set([
  'client_month_compliance',
  'compliance_escalations',
  'document_import_batches',
  'document_import_items',
]);

const FIELD_LABEL: Record<string, string> = {
  first_name: 'First name',
  last_name: 'Last name',
  date_of_birth: 'Date of birth',
  member_id: 'Member ID',
  medicaid_id: 'Medicaid ID',
  njhmis_id: 'HMIS ID',
  diagnosis_code: 'Diagnosis code',
  assigned_employee_id: 'Case manager',
  employee_id: 'Case manager',
  hsp_submitted: 'HSP submitted',
  auth_150_number: '150-day authorization number',
  auth_180_number: '180-day authorization number',
  mco: 'MCO',
  workflow_stage: 'Stage',
  level_of_need: 'Level of need',
  closed_date: 'Closed date',
  reason_closed: 'Reason closed',
  external_status: 'MCO status',
  due_date: 'Due date',
  file_path: 'File',
  contact_date: 'Date',
  touchpoint_type: 'Touchpoint type',
  service_start: 'Start date',
  service_end: 'End date',
};

export const fieldLabel = (key: string) =>
  FIELD_LABEL[key] ??
  key
    .split('_')
    .map((w) => (w === 'id' ? 'ID' : w))
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());

/** The fields a person changed, less the bookkeeping. */
export const meaningfulFields = (row: ChangeRow) =>
  (row.changed ?? []).filter((k) => !IGNORED_FIELDS.has(k) && !k.startsWith('field_'));

const fieldList = (row: ChangeRow) => {
  const fields = meaningfulFields(row).map(fieldLabel);
  if (!fields.length) return '';
  if (fields.length > 4) return `: ${fields.slice(0, 4).join(', ')} and ${fields.length - 4} more`;
  return `: ${fields.join(', ')}`;
};

/** Null when the row is bookkeeping and should not be shown. */
export function describeChange(row: ChangeRow): DescribedChange | null {
  if (IGNORED_TABLES.has(row.table_name)) return null;
  if (row.action === 'UPDATE' && meaningfulFields(row).length === 0) return null;

  const d = row.details ?? {};
  const verb = (add: string, edit: string, remove: string) =>
    row.action === 'INSERT' ? add : row.action === 'DELETE' ? remove : edit;

  switch (row.table_name) {
    case 'clients':
      return {
        kind: 'client',
        text: verb('Added the client', `Edited client details${fieldList(row)}`, 'Deleted the client'),
      };

    case 'client_forms': {
      const name = d.title || d.form_type || 'a document';
      if (row.action === 'INSERT') {
        if (d.source === 'manual_upload') return { kind: 'document', text: `Uploaded ${name}` };
        if (d.source === 'bulk_import') return { kind: 'document', text: `Imported ${name}` };
        if (d.status === 'draft') return { kind: 'form', text: `Started a draft of ${name}` };
        return { kind: 'form', text: `Completed ${name}` };
      }
      if (row.action === 'DELETE') return { kind: 'document', text: `Removed ${name}` };
      const changed = meaningfulFields(row);
      if (changed.includes('status') && d.old_status === 'draft' && d.status !== 'draft') {
        return { kind: 'form', text: `Completed ${name}` };
      }
      if (changed.includes('external_status') && d.external_status) {
        const label = EXTERNAL_STATUS_LABEL[d.external_status] ?? d.external_status;
        return { kind: 'form', text: `Updated the MCO status of ${name} to ${label}` };
      }
      if (changed.includes('file_path')) return { kind: 'document', text: `Replaced the file for ${name}` };
      return { kind: 'document', text: `Edited ${name}${fieldList(row)}` };
    }

    case 'client_contacts': {
      const what = [d.touchpoint_type, d.modality].filter(Boolean).join(', ');
      return {
        kind: 'touchpoint',
        text: verb(
          `Logged a touchpoint${what ? ` (${what})` : ''}`,
          `Edited a touchpoint${fieldList(row)}`,
          'Removed a touchpoint',
        ),
      };
    }

    case 'client_notes':
      return { kind: 'client', text: verb('Added a note', 'Edited a note', 'Deleted a note') };

    case 'client_files': {
      const name = d.file_name || 'a file';
      return { kind: 'document', text: verb(`Uploaded ${name}`, `Edited ${name}`, `Removed ${name}`) };
    }

    case 'client_authorizations':
      return {
        kind: 'billing',
        text: verb('Added an authorization', `Updated an authorization${fieldList(row)}`, 'Removed an authorization'),
      };

    case 'billing_cycles':
      return {
        kind: 'billing',
        text: verb('Added a billing cycle', `Updated a billing cycle${fieldList(row)}`, 'Removed a billing cycle'),
      };

    case 'calendar_events': {
      const name = d.title ? `"${d.title}"` : 'an event';
      return {
        kind: 'calendar',
        text: verb(`Scheduled ${name}`, `Rescheduled or edited ${name}`, `Removed ${name} from the calendar`),
      };
    }

    case 'client_visit_availability':
      return { kind: 'client', text: 'Updated visit availability' };

    case 'profiles':
      return { kind: 'staff', text: verb('Added a staff profile', `Edited a staff profile${fieldList(row)}`, 'Removed a staff profile') };

    case 'user_roles':
      return { kind: 'staff', text: verb('Gave a staff member a role', 'Changed a staff role', 'Removed a staff role') };

    default: {
      const table = fieldLabel(row.table_name).toLowerCase();
      return { kind: 'other', text: verb(`Added to ${table}`, `Edited ${table}${fieldList(row)}`, `Removed from ${table}`) };
    }
  }
}

/** Load changes over a period, optionally for one client. */
export async function loadChanges(
  from: Date,
  to: Date,
  clientId?: string | null,
): Promise<{ rows: ChangeRow[]; error: string | null }> {
  // Newer than the generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('staff_activity_changes', {
    _from: from.toISOString(),
    _to: to.toISOString(),
    _client_id: clientId ?? null,
  });
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as ChangeRow[], error: null };
}

/** "1 h 24 min", "12 min", "Under a minute". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return 'Under a minute';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
