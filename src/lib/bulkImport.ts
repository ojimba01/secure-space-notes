// Deterministic bulk-import engine for historical client documents.
//
// No AI/OCR anywhere in this path: files are matched to clients with exact
// signals in strict priority order (manifest member ID → PDF form-field member
// ID → name+DOB → folder/filename), and official templates are recognised by
// their AcroForm field fingerprints. Anything weaker than an exact signal
// stays in review; nothing is ever auto-linked from a guess.
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { startDocumentQueue } from '@/lib/documentQueue';
import {
  classifyFilename,
  identityFromFields,
  recognizeDocument,
} from '@/lib/documentRecognition';
import { recordFormVersion, sha256Hex } from '@/lib/formVersions';

export interface StagedFile {
  /** Relative path inside the upload (ZIP path or webkitRelativePath). */
  path: string;
  name: string;
  bytes: ArrayBuffer;
  size: number;
  hash: string;
}

export interface ManifestRow {
  source_file: string;
  client_name?: string;
  first_name?: string;
  last_name?: string;
  date_of_birth?: string;
  member_id?: string;
  mco?: string;
  form_type?: string;
  form_date?: string;
  authorization_type?: string;
  authorization_number?: string;
  authorization_start?: string;
  authorization_end?: string;
  assigned_staff?: string;
  external_status?: string;
  service_type?: string;
  lon_score?: string;
  njhmis_id?: string;
  diagnosis_code?: string;
  notes?: string;
}

export interface MatchClient {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  member_id: string | null;
  insurance: string | null;
}

export type Confidence = 'high' | 'medium' | 'low' | 'conflict';

export interface ProposedItem {
  /** document_import_items row id, set once the batch is persisted. */
  itemId?: string;
  file: StagedFile;
  proposedClientId: string | null;
  proposedFormType: string | null;
  /** How the document type was determined, for the review table. */
  typeBasis: string | null;
  /**
   * Strength of the DOCUMENT TYPE guess, tracked separately from the client
   * match. A filename can name the right client and still mislabel the form,
   * so both must be strong before a row is safe to bulk accept.
   */
  typeConfidence: 'high' | 'medium' | 'low' | 'none';
  /** No form fields and no text layer — only OCR could identify this. */
  needsOcr: boolean;
  proposedMco: string | null;
  proposedDate: string | null;
  detectedMemberId: string | null;
  confidence: Confidence;
  matchReason: string;
  issue: string | null;
  manifestRow: ManifestRow | null;
  duplicateOfFormId: string | null;
}

const MAX_FILE_BYTES = 50 * 1024 * 1024;

/**
 * Expand a user selection into individual files: ZIPs are unpacked (nested
 * folders preserved as paths), everything else passes through. Hidden and
 * zero-byte entries are skipped.
 */
export async function expandFiles(
  files: File[],
): Promise<{ staged: StagedFile[]; skipped: string[] }> {
  const staged: StagedFile[] = [];
  const skipped: string[] = [];

  const push = async (path: string, name: string, bytes: ArrayBuffer) => {
    if (bytes.byteLength === 0) {
      skipped.push(`${path} (empty file)`);
      return;
    }
    if (bytes.byteLength > MAX_FILE_BYTES) {
      skipped.push(`${path} (larger than 50 MB)`);
      return;
    }
    staged.push({ path, name, bytes, size: bytes.byteLength, hash: await sha256Hex(bytes) });
  };

  for (const file of files) {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(await file.arrayBuffer());
        for (const entry of Object.values(zip.files)) {
          if (entry.dir) continue;
          const base = entry.name.split('/').pop() ?? entry.name;
          if (base.startsWith('.') || entry.name.includes('__MACOSX')) continue;
          await push(entry.name, base, await entry.async('arraybuffer'));
        }
      } catch (err: any) {
        skipped.push(`${file.name} (could not read ZIP: ${err.message ?? err})`);
      }
    } else if (file.name.startsWith('.')) {
      skipped.push(`${rel} (hidden file)`);
    } else {
      await push(rel, file.name, await file.arrayBuffer());
    }
  }
  return { staged, skipped };
}

