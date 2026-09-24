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
import { readFormValues } from '@/lib/documentRecognition';
import {
  BUCKET,
  MAX_STORED_CHARS,
  claimNext as claimNextIn,
  clean,
  pendingCount as pendingCountIn,
  processOne as processOneIn,
  reclaimStale as reclaimStaleIn,
  type PdfReader,
  type QueueRow,
} from '../../supabase/functions/_shared/documentReading.ts';

// Claiming, reading and writing back are shared with the scheduled reader in
// supabase/functions/document-reader, which works the same queue from the
// server every minute. Only how a PDF is opened differs: here, pdf.js.
const readInBrowser: PdfReader = async (bytes) => {
  const result = await extractDocumentText(bytes, { ocr: false });
  return {
    text: result.text,
    pageCount: result.pageCount,
    truncated: result.truncated,
    ocrApplied: result.ocrApplied,
    formValues: await readFormValues(bytes),
  };
};

const reclaimStale = () => reclaimStaleIn(supabase);
const claimNext = () => claimNextIn(supabase);
const processOne = (row: QueueRow) => processOneIn(supabase, row, readInBrowser);

export interface QueueProgress {
  done: number;
  failed: number;
  /** -1 while a run is under way: counting the remainder per document costs a
   *  round trip that is better spent reading one. */
  remaining: number;
}

let running = false;
let cancelled = false;

/** Ask a run in progress to stop after the document it is on. */
export function stopDocumentQueue(): void {
  cancelled = true;
}

/** Whether a run is under way in this tab. */
export function queueIsRunning(): boolean {
  return running;
}

/** How many documents are still waiting to be read. */
export const pendingCount = (): Promise<number> => pendingCountIn(supabase);

/**
 * Read whatever is waiting, up to BATCH_SIZE documents.
 *
 * Only one run happens at a time in a given tab. `onProgress` is called after
 * each document so a screen can show the count going down.
 */
export async function runDocumentQueue(
  onProgress?: (p: QueueProgress) => void,
  options: { limit?: number } = {},
): Promise<QueueProgress> {
  if (running) return { done: 0, failed: 0, remaining: await pendingCount() };
  running = true;
  cancelled = false;

  const limit = options.limit ?? Infinity;
  let done = 0;
  let failed = 0;
  try {
    await reclaimStale();
    // Keep going until the queue is empty. A document that fails is marked
    // 'failed' and so leaves 'pending', which is what stops this looping over
    // the same unreadable file for ever.
    //
    // Four at a time. Almost all of a document's time is spent downloading it
    // from storage, not reading it - a text layer parses in about a tenth of a
    // second - so one at a time left the connection idle between files. On a
    // backlog of 1,735 that is the difference between an afternoon and a
    // coffee. Four rather than six because each lane holds a whole PDF in
    // memory while it works, and some of these are large scans.
    const LANES = 4;
    const lane = async () => {
      while (!cancelled && done + failed < limit) {
        const row = await claimNext();
        if (!row) return;
        const outcome = await processOne(row);
        if (outcome === 'done') done++;
        else failed++;
        onProgress?.({ done, failed, remaining: -1 });
        // Give the page back to the browser between documents, or a long run
        // makes the app feel frozen even though it is working.
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    await Promise.all(Array.from({ length: LANES }, lane));
  } finally {
    running = false;
    cancelled = false;
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

/** Documents read successfully that gave up no text: photographs and scans. */
const SCAN_THRESHOLD_CHARS = 40;

let ocrCancelled = false;

/** Ask a picture run to stop after the document it is on. */
export function stopOcrQueue(): void {
  ocrCancelled = true;
}

/**
 * Read every picture-only document, one after another.
 *
 * Optical recognition takes over a minute a page, so this is hours rather than
 * minutes and holds the tab while it runs. It exists because pressing a button
 * 141 times is not a plan, and because it can be stopped and restarted: each
 * document is written as it finishes, so nothing already read is read again.
 */
export async function runOcrQueue(
  onProgress?: (done: number, total: number, current: string) => void,
): Promise<{ read: number; empty: number; failed: number }> {
  ocrCancelled = false;
  const result = { read: 0, empty: 0, failed: 0 };

  const { data } = await supabase
    .from('client_forms')
    .select('id, title, source_filename')
    .eq('processing_status', 'done')
    .lt('text_char_count', SCAN_THRESHOLD_CHARS)
    .not('file_path', 'is', null)
    .eq('ocr_applied', false)
    .order('created_at', { ascending: true });

  const rows = data ?? [];
  for (const [index, row] of rows.entries()) {
    if (ocrCancelled) break;
    onProgress?.(index, rows.length, (row.title as string) ?? (row.source_filename as string) ?? '');
    const outcome = await readWithOcr(row.id as string);
    if (!outcome.ok) result.failed += 1;
    else if (outcome.chars > 0) result.read += 1;
    else result.empty += 1;
    // Mark it tried either way, so a second run does not start from the top.
    await supabase.from('client_forms').update({ ocr_applied: true }).eq('id', row.id);
  }

  onProgress?.(rows.length, rows.length, '');
  return result;
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
