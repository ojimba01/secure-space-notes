// Coming back to where you were after a trip through the sign-in page.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { returnTo } from './src/lib/returnTo';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { returnTo } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('the section and the open record survive the round trip', () => {
  assert.equal(returnTo('/?view=forms'), '/?view=forms');
  assert.equal(
    returnTo('/?view=clients&client=8f1c2b3a'),
    '/?view=clients&client=8f1c2b3a',
  );
  assert.equal(returnTo('/billing'), '/billing');
});

test('somebody arriving at the sign-in page directly still lands on the app', () => {
  assert.equal(returnTo(undefined), '/');
  assert.equal(returnTo(null), '/');
  assert.equal(returnTo(''), '/');
});

test('a destination that is not this app is not honoured', () => {
  // Every one of these is somewhere else, whatever it looks like.
  assert.equal(returnTo('//evil.example/phish'), '/');
  assert.equal(returnTo('/\\evil.example'), '/');
  assert.equal(returnTo('https://evil.example'), '/');
  assert.equal(returnTo('javascript:alert(1)'), '/');
  assert.equal(returnTo({ toString: () => '/?view=forms' }), '/');
});
