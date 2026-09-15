// Question 52 of the Client Intake: who else will be living with the member.
//
// The form has six rows of name, age and relationship. The table behind them
// takes as many rows as a form carries, so what matters here is that the six on
// the page are all read — the old form had four, and a fifth and sixth name
// went into the PDF and nowhere else.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { PDFDocument, PDFTextField } from 'pdf-lib';

const bundle = await build({
  stdin: {
    contents: `
      export { intakeDraftFromPdfFields, INTAKE_HOUSEHOLD_PREFIXES } from './src/lib/clientIntake';
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
        contents: 'export const supabase = {};',
      }));
    },
  }],
});
const { intakeDraftFromPdfFields, INTAKE_HOUSEHOLD_PREFIXES } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const ROWS = [1, 2, 3, 4, 5, 6];

test('the template has six household rows, each the same as the last', async () => {
  const doc = await PDFDocument.load(readFileSync('public/form-templates/client-intake.pdf'));
  const fields = new Map(
    doc.getForm().getFields()
      .filter((f) => f instanceof PDFTextField)
      .map((f) => [f.getName(), f]),
  );

  const shape = (name) => {
    const field = fields.get(name);
    assert.ok(field, `${name} is missing from the template`);
    const { width, height } = field.acroField.getWidgets()[0].getRectangle();
    return { width: Math.round(width), height: Math.round(height), max: field.getMaxLength() };
  };

  for (const part of ['name', 'age', 'relationship']) {
    const shapes = ROWS.map((row) => shape(`member_${row}_${part}`));
    // Every row is the same size and takes the same amount of text.
    for (const row of shapes) assert.deepEqual(row, shapes[0], `member_*_${part} rows differ`);
    assert.equal(shapes[0].max, 100);
  }
});

test('the rows sit one under another, in order down the page', async () => {
  const doc = await PDFDocument.load(readFileSync('public/form-templates/client-intake.pdf'));
  const top = (name) => {
    const field = doc.getForm().getField(name);
    return field.acroField.getWidgets()[0].getRectangle().y;
  };
  // PDF coordinates count up from the foot of the page, so each row sits lower.
  const tops = ROWS.map((row) => top(`member_${row}_name`));
  for (let i = 1; i < tops.length; i += 1) {
    assert.ok(tops[i] < tops[i - 1], `row ${i + 1} is not below row ${i}`);
  }
  // Evenly spaced, like the four that were there before.
  const gaps = tops.slice(1).map((t, i) => Math.round(tops[i] - t));
  assert.deepEqual(gaps, [47, 47, 47, 47, 47]);

  // And the comments box that follows them is clear of the last row.
  const comments = doc.getForm().getField('additional_comments').acroField.getWidgets()[0].getRectangle();
  const lastRow = doc.getForm().getField('member_6_relationship').acroField.getWidgets()[0].getRectangle();
  assert.ok(comments.y + comments.height < lastRow.y, 'the comments box overlaps the last row');
});

test('all six members are read out of a submitted form', () => {
  const raw = {};
  for (const row of ROWS) {
    raw[`member_${row}_name`] = `Member ${row}`;
    raw[`member_${row}_age`] = `${10 + row}`;
    raw[`member_${row}_relationship`] = row === 1 ? 'Spouse' : 'Child';
  }

  const { household, unmapped } = intakeDraftFromPdfFields(raw);
  assert.equal(household.length, 6);
  assert.deepEqual(household.map((m) => m.name), ROWS.map((r) => `Member ${r}`));
  assert.equal(household[5].age, '16');
  assert.equal(household[5].relationship, 'Child');
  assert.deepEqual(unmapped, []);
});

test('a row left blank is not a household member', () => {
  const { household } = intakeDraftFromPdfFields({
    member_1_name: 'Alvarez, Marisol',
    member_1_relationship: 'Daughter',
    // Rows two to five untouched; someone filled the last one in.
    member_6_name: 'Alvarez, Tomas',
    member_6_age: '9',
  });
  assert.deepEqual(household.map((m) => m.name), ['Alvarez, Marisol', 'Alvarez, Tomas']);
});

test('the prefixes and the template agree on how many rows there are', async () => {
  const doc = await PDFDocument.load(readFileSync('public/form-templates/client-intake.pdf'));
  const onForm = doc.getForm().getFields()
    .map((f) => f.getName())
    .filter((n) => /^member_\d+_name$/.test(n));
  assert.equal(onForm.length, INTAKE_HOUSEHOLD_PREFIXES.length);
});
