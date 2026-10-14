// Restarting an authorization after a gap: how the gap is counted, which
// forms each restart needs, and which authorization counts as the restart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const stub = {
  name: 'stub-supabase',
  setup(b) {
    b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const supabase = {};', loader: 'js' }));
  },
};
const bundle = await build({
  stdin: { contents: `export * from './src/lib/restartAuthorization'; export * from './src/lib/authorizations';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm', plugins: [stub],
  alias: { '@': `${process.cwd()}/src` },
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('the gap is the days between the last end and the new start', () => {
  assert.equal(mod.gapDays('2026-08-25', '2026-08-26'), 0);
  assert.equal(mod.gapDays('2026-08-25', '2026-10-01'), 36);
  assert.equal(mod.gapDays(null, '2026-10-01'), null);
  assert.equal(mod.lastEnd([{ end_date: '2026-03-01' }, { end_date: '2026-08-25' }, { end_date: null }]), '2026-08-25');
});

test('each restart asks for the forms its authorization needs', () => {
  assert.deepEqual(mod.FORMS_FOR_RESTART.initial_30, ['Initial Assessment (IAT)', 'Level of Need (LON)', 'Housing Stabilization Plan (HSP)']);
  assert.deepEqual(mod.FORMS_FOR_RESTART.continuation_150, ['Housing Stabilization Plan (HSP)']);
  assert.deepEqual(mod.FORMS_FOR_RESTART.reauthorization_180, ['Level of Need (LON)', 'Housing Stabilization Plan (HSP)']);
  for (const t of mod.RESTART_TYPES) assert.equal(mod.defaultEndDate(t.type, '2026-10-01') > '2026-10-01', true);
  assert.equal(mod.defaultEndDate('reauthorization_180', '2026-10-01'), '2027-03-29');
});

test('only the latest authorization counts as the restart', () => {
  const a = (start, restarted, status = 'active') => ({ start_date: start, restarted_after_days: restarted, status, authorization_type: 'initial_30' });
  assert.equal(mod.latestRestart([a('2026-01-01', null, 'expired'), a('2026-10-01', 30)]).start_date, '2026-10-01');
  assert.equal(mod.latestRestart([a('2026-01-01', 30, 'expired'), a('2026-10-01', null)]), null);
  // A cancelled restart does not count.
  assert.equal(mod.latestRestart([a('2026-01-01', null, 'expired'), a('2026-10-01', 30, 'cancelled')]), null);
});
