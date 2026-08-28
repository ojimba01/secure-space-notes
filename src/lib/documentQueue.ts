// The background reader.
//
// Uploading a document records it and returns. Reading it happens afterwards,
// so nobody waits on a fifty-page scan, and `processing_status` on the row is
// what makes that safe: the work is written down in the database rather than
// held in a tab, so closing the browser loses nothing and the next person to
// open the app picks it up.
//
// There is no server doing this. Reading happens in the browser (see
// documentText.ts), so the queue is cooperative — whoever is looking at the
// app is who does the work.
//
// The queue reads **text layers only**. That is fast — a six-page form in 72ms
// — and covers about six documents in seven. A document with no text layer is
// a scan, and reading one means OCR, which measured at over 100 seconds for a
// single page in the browser. Putting that in the queue would mean a browser
// left open for hours, so a scan is instead recorded as read-with-no-text and
// offered to a person, one document at a time, through `readWithOcr`.
//
// Two rules keep several open tabs from fighting:
//
//   * A row is claimed by moving it to 'processing' with a guard on its
//     current status, so exactly one tab wins the claim.
//   * A claim older than STALE_CLAIM_MINUTES is taken back, because the tab
//     that made it was closed mid-document.
import { supabase } from '@/integrations/supabase/client';
import { extractDocumentText } from '@/lib/documentText';

const BUCKET = 'client-files';

/** How long a claim stands before another tab may take the document back. */
const STALE_CLAIM_MINUTES = 15;

/** Documents read per run before yielding, so a long queue never locks the UI. */
const BATCH_SIZE = 25;

/** Postgres will not store a NUL byte in a text column, and OCR can emit them. */
const clean = (s: string) => s.replace(/\u0000/g, '').trim();

/**
 * Text longer than this is not stored. A GIN index over a megabyte of OCR
 * noise costs more than it returns, and no search needs page 400.
 */
const MAX_STORED_CHARS = 400_000;

interface QueueRow {
  id: string;
  file_path: string | null;
  source_filename: string | null;
}

export interface QueueProgress {
  done: number;
  failed: number;
  remaining: number;
}

let running = false;

/** How many documents are still waiting to be read. */
export async function pendingCount(): Promise<number> {
  const { count } = await supabase
    .from('client_forms')
    .select('id', { count: 'exact', head: true })
    .eq('processing_status', 'pending');
  return count ?? 0;
}

/** Hand back any document claimed by a tab that was closed mid-read. */
async function reclaimStale(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MINUTES * 60_000).toISOString();
  await supabase
    .from('client_forms')
    .update({ processing_status: 'pending', processing_started_at: null })
    .eq('processing_status', 'processing')
    .lt('processing_started_at', cutoff);
}

/**
 * Take the next document, or null when there is none.
 *
 * The update is guarded on the row still being 'pending', so when two tabs
 * reach for the same document only one of them gets a row back.
 */
