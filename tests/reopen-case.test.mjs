// Reopening a closed case.
//
// The case that matters is the ordinary one: somebody closed a case by mistake,
// or closed it early, and reopening it should give them back what they had.
// Asking for a new authorization every time meant inventing a start date, and
// inventing one moved the case back to the beginning.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `
      export { reopenCaseFields } from './src/lib/reopenCase';
      export { displayStage } from './src/lib/workflow';
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
const { reopenCaseFields, displayStage } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

/** A client closed halfway through their 150-day period. */
const closedClient = {
  status: 'closed',
  workflow_stage: 'closed',
  auth_30_start: '2026-01-05',
  auth_30_number: 'A-1',
  auth_150_start: '2026-02-04',
  hsp_submitted: true,
  iat_date: '2026-01-05',
};

test('an ordinary reopen undoes the closing and nothing else', () => {
  const fields = reopenCaseFields();

  assert.deepEqual(Object.keys(fields).sort(), [
    'closed_date', 'reason_closed', 'status', 'workflow_stage', 'workflow_stage_updated_at',
  ]);
  assert.equal(fields.status, 'active');
  assert.equal(fields.closed_date, null);
  assert.equal(fields.reason_closed, null);
  // Not one of the things the case was carrying is touched.
  for (const untouched of ['auth_30_start', 'auth_30_number', 'auth_150_start', 'hsp_submitted', 'iat_date']) {
    assert.ok(!(untouched in fields), `${untouched} should be left alone`);
  }
});

test('the case comes back at the stage its authorizations put it at', () => {
  assert.equal(displayStage(closedClient), 'closed');
  const reopened = { ...closedClient, ...reopenCaseFields() };
  // Not 'intake', and not whatever the column last said: a client holding a
  // 150-day authorization is active, which is where they were before.
  assert.equal(displayStage(reopened), 'active_authorization');
});

test('a plan already submitted stays submitted', () => {
  const reopened = { ...closedClient, ...reopenCaseFields() };
  assert.equal(reopened.hsp_submitted, true);
});

test('a client who has come back starts a new 30-day round', () => {
  const fields = reopenCaseFields({ startDate: '2026-06-01', authorizationNumber: '  B-2 ' });

  assert.equal(fields.status, 'active');
  assert.equal(fields.auth_30_start, '2026-06-01');
  assert.equal(fields.auth_30_end, '2026-06-30'); // the thirtieth day, inclusive
  assert.equal(fields.auth_30_number, 'B-2');
  assert.equal(fields.iat_date, '2026-06-01');
  // This round's plan has to go in again.
  assert.equal(fields.hsp_submitted, false);
});

test('a new round with no authorization number yet is allowed', () => {
  const fields = reopenCaseFields({ startDate: '2026-06-01', authorizationNumber: '   ' });
  assert.equal(fields.auth_30_number, null);
  assert.equal(fields.auth_30_start, '2026-06-01');
});
