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
export { AETNA_PRIOR_AUTHORIZATION_WEB_FORM } from './src/lib/webForms/aetnaPriorAuthorization';
export { WELLPOINT_SUPPORT_SERVICES_WEB_FORM } from './src/lib/webForms/wellpointSupportServices';
export { webFormFor } from './src/lib/webForms';
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
  ['Prior Authorization Request (Aetna)', mod.AETNA_PRIOR_AUTHORIZATION_WEB_FORM, 'aetna-prior-authorization.pdf'],
  ['Prior Authorization Request (Wellpoint)', mod.WELLPOINT_SUPPORT_SERVICES_WEB_FORM, 'wellpoint-support-services-request.pdf'],
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

// The web form reads boxes as the browser's PDF reader (pdf.js) lists them.
// Some boxes are listed with an empty container first (the LON's Score_14 was
// left with no choices); WebFormView skips those, and this checks every
// dropdown then has its choices and every question has a box with a type.
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
for (const [name, schema, file] of FORMS) {
  test(`${name}: the browser's PDF reader finds every box and dropdown choice`, async () => {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(`public/form-templates/${file}`)), verbosity: 0 }).promise;
    const all = (await doc.getFieldObjects()) ?? {};
    const boxes = (field) => (all[field] ?? []).filter((o) => o.type);
    for (const field of schemaFields(schema)) assert.ok(boxes(field).length, `${field} has no box the reader can fill`);
    for (const section of schema) {
      for (const item of section.items) {
        if (item.kind === 'select') assert.ok(boxes(item.field)[0]?.items?.length, `${item.field} has no choices`);
      }
    }
  });
}

// One form type can be several MCOs' forms: each opens as its own web form,
// and one with no web form yet opens as its PDF.
test('the web form is picked by the boxes on the PDF opened', async () => {
  const names = async (file) => (await load(file)).getFields().map((f) => f.getName());
  assert.equal(mod.webFormFor('Prior Authorization Request', await names('aetna-prior-authorization.pdf')), mod.AETNA_PRIOR_AUTHORIZATION_WEB_FORM);
  assert.equal(mod.webFormFor('Prior Authorization Request', await names('wellpoint-support-services-request.pdf')), mod.WELLPOINT_SUPPORT_SERVICES_WEB_FORM);
  assert.equal(mod.webFormFor('Move-In Supports Request', await names('move-in-supports-request.pdf')), null);
  assert.equal(mod.webFormFor('Level of Need (LON)', await names('level-of-need-assessment-tool.pdf')), mod.LEVEL_OF_NEED_WEB_FORM);
});
