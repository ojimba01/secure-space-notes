// Reading one queued document: claim it, read it, write back what it says.
//
// Shared by the browser queue (src/lib/documentQueue.ts) and the scheduled
// reader (supabase/functions/document-reader), so a document is read the same
// way whichever of them gets to it first. The two differ only in how a PDF's
// text and form fields are pulled out — pdf.js in the browser, unpdf on the
// server — and that is passed in as `read`.
//
// Like documentFields.ts beside it, this imports nothing but that file, with
// an explicit extension, so Deno and Vite can both resolve it.
import {
  extractDocumentFields,
  fieldsFromFormValues,
  mergeDocumentFields,
  nameMatchesClient,
  type DocumentFields,
} from './documentFields.ts';

// The two runtimes type their Supabase clients differently, and nothing here
// needs more than the query builder both of them have.
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any;

export const BUCKET = 'client-files';

/** How long a claim stands before another reader may take the document back. */
export const STALE_CLAIM_MINUTES = 15;

/** Postgres will not store a NUL byte in a text column, and OCR can emit them. */
// eslint-disable-next-line no-control-regex
export const clean = (s: string) => s.replace(/\u0000/g, '').trim();

/**
 * Text longer than this is not stored. A GIN index over a megabyte of OCR
 * noise costs more than it returns, and no search needs page 400.
 */
export const MAX_STORED_CHARS = 400_000;

/** What a reader got out of a PDF. */
export interface PdfReading {
  text: string;
  pageCount: number;
  truncated: boolean;
  ocrApplied: boolean;
  /** The PDF's own form fields, name to value. */
  formValues: Record<string, string>;
}

export type PdfReader = (bytes: ArrayBuffer) => Promise<PdfReading>;

export interface QueueRow {
  id: string;
  file_path: string | null;
  source_filename: string | null;
  client_id: string | null;
  /** How much text the document already holds, from an import or from OCR. */
  text_char_count: number | null;
}

const ROW_COLUMNS = 'id, file_path, source_filename, client_id, text_char_count';

/**
 * What the document said, and where that disagrees with the client record.
 *
 * `clientPatch` is only ever the columns the record leaves empty. A value that
 * disagrees with something already entered goes in `conflict` and nowhere
 * else: a document is evidence, and a regex does not get to overrule a person.
 */
interface FieldOutcome {
  columns: Record<string, unknown>;
  clientPatch: Record<string, unknown>;
  conflict: Record<string, { document: string; record: string }> | null;
  nameMatches: boolean | null;
}

/** Compare loosely: identifiers differ by punctuation, dates by format. */
const sameId = (a: unknown, b: unknown) =>
  String(a ?? '').replace(/\D/g, '') === String(b ?? '').replace(/\D/g, '');

/**
 * Turn what a document says into a database write.
 *
 * `hsp_submitted` is set from a 150-day or 180-day authorization number. The
 * agency only ever receives one of those after the Housing Stabilization Plan
 * has gone in, so the number is proof the plan was submitted — and the flag is
 * frequently left unticked while the paperwork proving it sits in the file.
 */
