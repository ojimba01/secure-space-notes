// Restarting an authorization after a gap: how the gap is counted, which
// forms each restart needs, and which authorization counts as the restart.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const stub = {
  name: 'stub-supabase',
  setup(b) {
    b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'supabase', namespace: 'stub' }));
    b.onResolve({ filter: /lib\/(billingSync|touchpoints)$/ }, (a) => ({ path: a.path.split('/').pop(), namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({
      contents:
        a.path === 'supabase'
          ? 'export const supabase = { from: (t) => globalThis.__db.from(t) };'
          : 'export const regenerateClientCycles = async () => { globalThis.__db.resynced++; }; export const regenerateTouchpointsForClient = async () => {};',
      loader: 'js',
    }));
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

/**
 * A stand-in database: every query is recorded, and reads answer from `rows`.
 * Enough of the query builder for restartAuthorization.
 */
function fakeDb(rows) {
  const db = { calls: [], resynced: 0 };
  db.from = (table) => {
    const call = { table, op: 'select', payload: null, filters: [] };
    db.calls.push(call);
    const result = () => {
      if (call.op !== 'select') return { data: null, error: null };
      const data = rows[table] ?? [];
      return { data: call.single ? data[0] ?? null : data, error: null };
    };
    const q = {
      select: () => q,
      update: (p) => ((call.op = 'update'), (call.payload = p), q),
      insert: (p) => ((call.op = 'insert'), (call.payload = p), q),
      delete: () => ((call.op = 'delete'), q),
      eq: (k, v) => (call.filters.push(['eq', k, v]), q),
      in: (k, v) => (call.filters.push(['in', k, v]), q),
      gte: (k, v) => (call.filters.push(['gte', k, v]), q),
      lt: (k, v) => (call.filters.push(['lt', k, v]), q),
      maybeSingle: () => ((call.single = true), Promise.resolve(result())),
      then: (res, rej) => Promise.resolve(result()).then(res, rej),
    };
    return q;
  };
  globalThis.__db = db;
  return db;
}

test('a restart without a date is pending: a new round, nothing recorded yet', async () => {
  const db = fakeDb({
    clients: [{ billing_round: 1, restart_pending_at: null, restart_pending_type: null }],
    client_authorizations: [{ id: 'a1', end_date: '2026-08-25', status: 'active' }],
  });
  const out = await mod.restartAuthorization({ clientId: 'c1', type: 'initial_30' });
  assert.deepEqual(out, { gap: null, pending: true });
  const updates = db.calls.filter((c) => c.op === 'update');
  // The old authorization ends and round 2 opens with the old dates cleared.
  assert.equal(updates[0].table, 'client_authorizations');
  assert.equal(updates[0].payload.status, 'expired');
  const opened = updates.find((c) => c.table === 'clients' && c.payload.billing_round);
  assert.equal(opened.payload.billing_round, 2);
  assert.equal(opened.payload.auth_30_start, null);
  // The restart is marked pending with the type it already has.
  const marked = updates.find((c) => c.table === 'clients' && c.payload.restart_pending_at);
  assert.equal(marked.payload.restart_pending_type, 'initial_30');
  // No authorization is recorded until the date arrives.
  assert.equal(db.calls.some((c) => c.table === 'client_authorizations' && c.op === 'insert'), false);
  assert.equal(db.resynced, 1);
});

test('marking a pending restart again does not open another round', async () => {
  const db = fakeDb({
    clients: [{ billing_round: 2, restart_pending_at: '2026-10-01T12:00:00Z', restart_pending_type: null }],
    client_authorizations: [{ id: 'a1', end_date: '2026-08-25', status: 'expired' }],
  });
  await mod.restartAuthorization({ clientId: 'c1', type: 'continuation_150' });
  const updates = db.calls.filter((c) => c.op === 'update');
  assert.equal(updates.some((c) => c.payload.billing_round), false);
  const marked = updates.find((c) => c.payload.restart_pending_at);
  assert.equal(marked.payload.restart_pending_at, '2026-10-01T12:00:00Z');
  assert.equal(marked.payload.restart_pending_type, 'continuation_150');
});

test('a start date on or before the last end is refused', async () => {
  fakeDb({
    clients: [{ billing_round: 1 }],
    client_authorizations: [{ id: 'a1', end_date: '2026-08-25', status: 'active' }],
  });
  await assert.rejects(mod.restartAuthorization({ clientId: 'c1', type: 'initial_30', startDate: '2026-08-25' }), /after the last authorization ended/);
});

test('a pending restart is read off the client record', () => {
  assert.equal(mod.pendingRestart({ restart_pending_at: null }), null);
  assert.deepEqual(mod.pendingRestart({ restart_pending_at: '2026-10-01T00:00:00Z', restart_pending_type: null }), { since: '2026-10-01T00:00:00Z', type: null });
});

test('a restart keeps what it replaced, and reopens a closed case', async () => {
  const db = fakeDb({
    clients: [{ billing_round: 1, status: 'closed', closed_date: '2026-09-01', reason_closed: 'Lost contact', auth_30_start: '2026-07-01', workflow_stage: 'closed' }],
    client_authorizations: [{ id: 'a1', end_date: '2026-07-30', status: 'active' }],
  });
  await mod.restartAuthorization({ clientId: 'c1' });
  const opened = db.calls.find((c) => c.op === 'update' && c.table === 'clients' && c.payload.billing_round);
  assert.equal(opened.payload.status, 'active');
  assert.equal(opened.payload.closed_date, null);
  const snap = opened.payload.restart_undo;
  assert.equal(snap.round, 1);
  assert.equal(snap.fields.status, 'closed');
  assert.equal(snap.fields.auth_30_start, '2026-07-01');
  assert.equal(snap.fields.reason_closed, 'Lost contact');
  assert.deepEqual(snap.ended, [{ id: 'a1', status: 'active' }]);
});

test('undo puts the client back as they were before the restart', async () => {
  const snapshot = { round: 1, fields: { status: 'closed', auth_30_start: '2026-07-01' }, ended: [{ id: 'a1', status: 'active' }] };
  const db = fakeDb({
    clients: [{ billing_round: 2, restart_undo: snapshot }],
    billing_cycles: [{ id: 'b9', billing_status: 'Not Billed', payment_status: 'Unpaid', claim_number: null }],
    client_form_checklist: [],
  });
  await mod.undoRestart('c1');
  const restored = db.calls.find((c) => c.op === 'update' && c.table === 'clients' && c.payload.billing_round === 1);
  assert.equal(restored.payload.status, 'closed');
  assert.equal(restored.payload.auth_30_start, '2026-07-01');
  assert.equal(restored.payload.restart_pending_at, null);
  const deleted = db.calls.filter((c) => c.op === 'delete').map((c) => c.table);
  assert.ok(deleted.includes('client_authorizations') && deleted.includes('billing_cycles'));
  // Round 2's authorizations and cycles only; nothing from round 1.
  for (const c of db.calls.filter((c) => c.op === 'delete' && c.table !== 'client_form_checklist')) {
    assert.deepEqual(c.filters.find((f) => f[1] === 'round'), ['eq', 'round', 2]);
  }
  const forms = db.calls.find((c) => c.op === 'update' && c.table === 'client_forms');
  assert.equal(forms.payload.round, 1);
  const back = db.calls.find((c) => c.op === 'update' && c.table === 'client_authorizations');
  assert.equal(back.payload.status, 'active');
  assert.ok(db.calls.some((c) => c.op === 'update' && c.table === 'clients' && c.payload.restart_undo === null));
});

test('undo is refused once a claim from the new round is filed', async () => {
  const db = fakeDb({
    clients: [{ billing_round: 2, restart_undo: { round: 1, fields: {}, ended: [] } }],
    billing_cycles: [{ id: 'b9', billing_status: 'Submitted' }],
  });
  await assert.rejects(mod.undoRestart('c1'), /claim/);
  assert.equal(db.calls.some((c) => c.op !== 'select'), false);
});

test('there is nothing to undo without a restart', async () => {
  fakeDb({ clients: [{ billing_round: 1, restart_undo: null }] });
  await assert.rejects(mod.undoRestart('c1'), /no restart to undo/);
});
