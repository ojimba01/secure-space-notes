// The weekly case log: its weeks, its pagination, and the PDF it builds.
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
      export { weekKey, weekStart, weekLabel, weekEndingText, weeksAvailable, FIRST_LOG_WEEK } from './src/lib/caseLog';
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
  weekKey, weekStart, weekLabel, weekEndingText, weeksAvailable, FIRST_LOG_WEEK,
  buildCaseLogPdf, mergeCaseLogPdfs, pagesNeeded, caseLogFileName, ROWS_PER_PAGE,
} = mod;

const BLANK = readFileSync('public/form-templates/hmis-case-log-weekly.pdf');
const blankBuffer = () => BLANK.buffer.slice(BLANK.byteOffset, BLANK.byteOffset + BLANK.byteLength);

const entry = (n) => ({
  clientName: `Client ${n}`,
  date: `2026-09-${String((n % 28) + 1).padStart(2, '0')}`,
  completed: true,
});

// ---- weeks --------------------------------------------------------------

test('a week runs Monday to Sunday and is named for its Sunday', () => {
  assert.equal(weekKey('2026-09-21'), '2026-09-27');   // Monday
  assert.equal(weekKey('2026-09-23'), '2026-09-27');   // Wednesday
  assert.equal(weekKey('2026-09-27'), '2026-09-27');   // Sunday is its own week's end
  assert.equal(weekKey('2026-09-28'), '2026-10-04');   // the next Monday is the next week
  assert.equal(weekStart('2026-09-27'), '2026-09-21');
});

test('a week crosses a month and a year end whole', () => {
  assert.equal(weekKey('2026-09-30'), '2026-10-04');
  assert.equal(weekKey('2026-12-31'), '2027-01-03');
  assert.equal(weekStart('2027-01-03'), '2026-12-28');
});

test('the Week Ending blank reads the way the form writes a date', () => {
  assert.equal(weekEndingText('2026-09-27'), '09/27/2026');
});

test('a week reads as its days', () => {
  assert.equal(weekLabel('2026-09-27'), 'Sep 21 – 27, 2026');
  assert.equal(weekLabel('2026-10-04'), 'Sep 28 – Oct 4, 2026');
  assert.equal(weekLabel('2027-01-03'), 'Dec 28, 2026 – Jan 3, 2027');
});

test('no week exists before touchpoints were logged in the app', () => {
  const weeks = weeksAvailable(new Date(2026, 8, 23, 12));
  assert.deepEqual(weeks, ['2026-09-27', '2026-09-20', '2026-09-13', '2026-09-06']);
  assert.equal(weeks.at(-1), FIRST_LOG_WEEK);
  assert.equal(weekKey('2026-09-01'), FIRST_LOG_WEEK);
});

test('a Sunday evening is still that Sunday\'s week', () => {
  // Local time, not UTC: 9pm on a Sunday in New Jersey is Monday in UTC.
  assert.equal(weeksAvailable(new Date(2026, 8, 27, 21))[0], '2026-09-27');
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
  const bytes = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Shade Adeyemi', weekEnding: '09/27/2026' }, []);
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
    { caseManager: 'Shade Adeyemi', weekEnding: '09/27/2026' },
    [{ clientName: 'Kearria Francis', date: '2026-09-24', completed: true }],
  );
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getTextField('Row_1_Num').getText(), '1');
  assert.equal(form.getTextField('Row_1_Client_Name').getText(), 'Kearria Francis');
  assert.equal(form.getTextField('Row_1_Date').getText(), '09/24/2026');
  // The weekly form has no phone column, so the log has no phone field.
  assert.throws(() => form.getTextField('Row_1_Phone'));
  assert.equal(form.getCheckBox('Row_1_Completed').isChecked(), true);
});

test('a touchpoint that did not happen leaves the tick empty', async () => {
  const bytes = await buildCaseLogPdf(
    blankBuffer(),
    { caseManager: 'A', weekEnding: '09/27/2026' },
    [{ clientName: 'Someone', date: '2026-09-24', completed: false }],
  );
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getCheckBox('Row_1_Completed').isChecked(), false);
});

test('forty touchpoints run onto a second page, numbered straight through', async () => {
  const entries = Array.from({ length: 40 }, (_, i) => entry(i + 1));
  const bytes = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Shade Adeyemi', weekEnding: '09/27/2026' }, entries);
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

test('every page says whose week it is', async () => {
  const entries = Array.from({ length: 35 }, (_, i) => entry(i + 1));
  const bytes = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Shade Adeyemi', weekEnding: '09/27/2026' }, entries);
  const form = (await PDFDocument.load(bytes)).getForm();
  assert.equal(form.getTextField('Case_Manager').getText(), 'Shade Adeyemi');
  assert.equal(form.getTextField('Case_Manager_p2').getText(), 'Shade Adeyemi');
  assert.equal(form.getTextField('Week_Ending').getText(), '09/27/2026');
  assert.equal(form.getTextField('Week_Ending_p2').getText(), '09/27/2026');
});

test('a hundred touchpoints need four pages and no field name collides', async () => {
  const entries = Array.from({ length: 100 }, (_, i) => entry(i + 1));
  const bytes = await buildCaseLogPdf(blankBuffer(), { caseManager: 'A', weekEnding: '09/27/2026' }, entries);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 4);
  const names = pdf.getForm().getFields().map((f) => f.getName());
  assert.equal(new Set(names).size, names.length, 'field names must be unique across pages');
  assert.equal(pdf.getForm().getTextField('Row_100_Client_Name').getText(), 'Client 100');
});

test('the file name says whose log it is and which week', () => {
  assert.equal(
    caseLogFileName('Shade Adeyemi', '09/27/2026'),
    'HMIS Case Log — Shade Adeyemi — week ending 09-27-2026.pdf',
  );
});

test('a name with a slash cannot break out of the file name', () => {
  assert.ok(!caseLogFileName('A/B', '09/27/2026').includes('/'));
});

// ---- merging a range -----------------------------------------------------

test('a range merges into one document with every page kept', async () => {
  const sept = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Shade', weekEnding: '09/27/2026' },
    Array.from({ length: 35 }, (_, i) => entry(i + 1)));           // 2 pages
  const oct = await buildCaseLogPdf(blankBuffer(), { caseManager: 'Khyla', weekEnding: '10/04/2026' },
    [entry(1)]);                                                    // 1 page
  const merged = await mergeCaseLogPdfs([sept, oct]);
  const pdf = await PDFDocument.load(merged);
  assert.equal(pdf.getPageCount(), 3);
});

test('merging flattens the forms, so repeated field names cannot collide', async () => {
  const a = await buildCaseLogPdf(blankBuffer(), { caseManager: 'A', weekEnding: '09/27/2026' }, [entry(1)]);
  const b = await buildCaseLogPdf(blankBuffer(), { caseManager: 'B', weekEnding: '10/04/2026' }, [entry(2)]);
  const pdf = await PDFDocument.load(await mergeCaseLogPdfs([a, b]));
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getForm().getFields().length, 0, 'a merged range carries no live form fields');
});

test('merging nothing says so rather than handing back a blank page', async () => {
  // pdf-lib turns a pageless document into a single empty page, which would
  // look like a real but unfilled form. Refusing is the honest answer.
  await assert.rejects(() => mergeCaseLogPdfs([]), /no logs to merge/i);
});
