// Reading a member's NJ HMIS ID off the documents already on file.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { extractDocumentFields, fieldsFromFormValues, mergeDocumentFields } from './src/lib/documentFields';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { extractDocumentFields, fieldsFromFormValues, mergeDocumentFields } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test("the HSP's own NJ HMIS ID field is read", () => {
  assert.equal(fieldsFromFormValues({ 'NJ HMIS ID': '1234567' }).njhmisId, '1234567');
});

test('an HMIS ID is digits, however it was typed', () => {
  assert.equal(fieldsFromFormValues({ 'NJ HMIS ID': ' 123-4567 ' }).njhmisId, '1234567');
});

test('printed text gives one up when a number follows the label', () => {
  assert.equal(extractDocumentFields('Member Name: Jane Doe   NJ HMIS ID: 7654321').njhmisId, '7654321');
  assert.equal(extractDocumentFields('HMIS Client ID # 55512').njhmisId, '55512');
});

test('a blank label does not take the next line', () => {
  // How an unfilled form prints: the label, then the next question.
  assert.equal(extractDocumentFields('NJ HMIS ID:\n1. Name of provider').njhmisId, null);
  assert.equal(extractDocumentFields('NJ HMIS ID\n12 Housing goals').njhmisId, null);
});

test("a form field beats the page's printed text", () => {
  const merged = mergeDocumentFields(
    extractDocumentFields('NJ HMIS ID: 1111111'),
    fieldsFromFormValues({ 'NJ HMIS ID': '2222222' }),
  );
  assert.equal(merged.njhmisId, '2222222');
});

test('the Medicaid ID is not mistaken for an HMIS ID', () => {
  const read = extractDocumentFields('Medicaid ID: 12345678901');
  assert.equal(read.medicaidId, '12345678901');
  assert.equal(read.njhmisId, null);
});