async function applyFields(
  db: Db,
  fields: DocumentFields,
  clientId: string | null,
): Promise<FieldOutcome> {
  const columns: Record<string, unknown> = {
    field_authorization_number: fields.authorizationNumber,
    field_service_start: fields.serviceStart,
    field_service_end: fields.serviceEnd,
    field_total_charges: fields.totalCharges,
    field_member_name: fields.memberName,
    field_member_id: fields.memberId,
    field_medicaid_id: fields.medicaidId,
    field_njhmis_id: fields.njhmisId,
    field_member_dob: fields.memberDob,
    field_icd10_code: fields.icd10Code,
    field_notice_date: fields.noticeDate,
    field_submission_date: fields.submissionDate,
    fields_extracted_at: new Date().toISOString(),
  };

  if (!clientId) return { columns, clientPatch: {}, conflict: null, nameMatches: null };

  const { data: client } = await db
    .from('clients')
    .select(
      'id, first_name, last_name, date_of_birth, member_id, medicaid_id, njhmis_id, diagnosis_code, hsp_submitted, auth_150_number, auth_180_number',
    )
    .eq('id', clientId)
    .maybeSingle();

  if (!client) return { columns, clientPatch: {}, conflict: null, nameMatches: null };

  const clientPatch: Record<string, unknown> = {};
  const conflict: Record<string, { document: string; record: string }> = {};

  const consider = (
    column: string,
    documentValue: unknown,
    recordValue: unknown,
    equal: (a: unknown, b: unknown) => boolean = (a, b) => String(a) === String(b),
  ) => {
    if (documentValue === null || documentValue === undefined || documentValue === '') return;
    const empty = recordValue === null || recordValue === undefined || recordValue === '';
    if (empty) {
      clientPatch[column] = documentValue;
    } else if (!equal(documentValue, recordValue)) {
      // Stored as text so the report reads the same whatever the column type.
      conflict[column] = { document: String(documentValue), record: String(recordValue) };
    }
  };

  consider('date_of_birth', fields.memberDob, client.date_of_birth);
  consider('member_id', fields.memberId, client.member_id, sameId);
  consider('medicaid_id', fields.medicaidId, client.medicaid_id, sameId);
  consider('njhmis_id', fields.njhmisId, client.njhmis_id, sameId);
  consider('diagnosis_code', fields.icd10Code, client.diagnosis_code);

  // A 150-day or 180-day authorization number can only exist once the plan has
  // been submitted, so it proves the flag rather than merely suggesting it.
  const hasLongAuth =
    !!(client.auth_150_number ?? '').trim() || !!(client.auth_180_number ?? '').trim();
  if (hasLongAuth && client.hsp_submitted !== true) {
    clientPatch.hsp_submitted = true;
  }

  const nameMatches = nameMatchesClient(fields.memberName, client.first_name, client.last_name);

  return {
    columns,
    clientPatch,
    conflict: Object.keys(conflict).length ? conflict : null,
    nameMatches,
  };
}

/** What a document interrupted once carries, so a second interruption can tell. */
const INTERRUPTED = 'Reading was interrupted once; trying again.';

/**
 * Hand back any document claimed by a reader that stopped mid-read.
 *
 * Once. A tab closed mid-document is worth a second try; a document that stops
 * every reader that picks it up — too large, or malformed in a way that hangs
 * the parser — would otherwise go back to the front of the queue each time and
 * stop everything behind it. The second time, it is marked failed, where the
 * Document reading screen lists it for a person.
 */
export async function reclaimStale(db: Db): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  // A claim with no timestamp is stuck for good otherwise: `lt` never matches
  // null, so the row would sit in 'processing' until someone noticed.
  const stale = `processing_started_at.is.null,processing_started_at.lt.${cutoff}`;
  await db
    .from('client_forms')
    .update({
      processing_status: 'failed',
      processing_error: 'Reading was interrupted twice. The file may be too large or damaged to read here.',
      processing_started_at: null,
      processed_at: new Date().toISOString(),
    })
    .eq('processing_status', 'processing')
    .eq('processing_error', INTERRUPTED)
    .or(stale);
  await db
    .from('client_forms')
    .update({ processing_status: 'pending', processing_started_at: null, processing_error: INTERRUPTED })
    .eq('processing_status', 'processing')
    .or(stale);
}

/**
 * Take the next document, or null when there is none.
 *
 * The update is guarded on the row still being 'pending', so when two readers
 * — two tabs, or a tab and the scheduled reader — reach for the same document,
 * only one of them gets a row back.
 */
