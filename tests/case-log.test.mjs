// The monthly case log: its months, its pagination, and the PDF it builds.
//
// The form has exactly thirty lines. A case manager carrying twenty clients at
// two touchpoints each needs forty, so overflow is the case that matters most
// and the one a reader of this file should check first.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PDFDocument } from 'pdf-lib';

const bundle = await build({
  stdin: {
    contents: `
      export { monthKey, monthLabel, monthsAvailable, FIRST_LOG_MONTH } from './src/lib/caseLog';
      export { buildCaseLogPdf, mergeCaseLogPdfs, pagesNeeded, caseLogFileName, ROWS_PER_PAGE } from './src/lib/caseLogForm';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  plugins: [{
    name: 'fake-database',
    setup(b) {
      b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
        contents: 'export const supabase = { from: (...a) => globalThis.fakeDB.from(...a) };',
      }));
    },
  }],
});
const mod = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const {
  monthKey, monthLabel, monthsAvailable, FIRST_LOG_MONTH,
  buildCaseLogPdf, mergeCaseLogPdfs, pagesNeeded, caseLogFileName, ROWS_PER_PAGE,
} = mod;

const BLANK = readFileSync('public/form-templates/hmis-case-log-monthly.pdf');
const blankBuffer = () => BLANK.buffer.slice(BLANK.byteOffset, BLANK.byteOffset + BLANK.byteLength);

const entry = (n) => ({
  clientName: `Client ${n}`,
  phone: `(973) 555-${String(1000 + n).slice(1)}`,
  date: `2026-09-${String((n % 28) + 1).padStart(2, '0')}`,
  completed: true,
});

// ---- months -------------------------------------------------------------

test('a month key is always the first of its month', () => {
  assert.equal(monthKey(new Date('2026-09-23T18:00:00Z')), '2026-09-01');
  assert.equal(monthKey('2026-12-31T00:00:00Z'), '2026-12-01');
});

test('a month reads the way a person writes it on the form', () => {
  assert.equal(monthLabel('2026-09-01'), 'September 2026');
  assert.equal(monthLabel('2027-01-01'), 'January 2027');
});

test('no month exists before touchpoints were logged in the app', () => {
  const months = monthsAvailable(new Date('2026-11-15T12:00:00Z'));
  assert.deepEqual(months, ['2026-11-01', '2026-10-01', '2026-09-01']);
  assert.equal(months.at(-1), FIRST_LOG_MONTH);
});

test('the month list crosses a year end without losing December', () => {
  const months = monthsAvailable(new Date('2027-02-03T12:00:00Z'));
  assert.equal(months[0], '2027-02-01');
  assert.ok(months.includes('2026-12-01'));
  assert.equal(months.at(-1), FIRST_LOG_MONTH);
});

// ---- pagination ---------------------------------------------------------

test('an empty log is still one page', () => {
  assert.equal(pagesNeeded(0), 1);
});

test('thirty entries fit one page and thirty-one do not', () => {
  assert.equal(ROWS_PER_PAGE, 30);
  assert.equal(pagesNeeded(30), 1);
  assert.equal(pagesNeeded(31), 2);
  assert.equal(pagesNeeded(60), 2);
  assert.equal(pagesNeeded(61), 3);
});

// ---- the PDF ------------------------------------------------------------

test('a blank form carries fields but no answers', async () => {
  const bytes = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Shade Adeyemi', month: 'September 2026' }, []);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  const form = pdf.getForm();
  assert.equal(form.getTextField('Case_Manager').getText(), 'Shade Adeyemi');
  assert.equal(form.getTextField('Row_1_Client_Name').getText(), undefined);
  assert.equal(form.getCheckBox('Row_1_Completed').isChecked(), false);
});

test('a filled row lands in the right boxes, with the date as the form asks', async () => {
  const bytes = await buildCaseLogPdf(
    blankBuffer(),
    { caseManager: 'Shade Adeyemi', month: 'September 2026' },
    [{ clientName: 'Kearria Francis', phone: '(973) 555-0142', date: '2026-09-04', completed: true }],
  );
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getTextField('Row_1_Num').getText(), '1');
  assert.equal(form.getTextField('Row_1_Client_Name').getText(), 'Kearria Francis');
  assert.equal(form.getTextField('Row_1_Phone').getText(), '(973) 555-0142');
  assert.equal(form.getTextField('Row_1_Date').getText(), '09/04/2026');
  assert.equal(form.getCheckBox('Row_1_Completed').isChecked(), true);
});

test('a touchpoint that did not happen leaves the tick empty', async () => {
  const bytes = await buildCaseLogPdf(
    blankBuffer(),
    { caseManager: 'A', month: 'September 2026' },
    [{ clientName: 'Someone', phone: null, date: '2026-09-04', completed: false }],
  );
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getCheckBox('Row_1_Completed').isChecked(), false);
  assert.equal(form.getTextField('Row_1_Phone').getText(), undefined);
});

test('forty touchpoints run onto a second page, numbered straight through', async () => {
  const entries = Array.from({ length: 40 }, (_, i) => entry(i + 1));
  const bytes = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Shade Adeyemi', month: 'September 2026' }, entries);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);

  const form = pdf.getForm();
  // Page one ends at thirty; page two picks up at thirty-one rather than one.
  assert.equal(form.getTextField('Row_30_Client_Name').getText(), 'Client 30');
  assert.equal(form.getTextField('Row_31_Client_Name').getText(), 'Client 31');
  assert.equal(form.getTextField('Row_31_Num').getText(), '31');
  assert.equal(form.getTextField('Row_40_Client_Name').getText(), 'Client 40');
  // The rows nobody filled stay empty rather than wrapping around.
  assert.equal(form.getTextField('Row_41_Client_Name').getText(), undefined);
});

test('every page says whose month it is', async () => {
  const entries = Array.from({ length: 35 }, (_, i) => entry(i + 1));
  const bytes = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Shade Adeyemi', month: 'September 2026' }, entries);
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getTextField('Case_Manager').getText(), 'Shade Adeyemi');
  assert.equal(form.getTextField('Case_Manager_p2').getText(), 'Shade Adeyemi');
  assert.equal(form.getTextField('Month_p2').getText(), 'September 2026');
});

test('a hundred touchpoints need four pages and no field name collides', async () => {
  const entries = Array.from({ length: 100 }, (_, i) => entry(i + 1));
  const bytes = await buildCaseLogPdf(blankBuffer(), { caseManager: 'A', month: 'September 2026' }, entries);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 4);
  const names = pdf.getForm().getFields().map((f) => f.getName());
  assert.equal(new Set(names).size, names.length, 'field names must be unique across pages');
  assert.equal(pdf.getForm().getTextField('Row_100_Client_Name').getText(), 'Client 100');
});

test('the file name says whose log it is and which month', () => {
  assert.equal(
    caseLogFileName('Shade Adeyemi', 'September 2026'),
    'HMIS Case Log — Shade Adeyemi — September 2026.pdf',
  );
});

test('a name with a slash cannot break out of the file name', () => {
  assert.ok(!caseLogFileName('A/B', 'September 2026').includes('/'));
});

// ---- merging a range -----------------------------------------------------

test('a range merges into one document with every page kept', async () => {
  const sept = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Shade', month: 'September 2026' },
    Array.from({ length: 35 }, (_, i) => entry(i + 1)));           // 2 pages
  const oct = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Khyla', month: 'October 2026' },
    [entry(1)]);                                                    // 1 page
  const merged = await mergeCaseLogPdfs([sept, oct]);
  const pdf = await PDFDocument.load(merged);
  assert.equal(pdf.getPageCount(), 3);
});

test('merging flattens the forms, so repeated field names cannot collide', async () => {
  const a = await buildCaseLogPdf(blankBuffer(), { caseManager: 'A', month: 'September 2026' }, [entry(1)]);
  const b = await buildCaseLogPdf(blankBuffer(), { caseManager: 'B', month: 'October 2026' }, [entry(2)]);
  const pdf = await PDFDocument.load(await mergeCaseLogPdfs([a, b]));
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getForm().getFields().length, 0, 'a merged range carries no live form fields');
});

test('merging nothing says so rather than handing back a blank page', async () => {
  // pdf-lib turns a pageless document into a single empty page, which would
  // look like a real but unfilled form. Refusing is the honest answer.
  await assert.rejects(() => mergeCaseLogPdfs([]), /no logs to merge/i);
});
