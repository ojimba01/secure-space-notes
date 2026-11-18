// The document reader (src/lib/documentRecognition.ts). The agency's intake
// asks for a Medicaid number, which once filed two intakes as Medicaid
// Eligibility; its printed title has to win.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export { typeFromText } from './src/lib/documentRecognition';`, resolveDir: process.cwd() },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  // The scan reader and the PDF worker load in a browser; nothing here needs them.
  plugins: [{
    name: 'no-ocr',
    setup(b) {
      b.onResolve({ filter: /^@\/lib\/(ocr|pdfWorker)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
        contents: a.path.endsWith('ocr') ? 'export const ocrPdf = async () => ({ text: "" }); export const ocrSupported = () => false;' : '',
      }));
    },
  }],
});
const { typeFromText } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('the Client Intake is read as an intake, though it asks for a Medicaid number', () => {
  const page = 'HOUSING AND SUPPORTIVE SERVICES CLIENT INTAKE FORM CLIENT INFORMATION Full Name: Birth Date: 5. MCO # / Medicaid #:';
  assert.equal(typeFromText(page), 'Client Intake');
});

test('a Medicaid eligibility notice is still Medicaid Eligibility', () => {
  assert.equal(typeFromText('NJ FamilyCare eligibility determination for the member'), 'Medicaid Eligibility');
});
