// Which stage a client is actually at.
//
// The stored workflow_stage drifts in both directions. Every case below is a
// shape found on this agency's records, including the four clients filed as
// "Referral received" while holding a 30-day authorization — the reason a
// person filtering for referrals got a list of approved people.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { displayStage, STAGE_LABEL } from './src/lib/workflow';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { displayStage, STAGE_LABEL } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const label = (c) => STAGE_LABEL[displayStage(c)];

test('a bare referral is a referral', () => {
  assert.equal(label({ intake_status: 'not_started' }), 'Referral received');
  assert.equal(label({}), 'Referral received');
});

test('intake done and nothing approved is pending approval', () => {
  assert.equal(label({ intake_status: 'complete' }), 'Pending approval');
});

test('a 30-day authorization ends the referral, whatever the column says', () => {
  // The four real clients. The stored stage said referred; they were approved.
  assert.equal(
    label({ workflow_stage: 'referred', auth_30_start: '2026-06-17' }),
    'Initial 30-day authorization',
  );
  assert.equal(
    label({ workflow_stage: 'referred', auth_30_number: ' A12345 ' }),
    'Initial 30-day authorization',
  );
});

test('a later period makes the case active, by either column name', () => {
  assert.equal(label({ auth_30_start: '2026-06-17', auth_150_start: '2026-07-17' }), 'Active authorization');
  assert.equal(label({ auth_30_start: '2026-06-17', hsp_150_date: '2026-07-17' }), 'Active authorization');
  assert.equal(label({ auth_180_number: 'B99' }), 'Active authorization');
});

test('a later period counts even when the initial 30 was never recorded', () => {
  // One real client: stored active_authorization, a 150 recorded, no 30. The
  // old rule forced them to Pending approval, which read as a step backwards.
  assert.equal(label({ workflow_stage: 'active_authorization', auth_150_start: '2026-07-17' }), 'Active authorization');
});

test('the stored column cannot promote a client past the facts', () => {
  assert.equal(label({ workflow_stage: 'active_authorization', intake_status: 'complete' }), 'Pending approval');
  assert.equal(label({ workflow_stage: 'initial_30_active' }), 'Referral received');
});

test('closed wins over every authorization', () => {
  assert.equal(label({ status: 'closed', auth_150_start: '2026-07-17' }), 'Closed');
  assert.equal(label({ workflow_stage: 'closed', auth_30_start: '2026-06-17' }), 'Closed');
});

test('blank strings are not authorizations', () => {
  assert.equal(label({ auth_30_number: '   ', intake_status: 'complete' }), 'Pending approval');
  assert.equal(label({ auth_150_number: '', auth_30_start: '2026-06-17' }), 'Initial 30-day authorization');
});
