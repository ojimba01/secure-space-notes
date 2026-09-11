// A 180-day start date stands on its own.
//
// The sync used to read `auth_180_approved ? auth_180_start : null`, so six
// real clients carried a reauthorization date and no authorization record
// because a separate tickbox was never set. The 30 and the 150 have always
// worked off their start date alone.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `
      export { needsExtensionReview } from './src/lib/billing';
      export { syncAuthorizationsFromLegacyColumns } from './src/lib/authorizations';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'fake-database',
    setup(b) {
      b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'mock' }));
      b.onResolve({ filter: /billingSync$/ }, () => ({ path: 'billing', namespace: 'mock' }));
      b.onResolve({ filter: /\/touchpoints$/ }, () => ({ path: 'tp', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
        contents: path === 'db'
          ? 'export const supabase = { from: (...a) => globalThis.fakeDB.from(...a) };'
          : path === 'billing'
            ? 'export const regenerateClientCycles = async () => {};'
            : 'export const regenerateTouchpointsForClient = async () => {};',
      }));
    },
  }],
});
const { needsExtensionReview, syncAuthorizationsFromLegacyColumns } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const TODAY = '2026-09-11';

test('the extension warning clears on a recorded start date, not only the flag', () => {
  const ending = { auth_150_end: '2026-09-20' };
  assert.equal(needsExtensionReview({ ...ending }, TODAY), true);
  assert.equal(needsExtensionReview({ ...ending, auth_180_approved: true }, TODAY), false);
  // The six real clients: a date recorded, the tickbox never set.
  assert.equal(needsExtensionReview({ ...ending, auth_180_start: '2026-09-21' }, TODAY), false);
});

test('a blank start date does not clear the warning', () => {
  assert.equal(needsExtensionReview({ auth_150_end: '2026-09-20', auth_180_start: '   ' }, TODAY), true);
});

test('a 180 start with no approval flag now creates its authorization', async () => {
  const inserted = [];
  globalThis.fakeDB = {
    from(table) {
      if (table === 'clients') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
          insurance: 'Aetna', level_of_need: 'Low Level',
          auth_30_start: null, auth_30_end: null, auth_30_number: null,
          auth_150_start: null, auth_150_end: null, auth_150_number: null,
          auth_180_start: '2026-09-21', auth_180_end: '2027-03-19', auth_180_number: null,
          auth_180_approved: false,
        }, error: null }) }) }) };
      }
      if (table === 'client_authorizations') {
        return {
          select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
          insert: async (row) => { inserted.push(row); return { error: null }; },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const result = await syncAuthorizationsFromLegacyColumns('client-1');
  assert.equal(result.created, 1, 'the date alone should create the authorization');
  assert.equal(inserted[0].authorization_type, 'reauthorization_180');
  assert.equal(inserted[0].start_date, '2026-09-21');
});
