// Optical character recognition for scanned documents.
//
// Roughly half the PDFs in the historical archive are flat scans with no form
// fields and no text layer, so nothing can be read from them directly. The
// biggest group is detached signature pages — a single scanned page whose
// filename says only "SIGNED FORM". Those pages do carry the form's name in
// the printed footer, which is enough to file them correctly.
//
// Two properties matter here:
//
//   * The image never leaves the browser. Recognition runs locally in a web
//     worker, so no client document is sent to any server. Cloud OCR would
//     mean transmitting PHI to a third party.
//   * Nothing loads until it is used. The engine and its language model are
//     several megabytes, fetched on first use and cached by the browser, so
//     staff who never import a scan never download them.
import type { Worker } from 'tesseract.js';

/**
 * Where the OCR engine and language model are fetched from.
 *
 * These default to the public CDN. For production, consider serving them from
 * /public instead and pointing these at your own origin: the page holds PHI in
 * memory, and self-hosting removes a third party's ability to serve script
 * into it. See docs/ocr.md.
 */
const ASSET_PATHS = {
  // The "fast" English model — about a quarter the size of the standard one
  // and equally reliable at reading a printed form title.
  langPath: 'https://tessdata.projectnaptha.com/4.0.0_fast',
};

/** Page regions worth reading. Full-page OCR is slower and adds no signal. */
export type OcrRegion = 'header' | 'footer' | 'full';

let workerPromise: Promise<Worker> | null = null;

/**
 * One shared worker, started on first use. Spinning one up costs about a
 * second, so it is kept alive for the rest of the session — a bulk import
 * runs hundreds of pages through the same instance.
 */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, OEM } = await import('tesseract.js');
      return createWorker('eng', OEM.LSTM_ONLY, ASSET_PATHS);
    })();
  }
  try {
    return await workerPromise;
  } catch (err) {
    // A failed start must not poison every later attempt.
    workerPromise = null;
    throw err;
  }
}

/** Release the engine and its memory. Safe to call when never started. */
export async function shutdownOcr(): Promise<void> {
  if (!workerPromise) return;
  const pending = workerPromise;
  workerPromise = null;
  try {
    const worker = await pending;
    await worker.terminate();
  } catch {
    // Nothing useful to do if it was already gone.
  }
}

/**
 * Render one PDF page to a canvas. Scale is chosen for legibility rather than
 * fidelity: OCR accuracy falls off below roughly 200 DPI, and a US Letter page
 * at 2x CSS scale lands comfortably above that.
 */
async function renderPage(
  bytes: ArrayBuffer | Uint8Array,
  pageNumber: number,
  scale = 2,
): Promise<HTMLCanvasElement | null> {
  const { pdfjs } = await import('react-pdf');
  await import('@/lib/pdfWorker');

  // pdf.js takes ownership of the buffer it is given, so hand it a copy —
  // the caller still needs the original for hashing and storage.
  const copy = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
  const doc = await pdfjs.getDocument({ data: copy }).promise;
  try {
    if (pageNumber > doc.numPages) return null;
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    await page.render({ canvasContext: context, viewport }).promise;
    return canvas;
  } finally {
    await doc.destroy();
  }
}

/** Crop to the band of the page worth reading. */
function crop(source: HTMLCanvasElement, region: OcrRegion): HTMLCanvasElement {
  if (region === 'full') return source;

  // State forms print their name in the footer; MCO letterhead sits at the top.
  const fraction = 0.22;
  const height = Math.ceil(source.height * fraction);
  const top = region === 'header' ? 0 : source.height - height;

  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = height;
  const context = out.getContext('2d');
  if (!context) return source;
  context.drawImage(source, 0, top, source.width, height, 0, 0, source.width, height);
  return out;
}

export interface OcrResult {
  text: string;
  /** Which regions actually produced readable text. */
  regionsRead: OcrRegion[];
  msElapsed: number;
}

/**
 * Read the printed text from a scanned PDF.
 *
 * Only the header and footer of the first page are read by default, which is
 * where a form's identity lives and is several times faster than the whole
 * page. Pass `regions: ['full']` when the body text is genuinely needed.
 */
export async function ocrPdf(
  bytes: ArrayBuffer | Uint8Array,
  options: { regions?: OcrRegion[]; pageNumber?: number } = {},
): Promise<OcrResult> {
  const regions = options.regions ?? ['footer', 'header'];
  const started = Date.now();

  const canvas = await renderPage(bytes, options.pageNumber ?? 1);
  if (!canvas) return { text: '', regionsRead: [], msElapsed: Date.now() - started };

  const worker = await getWorker();
  const pieces: string[] = [];
  const regionsRead: OcrRegion[] = [];

  for (const region of regions) {
    try {
      const { data } = await worker.recognize(crop(canvas, region));
      const text = (data.text ?? '').replace(/\s+/g, ' ').trim();
      if (text) {
        pieces.push(text);
        regionsRead.push(region);
      }
    } catch {
      // One unreadable band should not lose the others.
    }
  }

  return {
    text: pieces.join(' \n '),
    regionsRead,
    msElapsed: Date.now() - started,
  };
}

/** True when the browser can run the engine at all. */
export function ocrSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined'
  );
}
