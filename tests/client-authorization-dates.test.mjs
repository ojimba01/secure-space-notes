import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export * from './src/lib/clientAuthorizationDates';
      export { authorizationCycles, spansFromAuthorizations } from './src/lib/compliance';
      export { syncAuthorizationsFromLegacyColumns, mirrorAuthorizationToLegacyColumns, resyncDerivedSchedules } from './src/lib/authorizations';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'fake-database', setup(b) {
    b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'mock' }));
    b.onResolve({ filter: /billingSync$/ }, () => ({ path: 'billing', namespace: 'mock' }));
    b.onResolve({ filter: /\/touchpoints$/ }, () => ({ path: 'touchpoints', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
      contents: path === 'db' ? 'export const supabase = { from: (...args) => globalThis.fakeDB.from(...args) };'
        : path === 'billing' ? 'export const regenerateClientCycles = (id) => globalThis.rebuildBilling(id);'
        : 'export const regenerateTouchpointsForClient = (id) => globalThis.rebuildTouchpoints(id);',
    }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const original = { iat_date: '2026-01-01', auth_30_start: '2026-01-01', hsp_150_date: '2026-01-31', auth_150_start: '2026-01-31' };
const values = (patch = {}) => ({ ...api.editAuthorizationDates(original), ...patch });

test('moving the HSP start replaces the old 150-day end and leaves other periods alone', () => {
  assert.deepEqual(api.authorizationDatePatch(original, values({ hsp_150_date: '2026-03-01' })), {
    hsp_150_date: '2026-03-01', auth_150_start: '2026-03-01', auth_150_end: '2026-07-28',
  });
});
test('an unrelated edit does not overwrite a different recorded authorization', () => {
  assert.deepEqual(api.authorizationDatePatch({ ...original, auth_150_start: '2026-02-05' }, values()), {});
});
test('an older HSP-only record can be repaired by saving the existing date', () => {
  assert.equal(api.authorizationDatePatch({ ...original, auth_150_start: null }, values()).auth_150_start, original.hsp_150_date);
});
test('authorization-only dates populate the edit form and are not cleared on Save', () => {
  const client = { auth_30_start: '2026-01-01', auth_150_start: '2026-02-01' };
  const form = api.editAuthorizationDates(client);
  assert.equal(form.iat_date, client.auth_30_start);
  assert.equal(form.hsp_150_date, client.auth_150_start);
  assert.deepEqual(api.authorizationDatePatch(client, form), {});
});
test('clearing an existing authorization is rejected instead of leaving orphan history', () => {
  assert.throws(() => api.authorizationDatePatch(original, values({ hsp_150_date: '' })), /cannot be cleared/);
});
test('inclusive dates work across leap day and year boundaries', () => {
  assert.equal(api.authorizationDatePatch(original, values({ iat_date: '2024-02-01' })).auth_30_end, '2024-03-01');
  assert.equal(api.authorizationDatePatch(original, values({ hsp_180_date: '2026-12-01' })).auth_180_end, '2027-05-29');
});

function database(client, existing, error = null) {
  const writes = [];
  globalThis.fakeDB = { from(table) {
    let payload, id, updating = false;
    const result = () => ({ data: error ? null : { id }, error });
    const query = {
      select() { return query; }, eq(_column, value) { id = value; return query; },
      maybeSingle: async () => ({ data: client, error: null }),
      order: async () => ({ data: existing, error: null }),
      update(data) { payload = data; updating = true; writes.push({ table, payload }); return query; },
      insert: async (data) => { writes.push({ table, payload: data }); return result(); },
      single: async () => result(),
      then(resolve) { resolve(updating ? result() : { data: existing, error: null }); },
    };
    return query;
  } };
  return writes;
}

test('edited dates reach existing authorization history and the touchpoint cycle coverage', async () => {
  const patch = api.authorizationDatePatch(original, values({ hsp_150_date: '2026-03-01' }));
  const client = { ...patch };
  const writes = database(client, [{ id: 'existing-150', authorization_type: 'continuation_150', sequence_number: 1 }]);
  assert.deepEqual(await api.syncAuthorizationsFromLegacyColumns('test-client'), { created: 0, updated: 1 });
  assert.equal(writes[0].payload.start_date, '2026-03-01');
  assert.equal(writes[0].payload.end_date, '2026-07-28');
  const spans = api.spansFromAuthorizations([{ ...writes[0].payload, authorization_type: 'continuation_150' }]);
  const cycles = api.authorizationCycles(client, '2026-04-01', spans);
  assert.equal(cycles[0].start, '2026-03-01');
  const continuation = cycles.filter((cycle) => cycle.phase === 'period_150');
  assert.equal(continuation.at(-1).end, '2026-07-28');
  assert.equal(continuation.length, 5);
});
test('missing authorization history is inserted', async () => {
  const writes = database({ auth_150_start: '2026-03-01', auth_150_end: '2026-07-28' }, []);
  assert.deepEqual(await api.syncAuthorizationsFromLegacyColumns('test-client'), { created: 1, updated: 0 });
  assert.equal(writes[0].payload.authorization_type, 'continuation_150');
});
test('a denied or zero-row authorization update surfaces an error', async () => {
  database({ auth_150_start: '2026-03-01' }, [{ id: 'existing', authorization_type: 'continuation_150' }], { message: 'Update returned no row' });
  await assert.rejects(api.syncAuthorizationsFromLegacyColumns('test-client'), /returned no row/);
});
test('editing Authorizations mirrors the date back to the HSP form', async () => {
  const writes = database({}, []);
  await api.mirrorAuthorizationToLegacyColumns('test-client', 'continuation_150', { authorizationNumber: 'TEST', startDate: '2026-03-01', endDate: '2026-07-28' });
  assert.equal(writes[0].payload.hsp_150_date, writes[0].payload.auth_150_start);
});
test('a billing failure still attempts touchpoints and can be retried', async () => {
  const calls = [];
  globalThis.rebuildBilling = async () => { calls.push('billing'); throw new Error('temporarily unavailable'); };
  globalThis.rebuildTouchpoints = async () => { calls.push('touchpoints'); };
  await assert.rejects(api.resyncDerivedSchedules('test-client'), /temporarily unavailable/);
  assert.deepEqual(calls, ['billing', 'touchpoints']);
  globalThis.rebuildBilling = async () => { calls.push('billing'); };
  await api.resyncDerivedSchedules('test-client');
  assert.deepEqual(calls, ['billing', 'touchpoints', 'billing', 'touchpoints']);
});
