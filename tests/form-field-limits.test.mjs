// The intake's big answer boxes.
//
// The template was generated with `/MaxLen 100` on every text field, so the
// tall boxes — "List all medical diagnoses", "Present Address", "Additional
// Notes" — stopped accepting text after roughly one line. What matters here is
// that no multi-line field in a shipped template carries a cap, and that a form
// saved before the fix loses its cap on the way back in.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { inflateSync } from 'node:zlib';
import { PDFDocument, PDFName, PDFRef, PDFTextField, StandardFonts } from 'pdf-lib';

const bundle = await build({
  stdin: {
    contents: `export { relaxPdfFormFields, fitMultilineText } from './src/lib/pdfFormFields';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { relaxPdfFormFields, fitMultilineText } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const textFields = async (bytes) => {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getForm().getFields().filter((f) => f instanceof PDFTextField);
};

/** The size in a `/Helv 10 Tf 0 g` default appearance; 0 means size-to-fit. */
const fontSize = (field) => {
  const da = field.acroField.getDefaultAppearance();
  const match = da?.match(/(\d+(?:\.\d+)?)\s+Tf/);
  return match ? Number(match[1]) : undefined;
};

test('no big box in the intake template caps what can be written in it', async () => {
  const fields = await textFields(readFileSync('public/form-templates/client-intake.pdf'));
  const multiline = fields.filter((f) => f.isMultiline());

  // Questions 10, 15, 17, 23, 25, 28, 30, 53 and Additional Notes.
  assert.equal(multiline.length, 9);
  for (const field of multiline) {
    assert.equal(field.getMaxLength(), undefined, `${field.getName()} still has a length cap`);
    // A fixed size would print only as much of the answer as the box holds.
    assert.equal(fontSize(field), 0, `${field.getName()} still has a fixed font size`);
  }
});

test('one-line fields keep their cap — a date of birth has no long answer', async () => {
  const fields = await textFields(readFileSync('public/form-templates/client-intake.pdf'));
  const birthDate = fields.find((f) => f.getName() === 'birth_date');
  assert.equal(birthDate.getMaxLength(), 100);
  assert.equal(birthDate.isMultiline(), false);
});

test('a form saved under the old cap loses it when it is reopened', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const form = doc.getForm();

  const big = form.createTextField('notes');
  big.enableMultiline();
  big.setMaxLength(100);
  big.setText('what the case manager managed to type before it stopped');
  big.addToPage(page, { x: 20, y: 400, width: 500, height: 120 });

  const small = form.createTextField('phone');
  small.setMaxLength(20);
  small.addToPage(page, { x: 20, y: 360, width: 200, height: 16 });

  form.updateFieldAppearances(await doc.embedFont(StandardFonts.Helvetica));
  const relaxed = await relaxPdfFormFields(await doc.save());

  const fields = await textFields(relaxed);
  const reopened = fields.find((f) => f.getName() === 'notes');
  assert.equal(reopened.getMaxLength(), undefined);
  assert.equal(fontSize(reopened), 0);
  // The answer already in the field is untouched.
  assert.equal(reopened.getText(), 'what the case manager managed to type before it stopped');
  // And a one-line field is left exactly as it was.
  assert.equal(fields.find((f) => f.getName() === 'phone').getMaxLength(), 20);
});

test('a PDF with no form at all comes back byte for byte', async () => {
  const doc = await PDFDocument.create();
  doc.addPage();
  const scan = await doc.save();
  assert.deepEqual(await relaxPdfFormFields(scan), scan);
});

// ---------------------------------------------------------------------------
// The printed page
// ---------------------------------------------------------------------------

/**
 * A one-page form with a box the size of the intake's question 10, filled in
 * the way the viewer leaves it: size-to-fit type, an answer, no appearance
 * anybody has checked fits.
 */
const filledBigBox = async (answer) => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  const field = form.createTextField('medical_diagnoses');
  field.addToPage(page, { x: 54, y: 658, width: 504, height: 66 });
  field.enableMultiline();
  field.setFontSize(0);
  field.setText(answer);
  // Without drawing anything: the point of the fixture is an answer nobody has
  // yet fitted to the box, which is what the viewer hands over.
  return doc.save({ updateFieldAppearances: false });
};

/** Where every line of a field's appearance sits, and how large its type is. */
const drawnLines = async (bytes, name) => {
  const doc = await PDFDocument.load(bytes);
  const field = doc.getForm().getField(name);
  const widget = field.acroField.getWidgets()[0];
  let stream = widget.getNormalAppearance();
  if (stream instanceof PDFRef) stream = doc.context.lookup(stream);
  const raw = stream.getContents();
  const flate = String(stream.dict.get(PDFName.of('Filter'))) === '/FlateDecode';
  const content = new TextDecoder('latin1').decode(flate ? inflateSync(raw) : raw);
  const height = widget.getRectangle().height;
  const hex = (h) => Buffer.from(h, 'hex').toString('latin1');
  return {
    fontSize: Number(content.match(/\/\S+ ([\d.]+) Tf/)?.[1]),
    // One `Tm` per line, each placing that line's baseline within the box.
    baselines: [...content.matchAll(/1 0 0 1 [\d.-]+ ([\d.-]+) Tm/g)].map((m) => Number(m[1])),
    height,
    text: [...content.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((m) => hex(m[1])).join(' '),
  };
};

test('a long answer is printed whole, inside its box', async () => {
  const answer = `${'diagnosis hypertension neuropathy osteoarthritis '.repeat(14)}LAST`;
  const fitted = await fitMultilineText(await filledBigBox(answer));
  const drawn = await drawnLines(fitted, 'medical_diagnoses');

  assert.ok(drawn.baselines.length > 1, 'the answer should wrap onto several lines');
  // Nothing drawn below the bottom edge, where it would not print.
  const lowest = Math.min(...drawn.baselines);
  assert.ok(lowest > 0, `the last line sits ${lowest}pt below the box`);
  assert.ok(lowest + drawn.fontSize <= drawn.height, 'the first line should be inside the box');
  assert.ok(drawn.text.endsWith('LAST'), 'the end of the answer should be on the page');
});

test('a short answer is printed at the size the rest of the form uses', async () => {
  const fitted = await fitMultilineText(await filledBigBox('Type 2 diabetes.'));
  const drawn = await drawnLines(fitted, 'medical_diagnoses');
  assert.equal(drawn.fontSize, 10);
});

test('the field keeps exactly what was typed, letter for letter', async () => {
  // Helvetica cannot draw "ễ", so the page shows "Nguyen" — but the record is
  // read from the field, and the field is untouched.
  const answer = 'Referred by Nguyễn Thị Hoa — see the “blue folder”.';
  const fitted = await fitMultilineText(await filledBigBox(answer));

  const doc = await PDFDocument.load(fitted);
  const field = doc.getForm().getField('medical_diagnoses');
  assert.equal(field.getText(), answer);
  // And it is still size-to-fit, so the next edit is not pinned to one size.
  assert.equal(fontSize(field), 0);

  const drawn = await drawnLines(fitted, 'medical_diagnoses');
  assert.match(drawn.text, /Nguyen Thi Hoa/);
  assert.match(drawn.text, /blue folder/);
});

test('the one-line fields around it are not touched', async () => {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();

  const big = form.createTextField('medical_diagnoses');
  big.addToPage(page, { x: 54, y: 658, width: 504, height: 66 });
  big.enableMultiline();
  big.setFontSize(0);
  big.setText('diagnosis hypertension neuropathy '.repeat(20));

  const name = form.createTextField('full_name');
  name.setText('Alvarez, Marisol');
  // Drawn the ordinary way, so there is a real appearance to compare against.
  name.addToPage(page, { x: 54, y: 730, width: 452, height: 16 });

  const before = await doc.save({ updateFieldAppearances: false });
  const after = await fitMultilineText(before);

  const untouched = await drawnLines(after, 'full_name');
  assert.equal(untouched.text, 'Alvarez, Marisol');
  assert.deepEqual(untouched, await drawnLines(before, 'full_name'));
  // And the big box did change, or this test is proving nothing.
  assert.notDeepEqual(
    await drawnLines(after, 'medical_diagnoses'),
    await drawnLines(before, 'medical_diagnoses'),
  );
});

test('an empty box is left alone', async () => {
  const blank = await filledBigBox('');
  assert.deepEqual(await fitMultilineText(blank), blank);
});
