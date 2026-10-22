// Clearing an authorization date on the client's Overview: the save goes
// through, the authorization's history record is cancelled, and a date with a
// filed claim behind it is refused before anything is written.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export * from './src/lib/saveClientEdit';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm',
  alias: { '@': `${process.cwd()}/src` },
  plugins: [{ name: 'stubs', setup(b) {
    b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'stub' }));
    b.onResolve({ filter: /lib\/(billingSync|touchpoints)$/ }, () => ({ path: 'sched', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
      contents: path === 'db'
        ? 'export const supabase = { from: (t) => globalThis.__db.from(t), rpc: async () => ({ error: null }) };'
        : 'export const regenerateClientCycles = async () => {}; export const regenerateTouchpointsForClient = async () => {};',
      loader: 'js',
    }));
  } }],
});
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

/** Records every query; reads answer from `rows`. */
function fakeDb(rows) {
  const db = { calls: [] };
  db.from = (table) => {
    const call = { table, op: 'select', payload: null, filters: [] };
    db.calls.push(call);
    const result = () => {
      if (call.op === 'update' && table === 'clients') return { data: { id: 'c1' }, error: null };
      if (call.op !== 'select') return { data: null, error: null };
      const data = rows[table] ?? [];
      return { data: call.single ? data[0] ?? null : data, error: null };
    };
    const q = {
      select: () => q, order: () => q,
      update: (p) => ((call.op = 'update'), (call.payload = p), q),
      insert: (p) => ((call.op = 'insert'), (call.payload = p), q),
      eq: (k, v) => (call.filters.push(['eq', k, v]), q),
      in: (k, v) => (call.filters.push(['in', k, v]), q),
      neq: (k, v) => (call.filters.push(['neq', k, v]), q),
      maybeSingle: () => ((call.single = true), Promise.resolve(result())),
      single: () => ((call.single = true), Promise.resolve(result())),
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
    };
    return q;
  };
  globalThis.__db = db;
  return db;
}

const client = { id: 'c1', auth_30_start: '2026-01-01', iat_date: '2026-01-01', auth_150_start: '2026-01-31', hsp_150_date: '2026-01-31', level_of_need: 'Low Level' };
const form = { first_name: 'A', last_name: 'B', iat_date: '2026-01-01', hsp_150_date: '', hsp_180_date: '', level_of_need: 'Low Level', status: 'active' };

test('clearing the 150-day date saves and cancels its authorization record', async () => {
  const db = fakeDb({ clients: [{ billing_round: 1 }], billing_cycles: [{ phase: '150-Day', billing_status: 'Not Billed', payment_status: 'Unpaid' }], client_authorizations: [] });
  await api.saveClientEdit(client, form);
  const saved = db.calls.find((c) => c.op === 'update' && c.table === 'clients');
  assert.equal(saved.payload.auth_150_start, null);
  const cancelled = db.calls.find((c) => c.op === 'update' && c.table === 'client_authorizations');
  assert.equal(cancelled.payload.status, 'cancelled');
  assert.deepEqual(cancelled.filters.find((f) => f[1] === 'authorization_type'), ['in', 'authorization_type', ['continuation_150']]);
});

test('a date with a filed claim is not cleared, and nothing is written', async () => {
  const db = fakeDb({ clients: [{ billing_round: 1 }], billing_cycles: [{ phase: '150-Day', billing_status: 'Submitted' }] });
  await assert.rejects(api.saveClientEdit(client, form), (e) => /claim has been filed for the 150-day/.test(e.message) && !(e instanceof api.PartialSaveError));
  assert.equal(db.calls.some((c) => c.op === 'update'), false);
});

test('an ordinary edit touches no authorization record', async () => {
  const db = fakeDb({ clients: [{ billing_round: 1 }] });
  await api.saveClientEdit(client, { ...form, hsp_150_date: '2026-01-31', phone: '555' });
  assert.equal(db.calls.some((c) => c.table === 'client_authorizations' || c.table === 'billing_cycles'), false);
});

test('a removed authorization is never filled in again: a new date starts a new record', async () => {
  const bundle2 = await build({
    stdin: { contents: `export { syncAuthorizationsFromLegacyColumns } from './src/lib/authorizations';`, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, write: false, platform: 'node', format: 'esm', alias: { '@': `${process.cwd()}/src` },
    plugins: [{ name: 'stubs', setup(b) {
      b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'stub' }));
      b.onResolve({ filter: /lib\/(billingSync|touchpoints)$/ }, () => ({ path: 'sched', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => ({
        contents: path === 'db' ? 'export const supabase = { from: (t) => globalThis.__db.from(t) };'
          : 'export const regenerateClientCycles = async () => {}; export const regenerateTouchpointsForClient = async () => {};',
        loader: 'js',
      }));
    } }],
  });
  const lib = await import(`data:text/javascript;base64,${Buffer.from(bundle2.outputFiles[0].text).toString('base64')}`);
  const db = fakeDb({
    clients: [{ auth_150_start: '2026-03-01', auth_150_end: '2026-07-28' }],
    client_authorizations: [{ id: 'old', authorization_type: 'continuation_150', sequence_number: 1, status: 'cancelled' }],
  });
  assert.deepEqual(await lib.syncAuthorizationsFromLegacyColumns('c1'), { created: 1, updated: 0 });
  const added = db.calls.find((c) => c.op === 'insert' && c.table === 'client_authorizations');
  assert.equal(added.payload.sequence_number, 2);
  assert.equal(db.calls.some((c) => c.op === 'update' && c.table === 'client_authorizations'), false);
});
