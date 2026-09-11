// The HMIS Case Log, made fillable.
//
// The form the state hands out is lines on a page: 152 places to write and not
// one form field, which is why nobody can type into it. Every other template in
// public/form-templates is a real AcroForm, so formAutofill.ts writes into the
// fields that are already there. This one has to grow its own.
//
// Fields are added at fill time rather than baked into the shipped PDF, and
// that is the whole reason the design works: a month that runs past thirty
// touchpoints needs a second page, a second page needs its own thirty fields,
// and two pages carrying the same field names would collide. Adding them here
// means page two's rows are Row_31 upward and nothing overlaps.
//
// Geometry was measured off the original with pdfjs, not guessed — the numbers
// below are the table's own rules. If the state reissues the form, re-measure
// before touching anything else.
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';

export const CASE_LOG_TEMPLATE = '/form-templates/hmis-case-log-monthly.pdf';

/** Vertical rules, left to right. The gaps between them are the columns. */
const COL = {
  num: [28, 55],
  client: [55, 347],
  phone: [347, 449],
  done: [449, 515],
  date: [515, 591],
} as const;

/** Horizontal rules below the header, top to bottom: 31 rules, 30 rows. */
const RULES = [
  829, 804, 778, 753, 728, 702, 677, 652, 627, 601, 576, 551, 526, 500, 475,
  450, 425, 400, 374, 349, 324, 299, 273, 248, 223, 198, 172, 147, 122, 96, 71,
] as const;

export const ROWS_PER_PAGE = RULES.length - 1;

export interface CaseLogEntry {
  /** The client met. Held so a row can be traced back to a record. */
  clientId?: string | null;
  clientName: string;
  phone?: string | null;
  /** ISO date of the touchpoint. */
  date?: string | null;
  completed: boolean;
}

export interface CaseLogHeader {
  caseManager: string;
  /** Already formatted for a person to read, e.g. "September 2026". */
  month: string;
}

const PAD = 2;

const cell = (col: readonly [number, number], top: number, bottom: number) => ({
  x: col[0] + PAD,
  y: bottom + PAD,
  width: col[1] - col[0] - PAD * 2,
  height: top - bottom - PAD * 2,
});

const mmddyyyy = (iso?: string | null): string => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${m}/${d}/${y}` : '';
};

/**
 * Lay one page's worth of fields over a page and fill them.
 *
 * `offset` is how many rows came before, so the numbering a case manager reads
 * runs 1 to 30, then 31 to 60, rather than restarting on every page.
 */
function layPage(
  pdf: PDFDocument,
  page: PDFPage,
  header: CaseLogHeader,
  entries: CaseLogEntry[],
  offset: number,
): void {
  const form = pdf.getForm();
  const suffix = offset === 0 ? '' : `_p${Math.floor(offset / ROWS_PER_PAGE) + 1}`;

  // The two blanks in the header sit on the underscores already printed there.
  // Repeated on every page, because a page that travels alone still has to say
  // whose month it is.
  const cm = form.createTextField(`Case_Manager${suffix}`);
  cm.addToPage(page, { x: 150, y: 868, width: 197, height: 15, borderWidth: 0 });
  cm.setText(header.caseManager);

  const month = form.createTextField(`Month${suffix}`);
  month.addToPage(page, { x: 440, y: 868, width: 96, height: 15, borderWidth: 0 });
  month.setText(header.month);

  for (let i = 0; i < ROWS_PER_PAGE; i++) {
    const n = offset + i + 1;
    const entry = entries[i];
    const top = RULES[i];
    const bottom = RULES[i + 1];

    // The number is a field rather than drawn text so a case manager can
    // renumber a log they have rearranged by hand.
    const num = form.createTextField(`Row_${n}_Num`);
    num.addToPage(page, { ...cell(COL.num, top, bottom), borderWidth: 0 });
    num.setAlignment(1);
    if (entry) num.setText(String(n));

    const name = form.createTextField(`Row_${n}_Client_Name`);
    name.addToPage(page, { ...cell(COL.client, top, bottom), borderWidth: 0 });
    if (entry) name.setText(entry.clientName);

    const phone = form.createTextField(`Row_${n}_Phone`);
    phone.addToPage(page, { ...cell(COL.phone, top, bottom), borderWidth: 0 });
    if (entry?.phone) phone.setText(entry.phone);

    // Completed is a tick because the column is a tick on the paper form.
    const done = form.createCheckBox(`Row_${n}_Completed`);
    const box = cell(COL.done, top, bottom);
    const side = Math.min(box.height, 12);
    done.addToPage(page, {
      x: box.x + (box.width - side) / 2,
      y: box.y + (box.height - side) / 2,
      width: side,
      height: side,
    });
    if (entry?.completed) done.check();

    const date = form.createTextField(`Row_${n}_Date`);
    date.addToPage(page, { ...cell(COL.date, top, bottom), borderWidth: 0 });
    if (entry) date.setText(mmddyyyy(entry.date));
  }
}

/** How many pages a log of this length needs. Always at least one. */
export const pagesNeeded = (count: number): number =>
  Math.max(1, Math.ceil(count / ROWS_PER_PAGE));

/**
 * The filled log, as bytes.
 *
 * `blank` is the flat template from public/form-templates. Pass no entries and
 * you get an empty fillable form, which is what a case manager downloading a
 * blank copy should get.
 */
export async function buildCaseLogPdf(
  blank: ArrayBuffer,
  header: CaseLogHeader,
  entries: CaseLogEntry[],
): Promise<Uint8Array> {
  const source = await PDFDocument.load(blank);
  const pdf = await PDFDocument.create();
  const font: PDFFont = await pdf.embedFont(StandardFonts.Helvetica);

  const pages = pagesNeeded(entries.length);
  for (let p = 0; p < pages; p++) {
    const [copied] = await pdf.copyPages(source, [0]);
    pdf.addPage(copied);
    const offset = p * ROWS_PER_PAGE;
    layPage(pdf, copied, header, entries.slice(offset, offset + ROWS_PER_PAGE), offset);
  }

  const form = pdf.getForm();
  form.getFields().forEach((f) => {
    const sized = f as unknown as { setFontSize?: (n: number) => void };
    if (typeof sized.setFontSize === 'function') sized.setFontSize(9);
  });
  form.updateFieldAppearances(font);

  return await pdf.save();
}

/**
 * Several built logs as one document.
 *
 * Field names repeat across the parts — every log has a `Row_1_Client_Name` —
 * so the forms are flattened on the way in. A run of months is read and
 * printed, never typed into, and flattening is what makes it open the same way
 * everywhere rather than depending on the reader's form support.
 */
export async function mergeCaseLogPdfs(parts: Uint8Array[]): Promise<Uint8Array> {
  // pdf-lib normalises a pageless document into one blank page, so merging
  // nothing would hand back a phantom form rather than nothing. Say so instead.
  if (parts.length === 0) throw new Error('There are no logs to merge.');

  const out = await PDFDocument.create();
  for (const part of parts) {
    const doc = await PDFDocument.load(part);
    doc.getForm().flatten();
    const pages = await out.copyPages(doc, doc.getPageIndices());
    pages.forEach((pg) => out.addPage(pg));
  }
  return await out.save();
}

/** The file name a downloaded log should carry. */
export const caseLogFileName = (caseManager: string, month: string): string =>
  `HMIS Case Log — ${caseManager} — ${month}.pdf`.replace(/[/\\]/g, '-');
