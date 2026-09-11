import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export * from './src/lib/clientAuthorizationDates';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { authorizationNumberPatch, editAuthorizationNumbers } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('a number is written only when it changes', () => {
  const client = { auth_150_number: 'A123' };
  assert.deepEqual(authorizationNumberPatch(client, { auth_150_number: 'A123' }), {});
  assert.deepEqual(authorizationNumberPatch(client, { auth_150_number: 'B456' }), { auth_150_number: 'B456' });
});

test('the leading hash the MCO sends is dropped', () => {
  assert.deepEqual(authorizationNumberPatch({}, { auth_30_number: '#A123' }), { auth_30_number: 'A123' });
  assert.deepEqual(editAuthorizationNumbers({ auth_30_number: '#A123' }).auth_30_number, 'A123');
  // A hash added or removed is not a change of number.
  assert.deepEqual(authorizationNumberPatch({ auth_30_number: 'A123' }, { auth_30_number: '#A123' }), {});
});

test('a number entered wrongly can be cleared', () => {
  assert.deepEqual(authorizationNumberPatch({ auth_30_number: 'A123' }, { auth_30_number: '' }), { auth_30_number: null });
});

test('an untouched form writes nothing', () => {
  const client = { auth_30_number: 'A', auth_150_number: 'B', auth_180_number: 'C' };
  assert.deepEqual(authorizationNumberPatch(client, editAuthorizationNumbers(client)), {});
});
