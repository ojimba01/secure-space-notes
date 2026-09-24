// The test account is hidden; real people never are.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export { isTestAccount, visibleProfiles } from './src/lib/testAccounts';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
});
const { isTestAccount, visibleProfiles } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('the test account is recognised by its name or email', () => {
  assert.ok(isTestAccount({ first_name: 'Test', last_name: 'User' }));
  assert.ok(isTestAccount({ first_name: ' test ', last_name: 'Account' }));
  assert.ok(isTestAccount({ first_name: 'Case', last_name: 'Test' }));
  assert.ok(isTestAccount({ first_name: '', last_name: '', email: 'test@agency.org' }));
});

test('a real person whose name only contains "test" is not hidden', () => {
  assert.equal(isTestAccount({ first_name: 'Testa', last_name: 'Adeyemi' }), false);
  assert.equal(isTestAccount({ first_name: 'Shade', last_name: 'Tester' }), false);
  assert.equal(isTestAccount({ first_name: 'Shade', last_name: 'Adeyemi', email: 'shade@agency.org' }), false);
});

test('lists lose the test account and keep everybody else', () => {
  // No browser storage here, so the switch reads as off.
  const rows = [{ id: '1', first_name: 'Test', last_name: 'User' }, { id: '2', first_name: 'Shade', last_name: 'Adeyemi' }];
  assert.deepEqual(visibleProfiles(rows).map((r) => r.id), ['2']);
});
