// A save must never change a case's status by itself.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { saveClientEdit } from './src/lib/saveClientEdit';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'fake', setup(b) {
    b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'm' }));
    b.onResolve({ filter: /billingSync$/ }, () => ({ path: 'bill', namespace: 'm' }));
    b.onResolve({ filter: /\/authorizations$/ }, () => ({ path: 'auth', namespace: 'm' }));
    b.onLoad({ filter: /.*/, namespace: 'm' }, ({ path }) => ({
      contents: path === 'db'
        ? `export const supabase = { from: () => ({ update: (p) => { globalThis.written = p; return { eq: () => ({ select: () => ({ single: async () => ({ error: null }) }) }) }; } }) };`
        : path === 'bill'
          ? 'export const regenerateClientCycles = async () => {};'
          : 'export const syncAuthorizationsFromLegacyColumns = async () => {}; export const resyncDerivedSchedules = async () => {};',
      loader: 'js',
    }));
  }}],
});
const { saveClientEdit } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const values = (over = {}) => ({
  first_name: 'Gary', last_name: 'Smith', status: 'active', ...over,
});

test('a closed case stays closed through an unrelated save', async () => {
  await saveClientEdit({ id: 'c1' }, values({ status: 'closed', phone: '555' }));
  assert.equal(globalThis.written.status, 'closed', 'a phone edit must not reopen a case');
});

test('an active case stays active', async () => {
  await saveClientEdit({ id: 'c1' }, values());
  assert.equal(globalThis.written.status, 'active');
});
