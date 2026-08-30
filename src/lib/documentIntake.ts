import { supabase } from '@/integrations/supabase/client';
import { extractDocumentText } from '@/lib/documentText';
import { readFormValues } from '@/lib/documentRecognition';
import { recognizeFormType } from '@/lib/formAutofill';
import { recordFormVersion, sha256Hex } from '@/lib/formVersions';

import {
  NO_FIELDS,
  extractDocumentFields,
  fieldsFromFormValues,
  mergeDocumentFields,
  type DocumentFields,
} from '@/lib/documentFields';

/**
 * Read documents somebody has just dropped in, and say what they claim.
 *
 * The same reading the bulk importer does, on the scale of one client: a text
 * layer if the PDF has one, the PDF's own form fields either way, and the two
 * merged with the form fields winning. That order matters. On the state's
 * fillable forms the printed labels are text and the answers are not - an IAT
 * gives up a date of birth to its form fields 98% of the time and to its
 * printed text 1% of the time.
 *
 * Nothing here writes anything. It reads, and a person decides.
 */

export interface DocumentReading {
  file: File;
  formType: string | null;
  fields: DocumentFields;
  /** False for a scan: no text layer, so only its form fields were read. */
  hasText: boolean;
  error?: string;
}

/** One proposed value, and which document said it. */
export interface ProposedValue {
  /** The column on `clients` this would fill. */
  column: string;
  label: string;
  value: string;
  /** The document it came from. */
  from: string;
  /** What the client record holds now, if anything. */
  current: string | null;
}

const FIELD_TO_COLUMN: { key: keyof DocumentFields; column: string; label: string }[] = [
  { key: 'memberId', column: 'member_id', label: 'Member ID' },
  { key: 'medicaidId', column: 'medicaid_id', label: 'Medicaid ID' },
  { key: 'memberDob', column: 'date_of_birth', label: 'Date of birth' },
  { key: 'icd10Code', column: 'diagnosis_code', label: 'Diagnosis' },
];

export async function readDroppedDocuments(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<DocumentReading[]> {
  const readings: DocumentReading[] = [];

  for (const [index, file] of files.entries()) {
    try {
      const bytes = await file.arrayBuffer();
      const isPdf = file.name.toLowerCase().endsWith('.pdf');

      if (!isPdf) {
        readings.push({
          file,
          formType: null,
          fields: { ...NO_FIELDS },
          hasText: false,
          error: 'Only PDFs can be read. It will still be filed.',
        });
        continue;
      }

      // Text layer only. OCR measured at over 100 seconds for a single page,
      // which is not something to do to somebody waiting at a dialog.
      const text = await extractDocumentText(bytes, { ocr: false });
      const formValues = await readFormValues(bytes);
      const recognised = await recognizeFormType(bytes);

      readings.push({
        file,
        formType: recognised.formType,
        fields: mergeDocumentFields(
          extractDocumentFields(text.text),
          fieldsFromFormValues(formValues),
        ),
        hasText: text.text.trim().length > 0,
      });
    } catch (err: any) {
      readings.push({
        file,
        formType: null,
        fields: { ...NO_FIELDS },
        hasText: false,
        error: err.message ?? 'The document could not be read.',
      });
    } finally {
      onProgress?.(index + 1, files.length);
    }
  }

  return readings;
}

/**
 * Turn what the documents said into a list of proposals.
 *
 * The first document to give a value wins, and the document that gave it is
 * named. Where two documents disagree the second is not silently dropped: it
 * is not proposed, because a disagreement is a thing for a person to look at
 * and this list is meant to be accepted quickly.
 */
export function proposeFromReadings(
  readings: DocumentReading[],
  current: Record<string, unknown> = {},
): { proposals: ProposedValue[]; conflicts: { label: string; values: string[] }[] } {
  const proposals: ProposedValue[] = [];
  const conflicts: { label: string; values: string[] }[] = [];

  for (const { key, column, label } of FIELD_TO_COLUMN) {
    const seen = new Map<string, string>();
    for (const reading of readings) {
      const raw = reading.fields[key];
      if (raw === null || raw === undefined || raw === '') continue;
      const value = String(raw);
      if (!seen.has(value)) seen.set(value, reading.file.name);
    }
    if (seen.size === 0) continue;
    if (seen.size > 1) {
      conflicts.push({ label, values: [...seen.keys()] });
      continue;
    }
    const [value, from] = [...seen.entries()][0];
    const existing = current[column];
    proposals.push({
      column,
      label,
      value,
      from,
      current: existing === null || existing === undefined || existing === '' ? null : String(existing),
    });
  }

  return { proposals, conflicts };
}

/** The client's name as the documents give it, for a client being created. */
export function nameFromReadings(readings: DocumentReading[]): string | null {
  for (const r of readings) if (r.fields.memberName) return r.fields.memberName;
  return null;
}

/**
 * File the documents against a client and apply the accepted values.
 *
 * The documents are stored whatever happens: they are the client's paperwork
 * and belong on the record, whether or not anybody accepted a value read off
 * them.
 */
export async function applyIntake(
  clientId: string,
  profileId: string,
  readings: DocumentReading[],
  accepted: Record<string, string>,
): Promise<{ filed: number; failed: { name: string; error: string }[] }> {
  const failed: { name: string; error: string }[] = [];
  let filed = 0;

  for (const reading of readings) {
    try {
      const file = reading.file;
      const bytes = await file.arrayBuffer();
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
      const storagePath = `forms/${clientId}/${crypto.randomUUID()}${ext}`;
      const contentType = ext.toLowerCase() === '.pdf' ? 'application/pdf' : 'application/octet-stream';

      const { error: uploadError } = await supabase.storage
        .from('client-files')
        .upload(storagePath, new Blob([bytes], { type: contentType }), { contentType });
      if (uploadError) throw uploadError;

      const { data: inserted, error: insertError } = await supabase
        .from('client_forms')
        .insert({
          client_id: clientId,
          employee_id: profileId,
          form_type: reading.formType ?? 'Unsorted',
          title: file.name,
          file_path: storagePath,
          original_file_path: storagePath,
          file_size: file.size,
          file_hash: await sha256Hex(bytes),
          status: 'approved',
          external_status: 'not_applicable',
          source: 'bulk_import',
          source_filename: file.name,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      await recordFormVersion({
        clientFormId: inserted.id,
        filePath: storagePath,
        versionType: 'historical',
        createdBy: profileId,
        sourceFilename: file.name,
        fileSize: file.size,
      });
      filed += 1;
    } catch (err: any) {
      failed.push({ name: reading.file.name, error: err.message ?? String(err) });
    }
  }

  const patch = Object.fromEntries(
    Object.entries(accepted).filter(([, v]) => v !== undefined && v !== ''),
  );
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('clients').update(patch).eq('id', clientId);
    if (error) throw new Error(error.message);
  }

  return { filed, failed };
}