export async function claimNext(db: Db): Promise<QueueRow | null> {
  const { data: candidates } = await db
    .from('client_forms')
    .select(ROW_COLUMNS)
    .eq('processing_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);

  for (const row of candidates ?? []) {
    const { data: claimed } = await db
      .from('client_forms')
      .update({ processing_status: 'processing', processing_started_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('processing_status', 'pending')
      .select(ROW_COLUMNS)
      .maybeSingle();
    if (claimed) return claimed as QueueRow;
  }
  return null;
}

export async function pendingCount(db: Db): Promise<number> {
  const { count } = await db
    .from('client_forms')
    .select('id', { count: 'exact', head: true })
    .eq('processing_status', 'pending');
  return count ?? 0;
}

const markFailed = (db: Db, id: string, reason: string) =>
  db
    .from('client_forms')
    .update({
      processing_status: 'failed',
      processing_error: reason.slice(0, 500),
      processing_started_at: null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);

/** Read one claimed document and write back what it says. */
export async function processOne(
  db: Db,
  row: QueueRow,
  read: PdfReader,
): Promise<'done' | 'failed'> {
  if (!row.file_path) {
    // Nothing stored to read — a form still being filled in, not a failure.
    await db
      .from('client_forms')
      .update({
        processing_status: 'skipped',
        processing_started_at: null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return 'done';
  }

  if (!row.file_path.toLowerCase().endsWith('.pdf')) {
    await db
      .from('client_forms')
      .update({
        processing_status: 'skipped',
        processing_error: 'Only PDFs can be read.',
        processing_started_at: null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return 'done';
  }

  const { data: blob, error: dlError } = await db.storage.from(BUCKET).download(row.file_path);
  if (dlError || !blob) {
    await markFailed(db, row.id, dlError?.message ?? 'The stored file could not be downloaded.');
    return 'failed';
  }

  try {
    // Text layer only. OCR is never run from the queue.
    const result = await read(await blob.arrayBuffer());
    const text = clean(result.text).slice(0, MAX_STORED_CHARS);

    // Never trade text for less of it. A document can already hold more words
    // than its own text layer gives up — OCR'd by a person, or filled from the
    // archive's text export — and reading it again for its form fields must
    // not blank that. The fields are then read from the longer text.
    const kept = (row.text_char_count ?? 0) > text.length;
    let fieldText = text;
    if (kept) {
      const { data: existing } = await db
        .from('client_forms')
        .select('extracted_text')
        .eq('id', row.id)
        .maybeSingle();
      fieldText = existing?.extracted_text ?? text;
    }

    // Both sources are consulted: the printed text carries a letter's
    // authorization number, and a fillable form's answers live only in its
    // form fields — 1% of the state's forms give up a date of birth to the
    // text, against 98% to the fields.
    const fields = mergeDocumentFields(
      extractDocumentFields(fieldText),
      fieldsFromFormValues(result.formValues),
    );
    const outcome = await applyFields(db, fields, row.client_id);

    const { error } = await db
      .from('client_forms')
      .update({
        ...(kept
          ? {}
          : {
              extracted_text: text || null,
              text_char_count: text.length,
              ocr_applied: result.ocrApplied,
              text_truncated: result.truncated || result.text.length > MAX_STORED_CHARS,
            }),
        page_count: result.pageCount,
        processing_status: 'done',
        processing_error: null,
        processing_started_at: null,
        processed_at: new Date().toISOString(),
        ...outcome.columns,
        fields_conflict: outcome.conflict,
        name_matches_client: outcome.nameMatches,
      })
      .eq('id', row.id);

    // Fill the blanks on the client record, never overwrite. A failure here
    // must not lose the document that was just read successfully.
    if (!error && row.client_id && Object.keys(outcome.clientPatch).length) {
      await db.from('clients').update(outcome.clientPatch).eq('id', row.client_id);
    }

    if (error) {
      await markFailed(db, row.id, error.message);
      return 'failed';
    }
    return 'done';
  } catch (e) {
    await markFailed(db, row.id, e instanceof Error ? e.message : 'The document could not be read.');
    return 'failed';
  }
}
