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
import { PDFDocument, PDFTextField, StandardFonts } from 'pdf-lib';

const bundle = await build({
  stdin: {
    contents: `export { relaxPdfFormFields } from './src/lib/pdfFormFields';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { relaxPdfFormFields } = await import(
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
