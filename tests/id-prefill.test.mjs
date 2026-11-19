// The Medicaid number and the MCO member ID are different numbers. Each form
// gets each one in its own box, from the client record, the same way the
// intake holds them (Medicaid # and MCO #).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const bundle = await build({
  stdin: { contents: `export { templateFieldValues, prefillTemplate, fillBlankIds } from './src/lib/formAutofill';`, resolveDir: process.cwd() },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { templateFieldValues, prefillTemplate, fillBlankIds } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const client = { first_name: 'Dana', last_name: 'Reyes', medicaid_id: '123456789012 ', member_id: '7654321' };
const MEDICAID = '123456789012';
const MEMBER = '7654321';

const forms = [
  ['Client Intake', 'client-intake.pdf', { medicaid_number: MEDICAID, mco_number: MEMBER }],
  ['Initial Assessment (IAT)', 'initial-assessment-tool.pdf', { '5 Medicaid ID': MEDICAID, '7 MCO Member ID optional': MEMBER }],
  [
    'Level of Need (LON)',
    'level-of-need-assessment-tool.pdf',
    {
      '3 Medicaid ID not scored but Medicaid and MCO enrollment required for eligibility': MEDICAID,
      '4 MCO Member ID not scored but Medicaid and MCO enrollment required for eligibility': MEMBER,
    },
  ],
  ['Housing Stabilization Plan (HSP)', 'housing-stabilization-plan.pdf', { 'Medicaid ID': MEDICAID }],
];

for (const [type, file, expected] of forms) {
  test(`${type}: the Medicaid number and member ID go in their own boxes`, async () => {
    const values = templateFieldValues(type, client);
    for (const [box, value] of Object.entries(expected)) assert.equal(values[box], value, box);
    const bytes = await prefillTemplate(readFileSync(`public/form-templates/${file}`), type, client);
    const form = (await PDFDocument.load(bytes)).getForm();
    for (const [box, value] of Object.entries(expected)) assert.equal(form.getTextField(box).getText(), value, box);
  });
}

test('a form started without the numbers gets them in its blank boxes only', async () => {
  const blank = await PDFDocument.load(readFileSync('public/form-templates/level-of-need-assessment-tool.pdf'));
  const typed = '4 MCO Member ID not scored but Medicaid and MCO enrollment required for eligibility';
  blank.getForm().getTextField(typed).setText('TYPED-BY-STAFF');
  const filled = await fillBlankIds(await blank.save(), 'Level of Need (LON)', client);
  const form = (await PDFDocument.load(filled)).getForm();
  assert.equal(form.getTextField('3 Medicaid ID not scored but Medicaid and MCO enrollment required for eligibility').getText(), MEDICAID);
  assert.equal(form.getTextField(typed).getText(), 'TYPED-BY-STAFF');
  assert.equal(await fillBlankIds(filled, 'Level of Need (LON)', client), null, 'nothing left to fill');
});
