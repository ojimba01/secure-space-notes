// How the scheduled reader opens a PDF: unpdf (pdf.js built for servers) for
// the text layer, pdf-lib for the form fields — the same two sources the
// browser reads, with the same page cap.
import { PDFDocument } from 'npm:pdf-lib@1.17.1';
import { getDocumentProxy } from 'npm:unpdf@1.1.0';
import type { PdfReader } from '../_shared/documentReading.ts';

/** Text-layer pages to read, as in the browser. */
const MAX_TEXT_PAGES = 60;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A form's own field values, the way the browser's readFormValues reads them. */
async function formValues(bytes: Uint8Array): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    return out;
  }
  let fields;
  try {
    fields = doc.getForm().getFields();
  } catch {
    return out;
  }
  for (const field of fields) {
    try {
      const f = field as unknown as {
        getText?: () => string | undefined;
        isChecked?: () => boolean;
        getSelected?: () => string | string[] | undefined;
      };
      const name = field.getName();
      if (typeof f.getText === 'function') {
        const v = f.getText();
        if (v) out[name] = v;
      } else if (typeof f.isChecked === 'function') {
        if (f.isChecked()) out[name] = 'Yes';
      } else if (typeof f.getSelected === 'function') {
        const v = f.getSelected();
        if (Array.isArray(v) ? v.length : v) out[name] = Array.isArray(v) ? v.join(', ') : String(v);
      }
    } catch {
      // One damaged field never loses the rest.
    }
  }
  return out;
}

export const readOnServer: PdfReader = async (buffer) => {
  // Each library takes its own copy: pdf.js detaches the buffer it is handed.
  const fields = await formValues(new Uint8Array(buffer.slice(0)));

  const pdf = await getDocumentProxy(new Uint8Array(buffer.slice(0)));
  try {
    const pageCount = pdf.numPages;
    const readTo = Math.min(pageCount, MAX_TEXT_PAGES);
    const pages: string[] = [];
    for (let n = 1; n <= readTo; n++) {
      try {
        const page = await pdf.getPage(n);
        const content = await page.getTextContent();
        pages.push(content.items.map((i: unknown) => (i as { str?: string })?.str ?? '').join(' '));
      } catch {
        // One unreadable page should not lose the rest of the document.
      }
    }
    return {
      text: squash(pages.join('\n')),
      pageCount,
      truncated: pageCount > readTo,
      ocrApplied: false,
      formValues: fields,
    };
  } finally {
    await pdf.destroy().catch(() => {});
  }
};

