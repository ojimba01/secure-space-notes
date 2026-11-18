// Web versions of the PDF forms (src/lib/webForms). Every question in a web
// form fills a box of the PDF by name, so a renamed or missing box would
// silently drop that answer from the saved document.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PDFDocument, PDFCheckBox, PDFRadioGroup } from 'pdf-lib';

const bundle = await build({
  stdin: {
    contents: `export { CLIENT_INTAKE_WEB_FORM } from './src/lib/webForms/clientIntake';
export { schemaFields } from './src/lib/webForms/types';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { CLIENT_INTAKE_WEB_FORM, schemaFields } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const norm = (s) => String(s).replace(/[^a-z0-9]/gi, '').toLowerCase();

test('every Client Intake question fills a box on the PDF', async () => {
  const doc = await PDFDocument.load(readFileSync('public/form-templates/client-intake.pdf'));
  const names = new Set(doc.getForm().getFields().map((f) => f.getName()));
  for (const field of schemaFields(CLIENT_INTAKE_WEB_FORM)) {
    assert.ok(names.has(field), `${field} is not a box on the PDF`);
  }
});

test('every box on the Client Intake PDF has a question', async () => {
  const doc = await PDFDocument.load(readFileSync('public/form-templates/client-intake.pdf'));
  const asked = new Set(schemaFields(CLIENT_INTAKE_WEB_FORM));
  for (const f of doc.getForm().getFields()) {
    assert.ok(asked.has(f.getName()), `${f.getName()} has no question in the web form`);
  }
});

test('every choice is one the PDF offers', async () => {
  const doc = await PDFDocument.load(readFileSync('public/form-templates/client-intake.pdf'));
  const form = doc.getForm();
  for (const section of CLIENT_INTAKE_WEB_FORM) {
    for (const item of section.items) {
      if (item.kind !== 'choice') continue;
      const field = form.getField(item.field);
      assert.ok(field instanceof PDFRadioGroup, `${item.field} is not a choice on the PDF`);
      const offered = field.getOptions().map(norm);
      for (const o of item.options) assert.ok(offered.includes(norm(o.value)), `${item.field}: ${o.value} is not on the PDF`);
    }
    for (const item of section.items) {
      if (item.kind !== 'checks') continue;
      for (const o of item.options) assert.ok(form.getField(o.field) instanceof PDFCheckBox, `${o.field} is not a tick box`);
    }
  }
});
