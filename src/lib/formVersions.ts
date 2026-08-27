// Version history for form files.
//
// client_forms.file_path always points at the CURRENT file; every file the
// form has ever pointed at (including that one) has an append-only row in
// client_form_versions, so no completed/submitted PDF is ever lost when a
// form is corrected, resubmitted, or replaced.
import { supabase } from '@/integrations/supabase/client';

export type VersionType =
  | 'draft'
  | 'submitted'
  | 'sent_to_mco'
  | 'corrected'
  | 'returned'
  | 'historical';

export const VERSION_TYPE_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  sent_to_mco: 'Sent to MCO',
  corrected: 'Corrected',
  returned: 'Returned by MCO',
  historical: 'Historical import',
};

export interface FormVersion {
  id: string;
  client_form_id: string;
  file_path: string;
  version_number: number;
  version_type: string;
  source_filename: string | null;
  file_hash: string | null;
  file_size: number | null;
  note: string | null;
  created_at: string;
}

export async function fetchFormVersions(clientFormId: string): Promise<FormVersion[]> {
  const { data, error } = await supabase
    .from('client_form_versions')
    .select('*')
    .eq('client_form_id', clientFormId)
    .order('version_number', { ascending: false });
  if (error) throw new Error(error.message);
  return (data as FormVersion[]) ?? [];
}

export interface RecordVersionInput {
  clientFormId: string;
  filePath: string;
  versionType: VersionType;
  createdBy?: string | null;
  sourceFilename?: string | null;
  fileHash?: string | null;
  fileSize?: number | null;
  note?: string | null;
}

/** Append the next version row for a form. */
export async function recordFormVersion(input: RecordVersionInput): Promise<void> {
  const { data: latest, error: seqError } = await supabase
    .from('client_form_versions')
    .select('version_number')
    .eq('client_form_id', input.clientFormId)
    .order('version_number', { ascending: false })
    .limit(1);
  if (seqError) throw new Error(seqError.message);

  const versionNumber = (latest?.[0]?.version_number ?? 0) + 1;
  const { error } = await supabase.from('client_form_versions').insert({
    client_form_id: input.clientFormId,
    file_path: input.filePath,
    version_number: versionNumber,
    version_type: input.versionType,
    created_by: input.createdBy ?? null,
    source_filename: input.sourceFilename ?? null,
    file_hash: input.fileHash ?? null,
    file_size: input.fileSize ?? null,
    note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
}

/** SHA-256 of file bytes, hex-encoded — used for duplicate detection. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
