// Opening a Move-in Supports form for a client fills in what the record knows.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';

const bundle = await build({
  stdin: {
    contents: `
      export { templateFieldValues, prefillTemplate } from './src/lib/formAutofill';
      export { MOVE_IN_FORM_FIELDS } from './src/lib/moveIn';
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
      b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const supabase = {};' }));
    },
  }],
});
const { templateFieldValues, prefillTemplate, MOVE_IN_FORM_FIELDS } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const TYPE = 'Move-In Supports Request';
const HORIZON = 'public/form-templates/move-in-supports-request.pdf';
const WELLPOINT = 'public/form-templates/wellpoint-move-in-supports-request.pdf';

const client = {
  first_name: 'Kearria', last_name: 'Francis',
  phone: '(973) 555-0142', member_id: 'H123456', medicaid_id: '12345678901',
  address: '9 Elm St, Camden, NJ 08102', county: 'Camden',
  move_in_date: '2026-10-01',
  new_address: '412 Broad Street, Apt 3B', new_city_state_zip: 'Newark, NJ 07102',
  apartment_complex_name: 'Broad Street Commons',
  landlord_name: 'Broad Street Holdings LLC', landlord_phone: '(973) 555-0100',
  landlord_email: 'leasing@broadst.example',
  realtor_name: 'R', realtor_phone: '1', realtor_email: 'r@example.com',
};

const names = async (file) =>
  new Set((await PDFDocument.load(readFileSync(file))).getForm().getFields().map((f) => f.getName()));

test('every field the mapping writes is on one of the two forms', async () => {
  const horizon = await names(HORIZON);
  const wellpoint = await names(WELLPOINT);
  const missing = Object.keys(templateFieldValues(TYPE, client, { name: 'Shade' }))
    .filter((k) => !horizon.has(k) && !wellpoint.has(k));
  assert.deepEqual(missing, []);
});

test('the move-in columns land where a submitted form is read back from', () => {
  const values = templateFieldValues(TYPE, client);
  for (const [column, field] of Object.entries(MOVE_IN_FORM_FIELDS)) {
    if (column === 'move_in_date') continue;
    assert.equal(values[field], client[column], `${column} → ${field}`);
  }
  assert.equal(values.anticipated_move_in_date, '10/01/2026');
});

test('Horizon opens with the member and the move filled in', async () => {
  const form = (await PDFDocument.load(await prefillTemplate(readFileSync(HORIZON), TYPE, client))).getForm();
  assert.equal(form.getTextField('member_name').getText(), 'Kearria Francis');
  assert.equal(form.getTextField('member_name_allergy').getText(), 'Kearria Francis');
  assert.equal(form.getTextField('new_street_address').getText(), '412 Broad Street, Apt 3B');
  assert.equal(form.getTextField('name_of_landlord').getText(), 'Broad Street Holdings LLC');
});

test('Wellpoint opens with the member and the new address', async () => {
  const form = (await PDFDocument.load(await prefillTemplate(readFileSync(WELLPOINT), TYPE, client))).getForm();
  assert.equal(form.getTextField('Member name head of household').getText(), 'Kearria Francis');
  assert.equal(form.getTextField('Member ID Medicaid ID').getText(), '12345678901');
  assert.equal(form.getTextField("Member's new address").getText(), '412 Broad Street, Apt 3B, Newark, NJ 07102');
  assert.equal(form.getTextField('Anticipated movein date').getText(), '10/01/2026');
});
