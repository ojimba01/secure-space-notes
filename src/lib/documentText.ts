// Read the words out of a stored document.
//
// Everything here runs in the browser. No client document is transmitted to be
// read — see docs/ocr.md for why that constraint is worth the slower engine.
//
// Reading the text layer is the whole of the automatic path, and OCR is not.
// That split is measured, not assumed:
//
//   text layer, 6-page form, whole document      72 ms
//   OCR, small canvas of one line of text     1,125 ms
//   OCR, one full page at 1.6 scale       over 100,000 ms — did not finish
//
// The engine is not broken; a full page is simply 30 times the pixels of that
// small canvas, and the WASM build available in a browser is single-threaded.
// At that rate reading the agency's ~275 text-less documents would take hours
// of a browser sitting open, so OCR is never run automatically. It is offered
// per document, by a person who has decided that one is worth the wait.
//
// Measured on a random 200 of the 1,798 PDFs in the agency's own archive, at
// the threshold and caps below:
//
//   text layer, read in milliseconds   173   86.5%
//   needs OCR                           27   13.5%
//   could not be opened at all           0
//
//   median 3 pages, median 3,291 characters of text
//   of the ones needing OCR: median 1 page, longest 15
//
// So the automatic path covers six documents in seven. The archive was put
// through ocrmypdf overnight, which is why so many carry text — and the ones
// that do not are largely the 226 that ocrmypdf itself could not read, being
// photographs. Running the slower browser engine over those would spend hours
// to fail on the same files, which is the second reason OCR is not automatic.
import { ocrPdfPages, ocrSupported } from '@/lib/ocr';

export interface ExtractedText {
  text: string;
  charCount: number;
  pageCount: number;
  /** True when the words were read off the picture rather than a text layer. */
  ocrApplied: boolean;
  /** True when the document was longer than the cap and was read only that far. */
  truncated: boolean;
}

/**
 * Below this many characters across the whole document, treat it as a scan.
 *
 * A real text layer on even one page clears this easily. What sits under it is
 * a scan carrying a stray page number or a header stamped by a fax machine.
 */
export const SCAN_THRESHOLD_CHARS = 120;

/** Text-layer pages to read. Cheap enough that the cap is only a runaway guard. */
const MAX_TEXT_PAGES = 60;

/**
 * OCR pages to read.
 *
 * Set from the measurement above: the longest document in the sample needing
 * OCR was 15 pages, so 20 reads all of them whole and still bounds the rare
 * outlier. Nobody waits on this — it runs in the background, one document at a
 * time — so the cap is a guard against a pathological file, not a budget.
 */
const MAX_OCR_PAGES = 20;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * The PDF's own text layer, page by page.
 *
 * Returns null — rather than an empty string — when the file cannot be opened
 * at all, so a corrupt PDF is reported as a failure instead of being recorded
 * as a document that simply had nothing to say.
 */
async function textLayer(
  bytes: ArrayBuffer | Uint8Array,
): Promise<{ text: string; pageCount: number; truncated: boolean } | null> {
  const { pdfjs } = await import('react-pdf');
  await import('@/lib/pdfWorker');
  const copy = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));

  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>['promise']> | null = null;
  try {
    doc = await pdfjs.getDocument({ data: copy }).promise;
    const pageCount = doc.numPages;
    const readTo = Math.min(pageCount, MAX_TEXT_PAGES);
    const pages: string[] = [];

    for (let n = 1; n <= readTo; n++) {
      try {
        const page = await doc.getPage(n);
        const content = await page.getTextContent();
        pages.push(
          content.items.map((i: unknown) => ((i as { str?: string })?.str ?? '')).join(' '),
        );
      } catch {
        // One unreadable page should not lose the rest of the document.
      }
    }

    return { text: squash(pages.join('\n')), pageCount, truncated: pageCount > readTo };
  } catch {
    return null;
  } finally {
    await doc?.destroy().catch(() => {});
  }
}

/** Read a scan. Stops at the cap, or gives up when the engine is unavailable. */
async function ocrPages(
  bytes: ArrayBuffer | Uint8Array,
  pageCount: number,
): Promise<{ text: string; truncated: boolean }> {
  // One call, one document load. Reading page by page through the
  // identify-this-form helper re-parsed the whole PDF for every page.
  const { text, pagesRead } = await ocrPdfPages(bytes, MAX_OCR_PAGES);
  return { text: squash(text), truncated: pagesRead < pageCount };
}

/**
 * Everything readable in a document, and how it was read.
 *
 * Throws only when the file is not a PDF this browser can open at all. A PDF
 * that genuinely holds no words returns an empty string, which is a fact about
 * the document rather than a failure.
 */
export async function extractDocumentText(
  bytes: ArrayBuffer | Uint8Array,
  options: { ocr?: boolean } = {},
): Promise<ExtractedText> {
  const layer = await textLayer(bytes);
  if (!layer) throw new Error('The file could not be opened as a PDF.');

  const asLayerOnly = (): ExtractedText => ({
    text: layer.text,
    charCount: layer.text.length,
    pageCount: layer.pageCount,
    ocrApplied: false,
    truncated: layer.truncated,
  });

  if (layer.text.length >= SCAN_THRESHOLD_CHARS) return asLayerOnly();

  // Too little text to be anything but a scan. Reading it means OCR, which
  // takes minutes a page here, so it happens only when asked for — see
  // `isScan` below, which is how a caller offers that choice.
  if (!options.ocr || !ocrSupported()) return asLayerOnly();

  const scanned = await ocrPages(bytes, layer.pageCount);
  // Keep both. The stray text layer is sometimes a fax header carrying a date
  // the scan itself does not show.
  const combined = squash([layer.text, scanned.text].filter(Boolean).join('\n'));

  return {
    text: combined,
    charCount: combined.length,
    pageCount: layer.pageCount,
    ocrApplied: scanned.text.length > 0,
    truncated: scanned.truncated,
  };
}

/**
 * True when a document was read but had nothing to read — a scan.
 *
 * The queue records these as read with no text rather than as a failure,
 * because nothing went wrong: the file is a picture. This is what the review
 * screen tests to offer reading it with OCR.
 */
export const isScan = (charCount: number | null | undefined): boolean =>
  (charCount ?? 0) < SCAN_THRESHOLD_CHARS;
