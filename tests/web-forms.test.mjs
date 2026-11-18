// Web versions of the PDF forms (src/lib/webForms). Every question in a web
// form fills a box of the PDF by name, so a renamed or missing box would
// silently drop that answer from the saved document.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PDFDocument, PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFSignature } from 'pdf-lib';

const bundle = await build({
  stdin: {
    contents: `export { CLIENT_INTAKE_WEB_FORM } from './src/lib/webForms/clientIntake';
export { INITIAL_ASSESSMENT_WEB_FORM } from './src/lib/webForms/initialAssessment';
export { LEVEL_OF_NEED_WEB_FORM } from './src/lib/webForms/levelOfNeed';
export { HOUSING_STABILIZATION_PLAN_WEB_FORM } from './src/lib/webForms/housingStabilizationPlan';
export { schemaFields } from './src/lib/webForms/types';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { schemaFields } = mod;

const FORMS = [
  ['Client Intake', mod.CLIENT_INTAKE_WEB_FORM, 'client-intake.pdf'],
  ['Initial Assessment (IAT)', mod.INITIAL_ASSESSMENT_WEB_FORM, 'initial-assessment-tool.pdf'],
  ['Level of Need (LON)', mod.LEVEL_OF_NEED_WEB_FORM, 'level-of-need-assessment-tool.pdf'],
  ['Housing Stabilization Plan (HSP)', mod.HOUSING_STABILIZATION_PLAN_WEB_FORM, 'housing-stabilization-plan.pdf'],
];

const norm = (s) => String(s).replace(/[^a-z0-9]/gi, '').toLowerCase();
const load = async (file) => (await PDFDocument.load(readFileSync(`public/form-templates/${file}`))).getForm();

for (const [name, schema, file] of FORMS) {
  test(`${name}: every question fills a box on the PDF`, async () => {
    const names = new Set((await load(file)).getFields().map((f) => f.getName()));
    for (const field of schemaFields(schema)) assert.ok(names.has(field), `${field} is not a box on the PDF`);
  });

  test(`${name}: every box on the PDF has a question`, async () => {
    const asked = new Set(schemaFields(schema));
    for (const f of (await load(file)).getFields()) {
      // A drawn signature is added with Add signature, not typed.
      if (f instanceof PDFSignature) continue;
      assert.ok(asked.has(f.getName()), `${f.getName()} has no question in the web form`);
    }
  });

  test(`${name}: every choice is one the PDF offers`, async () => {
    const form = await load(file);
    for (const section of schema) {
      for (const item of section.items) {
        if (item.kind === 'choice') {
          const field = form.getField(item.field);
          assert.ok(field instanceof PDFRadioGroup, `${item.field} is not a choice on the PDF`);
          const offered = field.getOptions().map(norm);
          for (const o of item.options) assert.ok(offered.includes(norm(o.value)), `${item.field}: ${o.value} is not on the PDF`);
        }
        if (item.kind === 'checks') {
          for (const o of item.options) assert.ok(form.getField(o.field) instanceof PDFCheckBox, `${o.field} is not a tick box`);
        }
        if (item.kind === 'select') {
          assert.ok(form.getField(item.field) instanceof PDFDropdown, `${item.field} is not a dropdown`);
        }
      }
    }
  });
}
