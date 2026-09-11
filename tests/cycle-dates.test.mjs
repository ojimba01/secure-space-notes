// The cycle list reads whichever column actually holds each start date.
//
// Only the IAT field was ever mirrored into its authorization column, so real
// clients carry a date under one name and nothing under the other. Every case
// below is a shape found on this agency's records.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { authorizationCycles, spansFromAuthorizations } from './src/lib/compliance';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { authorizationCycles, spansFromAuthorizations } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const TODAY = '2026-11-01';
const phases = (client, recorded) =>
  authorizationCycles(client, TODAY, recorded && spansFromAuthorizations(recorded)).map((c) => c.phase);

test('an IAT date alone opens the initial 30 days', () => {
  const cycles = authorizationCycles({ iat_date: '2026-09-10' }, TODAY);
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].phase, 'initial_30');
  assert.equal(cycles[0].start, '2026-09-10');
});

test('an HSP 150 date runs the 150 and the extension after it', () => {
  const p = phases({ iat_date: '2026-09-10', hsp_150_date: '2026-10-10' });
  assert.equal(p.length, 12);
  assert.equal(p[0], 'initial_30');
  assert.ok(p.includes('period_150'));
  assert.ok(p.includes('extension_180'));
});

test('the authorization column wins where both are set', () => {
  const cycles = authorizationCycles(
    { iat_date: '2026-09-10', auth_30_start: '2026-09-10', auth_30_end: '2026-10-09' },
    TODAY,
  );
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].end, '2026-10-09');
});

test('a recorded authorization does not erase a legacy period it never covered', () => {
  // The record holds the 150 and 180 but nobody ever wrote an initial_30 row.
  const p = phases(
    { auth_30_start: '2026-09-10', auth_30_end: '2026-10-09', auth_150_start: '2026-10-10' },
    [{ authorization_type: 'continuation_150', start_date: '2026-10-10', end_date: '2027-03-08', status: 'active' }],
  );
  assert.equal(p[0], 'initial_30', 'the first thirty days survive');
});

test('a period in both sources is not counted twice', () => {
  const p = phases(
    { auth_30_start: '2026-09-10', auth_30_end: '2026-10-09' },
    [{ authorization_type: 'initial_30', start_date: '2026-09-10', end_date: '2026-10-09', status: 'expired' }],
  );
  assert.equal(p.filter((x) => x === 'initial_30').length, 1);
});

test('a cycle belongs to whichever authorization covers most of its days', () => {
  // The 150 is approved a fortnight late, so cycle two straddles the join.
  const p = phases({
    auth_30_start: '2026-09-10', auth_30_end: '2026-10-09',
    auth_150_start: '2026-10-24', auth_150_end: '2027-03-22',
  });
  assert.equal(p[1], 'period_150', 'sixteen of its thirty days are funded, so it is not a gap');
});

test('a cycle no authorization touches is still reported as a gap', () => {
  const p = phases({
    auth_30_start: '2026-09-10', auth_30_end: '2026-10-09',
    auth_150_start: '2027-01-01', auth_150_end: '2027-05-30',
  });
  assert.ok(p.includes(null), 'a real hole is not hidden');
});

test('denied and cancelled authorizations cover nothing', () => {
  const spans = spansFromAuthorizations([
    { authorization_type: 'continuation_150', start_date: '2026-10-10', end_date: '2027-03-08', status: 'denied' },
    { authorization_type: 'initial_30', start_date: '2026-09-10', end_date: '2026-10-09', status: 'cancelled' },
  ]);
  assert.equal(spans.length, 0);
});

test('a superseded authorization still covered the days it ran', () => {
  const spans = spansFromAuthorizations([
    { authorization_type: 'initial_30', start_date: '2026-09-10', end_date: '2026-10-09', status: 'superseded' },
  ]);
  assert.equal(spans.length, 1);
});

test('a client with no dates at all has no cycles', () => {
  assert.equal(authorizationCycles({}, TODAY).length, 0);
});
