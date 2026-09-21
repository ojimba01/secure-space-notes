// Where a member is moving to, coming from a form and going back to one.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { PDFDocument, PDFTextField } from 'pdf-lib';

const bundle = await build({
  stdin: {
    contents: `export { moveInFromFormFields, moveInWriteBack, MOVE_IN_FORM_FIELDS, MOVE_IN_COLUMNS } from './src/lib/moveIn';`,
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
const { moveInFromFormFields, moveInWriteBack, MOVE_IN_FORM_FIELDS, MOVE_IN_COLUMNS } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const submitted = {
  anticipated_move_in_date: '10/01/2026',
  new_street_address: '412 Broad Street, Apt 3B',
  new_city_town_zip: 'Newark, NJ 07102',
  name_of_landlord: 'Broad Street Holdings LLC',
  landlord_phone: '(973) 555-0142',
};

test('a submitted form is read into the columns it fills', () => {
  const read = moveInFromFormFields(submitted);
  assert.equal(read.new_address, '412 Broad Street, Apt 3B');
  assert.equal(read.landlord_name, 'Broad Street Holdings LLC');
  // A date column will not take 10/01/2026.
  assert.equal(read.move_in_date, '2026-10-01');
  // Nothing invented for the boxes nobody filled in.
  assert.ok(!('realtor_name' in read));
});

test('an unreadable date is left out rather than guessed at', () => {
  assert.equal(moveInFromFormFields({ anticipated_move_in_date: 'next month' }).move_in_date, null);
  assert.equal(moveInFromFormFields({ anticipated_move_in_date: '2026-10-01' }).move_in_date, '2026-10-01');
});

test('a form fills what is empty and argues about the rest', () => {
  const { fill, conflicts } = moveInWriteBack(moveInFromFormFields(submitted), {
    new_address: '412 Broad Street, Apt 3B',        // the same, so nothing to do
    landlord_name: 'Broad St Holdings',              // not the same
    move_in_date: null,                              // empty, so the form fills it
  });

  assert.equal(fill.move_in_date, '2026-10-01');
  assert.equal(fill.new_city_state_zip, 'Newark, NJ 07102');
  assert.ok(!('new_address' in fill), 'an identical value is not a change');
  assert.ok(!('landlord_name' in fill), 'a disagreement is never written');

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].label, 'Landlord');
  assert.equal(conflicts[0].formValue, 'Broad Street Holdings LLC');
  assert.equal(conflicts[0].recordValue, 'Broad St Holdings');
});

test('an empty form changes nothing', () => {
  const { fill, conflicts } = moveInWriteBack(moveInFromFormFields({}), { landlord_name: 'Somebody' });
  assert.deepEqual(fill, {});
  assert.deepEqual(conflicts, []);
});

test('every column names a field that is really on the form', async () => {
  const doc = await PDFDocument.load(readFileSync('public/form-templates/move-in-supports-request.pdf'));
  const onForm = new Set(doc.getForm().getFields().map((f) => f.getName()));
  for (const key of MOVE_IN_COLUMNS) {
    const field = MOVE_IN_FORM_FIELDS[key];
    assert.ok(onForm.has(field), `${key} maps to "${field}", which is not on the form`);
  }
});

test('the three pages asking for the member’s name are named apart', async () => {
  const doc = await PDFDocument.load(readFileSync('public/form-templates/move-in-supports-request.pdf'));
  const names = doc.getForm().getFields().map((f) => f.getName());
  // One name over three separate fields would leave the form ambiguous about
  // which is which, and they would not share a value anyway.
  assert.deepEqual(names.filter((n) => n.startsWith('member_name')).sort(),
    ['member_name', 'member_name_allergy', 'member_name_remediation']);
  assert.equal(new Set(names).size, names.length, 'every field on the form has its own name');
});