/** Parse an .xlsx or .csv manifest; header names are normalised to snake_case. */
export async function parseManifest(file: File): Promise<ManifestRow[]> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  return rows
    .map((row) => {
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        const norm = key.trim().toLowerCase().replace(/\s+/g, '_');
        out[norm] = String(value ?? '').trim();
      }
      return out as unknown as ManifestRow;
    })
    .filter((r) => r.source_file);
}

const normName = (s?: string | null) => (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const normId = (s?: string | null) => (s ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();

/** Normalise the many ways a date can be written to ISO, or null. */
export function toIsoDate(raw?: string | null): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (us) {
    const [, m, d, y] = us;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

const findManifestRow = (file: StagedFile, manifest: ManifestRow[]): ManifestRow | null => {
  const byPath = manifest.find((r) => normName(r.source_file) === normName(file.path));
  if (byPath) return byPath;
  return (
    manifest.find(
      (r) => normName(r.source_file.split(/[\\/]/).pop() ?? r.source_file) === normName(file.name),
    ) ?? null
  );
};

const clientByMemberId = (clients: MatchClient[], memberId?: string | null) => {
  const id = normId(memberId);
  if (!id) return null;
  return clients.find((c) => normId(c.member_id) === id) ?? null;
};

const clientsByName = (clients: MatchClient[], first?: string, last?: string, full?: string) => {
  const f = normName(first);
  const l = normName(last);
  const combined = normName(full);
  return clients.filter((c) => {
    const cf = normName(c.first_name);
    const cl = normName(c.last_name);
    if (f && l) return cf === f && cl === l;
    if (combined) {
      return (
        combined === `${cf} ${cl}` ||
        combined === `${cl} ${cf}` ||
        combined === `${cl}, ${cf}`
      );
    }
    return false;
  });
};


/**
 * Propose a mapping for one staged file using deterministic signals in strict
 * priority order. Conflicting exact signals (manifest vs the PDF's own member
 * ID) block the item instead of guessing.
 */
export async function proposeMapping(
  file: StagedFile,
  clients: MatchClient[],
  manifest: ManifestRow[],
  existingHashes: Map<string, string>,
  options: { useOcr?: boolean } = {},
): Promise<ProposedItem> {
  const manifestRow = findManifestRow(file, manifest);
  const isPdf = file.name.toLowerCase().endsWith('.pdf');

  // What does the file say about itself? Form fields first, then its printed
  // title, then its name — the same ladder the single-file upload uses.
  let pdfFormType: string | null = null;
  let pdfMemberId: string | null = null;
  let pdfMemberName: string | null = null;
  let pdfDob: string | null = null;
  const pdfDate: string | null = null;
  let recognitionBasis: string | null = null;
  let typeConfidence: ProposedItem['typeConfidence'] = 'none';
  let needsOcr = false;
  try {
    const result = await recognizeDocument(file.name, isPdf ? file.bytes : undefined, {
      useOcr: options.useOcr,
    });
    pdfFormType = result.documentType;
    recognitionBasis = result.documentType ? result.basis : null;
    typeConfidence = result.documentType ? result.confidence : 'none';
    needsOcr = result.needsOcr;
    const identity = identityFromFields(result.documentType, result.fields);
    pdfMemberId = identity.memberId ?? null;
    pdfMemberName = identity.memberName ?? null;
    pdfDob = toIsoDate(identity.dateOfBirth);
  } catch {
    // Unreadable file — falls through to filename/manifest signals.
  }

  const manifestClient =
    clientByMemberId(clients, manifestRow?.member_id) ??
    (() => {
      const named = clientsByName(
        clients,
        manifestRow?.first_name,
        manifestRow?.last_name,
        manifestRow?.client_name,
      );
      const dob = toIsoDate(manifestRow?.date_of_birth);
      const dobMatched = dob ? named.filter((c) => c.date_of_birth === dob) : named;
      return dobMatched.length === 1 ? dobMatched[0] : null;
    })();
  const pdfClient = clientByMemberId(clients, pdfMemberId);

  const formType =
    manifestRow?.form_type ||
    pdfFormType ||
    classifyFilename(file.name).documentType ||
    (isPdf ? null : 'Other');
  const proposedDate =
    toIsoDate(manifestRow?.form_date) ?? pdfDate ?? null;
  const proposedMco = manifestRow?.mco || null;
  const detectedMemberId = pdfMemberId ?? manifestRow?.member_id ?? null;

  const base = {
    file,
    proposedFormType: formType,
    typeBasis: recognitionBasis,
    // A manifest naming the type outright is as good as reading the form.
    typeConfidence: manifestRow?.form_type ? 'high' : typeConfidence,
    needsOcr,
    proposedMco,
    proposedDate,
    detectedMemberId,
    manifestRow,
    duplicateOfFormId: existingHashes.get(file.hash) ?? null,
  };

  // Conflict: two exact signals disagree about who this file belongs to.
  if (manifestClient && pdfClient && manifestClient.id !== pdfClient.id) {
    return {
      ...base,
      proposedClientId: null,
      confidence: 'conflict',
      matchReason: 'Manifest and the PDF form fields identify different clients',
      issue: `Manifest says ${manifestClient.last_name}, ${manifestClient.first_name}; the PDF's member ID matches ${pdfClient.last_name}, ${pdfClient.first_name}`,
    };
  }

  // 1–3: exact member-ID signals.
  if (pdfClient) {
    return {
      ...base,
      proposedClientId: pdfClient.id,
      confidence: 'high',
      matchReason: 'Member ID read from the PDF form fields',
      issue: null,
    };
  }
  if (manifestClient && manifestRow?.member_id) {
    return {
      ...base,
      proposedClientId: manifestClient.id,
      confidence: 'high',
      matchReason: 'Member ID from the manifest',
      issue: null,
    };
  }
  if (manifestClient) {
    return {
      ...base,
      proposedClientId: manifestClient.id,
      confidence: 'medium',
      matchReason: 'Name/DOB from the manifest',
      issue: null,
    };
  }

  // 4: name + DOB out of the PDF itself.
  if (pdfMemberName) {
    const named = clientsByName(clients, undefined, undefined, pdfMemberName);
    const withDob = pdfDob ? named.filter((c) => c.date_of_birth === pdfDob) : [];
    if (withDob.length === 1) {
      return {
        ...base,
        proposedClientId: withDob[0].id,
        confidence: 'medium',
        matchReason: 'Name and date of birth read from the PDF form fields',
        issue: null,
      };
    }
    if (named.length === 1) {
      return {
        ...base,
        proposedClientId: named[0].id,
        confidence: 'low',
        matchReason: 'Name-only match from the PDF form fields',
        issue: 'Name-only matches must be manually confirmed',
      };
    }
  }

  // 5–6: folder and filename hints.
  const pathParts = file.path.split(/[\\/]/).slice(0, -1);
  for (const part of pathParts.reverse()) {
    const named = clientsByName(clients, undefined, undefined, part.replace(/[_-]+/g, ' '));
    if (named.length === 1) {
      return {
        ...base,
        proposedClientId: named[0].id,
        confidence: 'low',
        matchReason: `Folder name "${part}" matches a client`,
        issue: 'Folder-name matches must be manually confirmed',
      };
    }
  }
  const nameNoExt = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  const byFilename = clients.filter((c) =>
    nameNoExt.toLowerCase().includes(`${normName(c.last_name)}`) &&
    nameNoExt.toLowerCase().includes(`${normName(c.first_name)}`),
  );
  if (byFilename.length === 1) {
    return {
      ...base,
      proposedClientId: byFilename[0].id,
      confidence: 'low',
      matchReason: 'Client name appears in the filename',
      issue: 'Filename matches must be manually confirmed',
    };
  }

  return {
    ...base,
    proposedClientId: null,
    confidence: 'low',
    matchReason: needsOcr
      ? 'Scanned image — nothing machine-readable inside'
      : 'No deterministic signal found',
    issue: needsOcr
      ? 'Scanned file: assign a client manually or add it to the manifest'
      : 'Assign a client manually or add this file to the manifest',
  };
}

/** All clients an admin can match against. */
export async function fetchMatchClients(): Promise<MatchClient[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, date_of_birth, member_id, insurance')
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  return (data as MatchClient[]) ?? [];
}

/** Hash → client_forms.id for every stored form file, for duplicate checks. */
export async function fetchExistingHashes(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from('client_forms')
    .select('id, file_hash')
    .not('file_hash', 'is', null);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((r) => [r.file_hash as string, r.id as string]));
}

export interface CommitResult {
  imported: number;
  duplicates: number;
  failed: { name: string; error: string }[];
}

export interface CommitItemInput {
  item: ProposedItem;
  clientId: string;
  formType: string;
  allowDuplicate: boolean;
}

/**
 * Commit confirmed items: store the original file unchanged in secure client
 * storage, create the form/document record and a historical version row, and
 * mark the import item resolved. Every error is reported per file — a bad
 * file never aborts the rest of the batch.
 */
export async function commitImport(
  batchId: string,
  profileId: string,
  entries: CommitItemInput[],
  onProgress?: (done: number, total: number) => void,
): Promise<CommitResult> {
  const result: CommitResult = { imported: 0, duplicates: 0, failed: [] };
  let done = 0;

  for (const { item, clientId, formType, allowDuplicate } of entries) {
    const { file, manifestRow } = item;
    try {
      if (item.duplicateOfFormId && !allowDuplicate) {
        result.duplicates += 1;
        await markItem(batchId, item, {
          resolution_status: 'skipped_duplicate',
          final_client_id: clientId,
          final_form_type: formType,
          resolved_by: profileId,
          resolved_at: new Date().toISOString(),
        });
        continue;
      }

      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
      const storagePath = `imports/${batchId}/${crypto.randomUUID()}${ext}`;
      const contentType = ext.toLowerCase() === '.pdf' ? 'application/pdf' : 'application/octet-stream';
      const { error: uploadError } = await supabase.storage
        .from('client-files')
        .upload(storagePath, new Blob([file.bytes], { type: contentType }), { contentType });
      if (uploadError) throw uploadError;

      const externalStatus = manifestRow?.external_status?.trim() || 'not_applicable';
      const { data: inserted, error: insertError } = await supabase
        .from('client_forms')
        .insert({
          client_id: clientId,
          employee_id: profileId,
          form_type: formType,
          title: manifestRow?.notes?.trim() || file.name,
          file_path: storagePath,
          original_file_path: storagePath,
          file_size: file.size,
          file_hash: file.hash,
          // Historical documents are records, not review work — they enter
          // internally approved with their known external state.
          status: 'approved',
          external_status: [
            'not_sent', 'sent_to_mco', 'awaiting_response', 'accepted', 'denied', 'not_applicable',
          ].includes(externalStatus)
            ? externalStatus
            : 'not_applicable',
          source: 'bulk_import',
          source_filename: file.path,
          import_batch_id: batchId,
          due_date: null,
        })
        .select('id')
        .single();
      if (insertError) throw insertError;

      await recordFormVersion({
        clientFormId: inserted.id,
        filePath: storagePath,
        versionType: 'historical',
        createdBy: profileId,
        sourceFilename: file.path,
        fileHash: file.hash,
        fileSize: file.size,
      });

      await markItem(batchId, item, {
        resolution_status: 'imported',
        final_client_id: clientId,
        final_form_type: formType,
        final_storage_path: storagePath,
        client_form_id: inserted.id,
        resolved_by: profileId,
        resolved_at: new Date().toISOString(),
      });
      result.imported += 1;
    } catch (err: any) {
      result.failed.push({ name: file.path, error: err.message ?? String(err) });
      try {
        await markItem(batchId, item, { resolution_status: 'failed', issue_code: 'commit_failed' });
      } catch {
        // The per-file failure is already recorded in the result summary.
      }
    } finally {
      done += 1;
      onProgress?.(done, entries.length);
    }
  }

  // Every imported document enters the queue unread. Start on it now rather
  // than waiting for someone to open the review screen — a batch of two
  // thousand takes more than one sitting, so the sooner it begins the better.
  startDocumentQueue();

  return result;
}

const markItem = async (
  batchId: string,
  item: ProposedItem,
  patch: Record<string, unknown>,
): Promise<void> => {
  // The row id is the only safe key: the same file can legitimately appear
  // under two folders in one batch, so name+hash is not unique.
  if (!item.itemId) return;
  const { error } = await supabase
    .from('document_import_items')
    .update(patch)
    .eq('id', item.itemId)
    .eq('batch_id', batchId);
  if (error) throw new Error(error.message);
};

/** What deleting an import would actually remove. */
export interface ImportRemoval {
  batchId: string;
  /** Staged rows: the record of what was proposed. Always removed. */
  stagedItems: number;
  /** Documents this import actually filed on client records. */
  documents: number;
  /** Stored files behind those documents. */
  storedFiles: number;
}

/**
 * Count what deleting an import would take with it, before anything is deleted.
 *
 * An import left in review and an import that filed two hundred documents are
 * very different things to delete, and the difference is invisible from the
 * batch row alone — so it is counted and shown before the question is asked.
 */
export async function describeImportRemoval(batchId: string): Promise<ImportRemoval> {
  const [{ count: stagedItems }, { data: forms }] = await Promise.all([
    supabase
      .from('document_import_items')
      .select('id', { count: 'exact', head: true })
      .eq('batch_id', batchId),
    supabase.from('client_forms').select('id, file_path').eq('import_batch_id', batchId),
  ]);

  return {
    batchId,
    stagedItems: stagedItems ?? 0,
    documents: forms?.length ?? 0,
    storedFiles: (forms ?? []).filter((f) => f.file_path).length,
  };
}

/**
 * Delete an import and everything it created.
 *
 * The order matters: stored files first, then the documents that point at
 * them, then the staged rows, then the batch. Deleting the batch first would
 * leave orphans behind with nothing left naming them.
 *
 * Only documents carrying this `import_batch_id` are touched. A document
 * someone uploaded by hand, or one from a different import, is never in scope
 * however similar it looks.
 */
export async function deleteImportBatch(batchId: string): Promise<ImportRemoval> {
  const removal = await describeImportRemoval(batchId);

  const { data: forms } = await supabase
    .from('client_forms')
    .select('id, file_path')
    .eq('import_batch_id', batchId);

  const paths = (forms ?? []).map((f) => f.file_path).filter((p): p is string => !!p);
  if (paths.length) {
    // Storage failures are not fatal. A file left behind costs disk; a
    // document row left pointing at a deleted file breaks the client record.
    await supabase.storage.from('client-files').remove(paths).catch(() => undefined);
  }

  const formIds = (forms ?? []).map((f) => f.id);
  if (formIds.length) {
    await supabase.from('client_form_versions').delete().in('client_form_id', formIds);
    const { error } = await supabase.from('client_forms').delete().in('id', formIds);
    if (error) throw error;
  }

  const { error: itemsError } = await supabase
    .from('document_import_items')
    .delete()
    .eq('batch_id', batchId);
  if (itemsError) throw itemsError;

  const { error: batchError } = await supabase
    .from('document_import_batches')
    .delete()
    .eq('id', batchId);
  if (batchError) throw batchError;

  return removal;
}
