// Reading a referral to start a new client (src/lib/referralReading.ts), on
// the two shapes the agency's referrals come in. Made-up people only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export { parseReferralText } from './src/lib/referralReading';`, resolveDir: process.cwd() },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  external: ['react-pdf'],
  plugins: [{
    name: 'stubs',
    setup(b) {
      b.onResolve({ filter: /@\/lib\/(ocr|pdfWorker)$/ }, () => ({ path: 'stub', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export {};' }));
    },
  }],
});
const { parseReferralText } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test("Availity's printout: name, insurance, member ID and birth date; the provider's phone is not the member's", () => {
  const r = parseReferralText(
    'Transaction ID: 123456789 Customer ID: 1234567 Transaction Date: 2026-11-01 MARSH, DELIA Patient Member ID 100200300400 Date of Birth 1980-04-09 Gender Female Transaction Type Outpatient Authorization Organization Supportive Care Management, LLC Payer AETNA Certificate Information Member Information Patient Name MARSH, DELIA Patient Date of Birth 1980-04-09 Requesting Provider Name NPI SUPPORTIVE CARE MANAGEMENT, LLC 1234567890 Provider Role Facility Address 1 MAIN ST, TOWN, NJ 08000 Phone (856) 555-0100 Fax (856) 555-0101',
  );
  assert.equal(r.first_name, 'Delia');
  assert.equal(r.last_name, 'Marsh');
  assert.equal(r.insurance, 'Aetna');
  assert.equal(r.member_id, '100200300400');
  assert.equal(r.date_of_birth, '04/09/1980');
  assert.equal(r.phone, '');
});

test('an emailed referral: name, member ID, phone and insurance', () => {
  const r = parseReferralText('Hello, Can you accept this referral? Member Name: Jonah Pike Member ID: 100200300500 Address: 12 Lake Dr. Camden NJ Member Phone: (609) 555-0177 Email: jpike@example.org Horizon NJ Health');
  assert.equal(r.first_name, 'Jonah');
  assert.equal(r.last_name, 'Pike');
  assert.equal(r.member_id, '100200300500');
  assert.equal(r.phone, '(609) 555-0177');
  assert.equal(r.insurance, 'Horizon');
});

test('a bare Phone label after the member details is the member’s', () => {
  const r = parseReferralText('WELLPOINT Member ID: 100200300600 Member Name: Rosa Quill Address: 3 Elm St Trenton NJ Phone: 609-555-0188 Email: rq@example.org');
  assert.equal(r.phone, '(609) 555-0188');
  assert.equal(r.insurance, 'Wellpoint');
  assert.equal(r.first_name, 'Rosa');
  assert.equal(r.last_name, 'Quill');
});

test('nothing readable leaves every box empty', () => {
  assert.deepEqual(parseReferralText(''), {
    first_name: '', last_name: '', phone: '', insurance: '', member_id: '', medicaid_id: '', date_of_birth: '', address: '',
  });
});

test("Horizon's referral form: an 8-digit number under Medicaid ID# is the member ID; blank Word boxes are not answers", () => {
  const r = parseReferralText(`Horizon
NJ FamilyCare Housing Supports Referrals
First Name Kalani
Last Name Brooke
Preferred Name  FORMTEXT
DOB 3/7/2001
Social Security Number  FORMTEXT
Gender
Member Medicaid ID# 70011223
 Member Primary Address (Zip Code at minimum) Mercer County
Member Primary Phone Number 609-555-0161
Member Secondary Phone Number  FORMTEXT
Main Reason for Referral: Member reported to be homeless couch surfing with family.`);
  assert.equal(r.first_name, 'Kalani');
  assert.equal(r.last_name, 'Brooke');
  assert.equal(r.insurance, 'Horizon');
  assert.equal(r.member_id, '70011223');
  assert.equal(r.medicaid_id, '');
  assert.equal(r.date_of_birth, '03/07/2001');
  assert.equal(r.phone, '(609) 555-0161');
  assert.equal(r.address, 'Mercer County');
});

test("Wellpoint's note: member ID and the 12-digit Medicaid ID apart, Contact Number as the phone", () => {
  const r = parseReferralText(`WELLPOINT-PAM CM
Below are the pertinent member details for your records:
Name: TESSA MOORLAND
Wellpoint Member ID: 740000111
Medicaid ID: 233000111222
Date of Birth (DOB): 01/02/2010 - MEMBER IS A MINOR
Homeless (Yes or No): Yes
Current Living Address: 9 Pine Rd Vineland, NJ 08360
Contact Number: 609-555-0144
County of Residence: Cumberland County
Service: Pre-tenancy`);
  assert.equal(r.first_name, 'Tessa');
  assert.equal(r.last_name, 'Moorland');
  assert.equal(r.insurance, 'Wellpoint');
  assert.equal(r.member_id, '740000111');
  assert.equal(r.medicaid_id, '233000111222');
  assert.equal(r.date_of_birth, '01/02/2010');
  assert.equal(r.phone, '(609) 555-0144');
  assert.equal(r.address, '9 Pine Rd Vineland, NJ 08360');
});