async function claimNext(): Promise<QueueRow | null> {
  const { data: candidates } = await supabase
    .from('client_forms')
    .select('id, file_path, source_filename')
    .eq('processing_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);

  for (const row of candidates ?? []) {
    const { data: claimed } = await supabase
      .from('client_forms')
      .update({ processing_status: 'processing', processing_started_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('processing_status', 'pending')
      .select('id, file_path, source_filename')
      .maybeSingle();
    if (claimed) return claimed as QueueRow;
  }
  return null;
}

const markFailed = (id: string, reason: string) =>
  supabase
    .from('client_forms')
    .update({
      processing_status: 'failed',
      processing_error: reason.slice(0, 500),
      processing_started_at: null,
      processed_at: new Date().toISOString(),
    })
    .eq('id', id);

/** Read one claimed document and write back what it says. */
async function processOne(row: QueueRow): Promise<'done' | 'failed'> {
  if (!row.file_path) {
    // Nothing stored to read — a form still being filled in, not a failure.
    await supabase
      .from('client_forms')
      .update({
        processing_status: 'skipped',
        processing_started_at: null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return 'done';
  }

  const name = row.file_path.toLowerCase();
  if (!name.endsWith('.pdf')) {
    await supabase
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

  const { data: blob, error: dlError } = await supabase.storage.from(BUCKET).download(row.file_path);
  if (dlError || !blob) {
    await markFailed(row.id, dlError?.message ?? 'The stored file could not be downloaded.');
    return 'failed';
  }

  try {
    // Text layer only. OCR is never run from the queue — see the note above.
    const result = await extractDocumentText(await blob.arrayBuffer(), { ocr: false });
    const text = clean(result.text).slice(0, MAX_STORED_CHARS);

    const { error } = await supabase
      .from('client_forms')
      .update({
        extracted_text: text || null,
        text_char_count: text.length,
        page_count: result.pageCount,
        ocr_applied: result.ocrApplied,
        text_truncated: result.truncated || result.text.length > MAX_STORED_CHARS,
        processing_status: 'done',
        processing_error: null,
        processing_started_at: null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (error) {
      await markFailed(row.id, error.message);
      return 'failed';
    }
    return 'done';
  } catch (e) {
    await markFailed(row.id, e instanceof Error ? e.message : 'The document could not be read.');
    return 'failed';
  }
}

/**
 * Read whatever is waiting, up to BATCH_SIZE documents.
 *
 * Only one run happens at a time in a given tab. `onProgress` is called after
 * each document so a screen can show the count going down.
 */
export async function runDocumentQueue(
  onProgress?: (p: QueueProgress) => void,
): Promise<QueueProgress> {
  if (running) return { done: 0, failed: 0, remaining: await pendingCount() };
  running = true;

  let done = 0;
  let failed = 0;
  try {
    await reclaimStale();
    for (let i = 0; i < BATCH_SIZE; i++) {
      const row = await claimNext();
      if (!row) break;
      const outcome = await processOne(row);
      if (outcome === 'done') done++;
      else failed++;
      onProgress?.({ done, failed, remaining: await pendingCount() });
      // Give the page back to the browser between documents. Without this a
      // long batch makes the app feel frozen even though it is working.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    running = false;
  }

  return { done, failed, remaining: await pendingCount() };
}

/**
 * Read one scan with OCR, because someone asked for this document specifically.
 *
 * Slow on purpose to run here rather than in the queue: OCR measured at over
 * 100 seconds for a single full page, so this is a deliberate choice about one
 * document, not something to do to a batch. `onPage` reports progress so the
 * caller can show which page it has reached.
 */
export async function readWithOcr(formId: string): Promise<{ ok: boolean; chars: number; error?: string }> {
  const { data: row } = await supabase
    .from('client_forms')
    .select('id, file_path, source_filename')
    .eq('id', formId)
    .maybeSingle();

  if (!row?.file_path) return { ok: false, chars: 0, error: 'There is no stored file to read.' };

  const { data: blob, error: dlError } = await supabase.storage
    .from(BUCKET)
    .download(row.file_path);
  if (dlError || !blob) {
    return { ok: false, chars: 0, error: dlError?.message ?? 'The stored file could not be downloaded.' };
  }

  try {
    const result = await extractDocumentText(await blob.arrayBuffer(), { ocr: true });
    const text = clean(result.text).slice(0, MAX_STORED_CHARS);
    const { error } = await supabase
      .from('client_forms')
      .update({
        extracted_text: text || null,
        text_char_count: text.length,
        page_count: result.pageCount,
        ocr_applied: result.ocrApplied,
        text_truncated: result.truncated || result.text.length > MAX_STORED_CHARS,
        processing_status: 'done',
        processing_error: null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', formId);
    if (error) return { ok: false, chars: 0, error: error.message };
    return { ok: true, chars: text.length };
  } catch (e) {
    return { ok: false, chars: 0, error: e instanceof Error ? e.message : 'The document could not be read.' };
  }
}

/**
 * Start a run without waiting for it.
 *
 * This is what an upload calls. Failures are swallowed on purpose: the
 * document is already saved and its status says it still needs reading, so the
 * next run picks it up. Interrupting someone's upload with an OCR error would
 * report a problem they did not cause and cannot act on.
 */
export function startDocumentQueue(): void {
  void runDocumentQueue().catch(() => {});
}
