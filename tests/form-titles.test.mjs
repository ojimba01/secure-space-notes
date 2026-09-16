// Naming the second form of a kind.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export { nextFormTitle } from './src/lib/formTitles';`,
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
});
const { nextFormTitle } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

const march = new Date(2026, 2, 4); // 4 March 2026, local

test('the first of a kind is called what it is', () => {
  assert.equal(nextFormTitle('Client Intake', [], march), 'Client Intake');
});

test('the second carries the day it was filed', () => {
  assert.equal(
    nextFormTitle('Level of Need (LON)', ['Level of Need (LON)'], march),
    'Level of Need (LON) — 2026-03-04',
  );
});

test('two on one day are told apart by a number', () => {
  const existing = ['Client Intake', 'Client Intake — 2026-03-04'];
  assert.equal(nextFormTitle('Client Intake', existing, march), 'Client Intake — 2026-03-04 (2)');
  assert.equal(
    nextFormTitle('Client Intake', [...existing, 'Client Intake — 2026-03-04 (2)'], march),
    'Client Intake — 2026-03-04 (3)',
  );
});

test('the day is the local one, not yesterday in UTC', () => {
  // Late evening in New Jersey is already tomorrow in UTC; the form was filed
  // on the day the person filing it was living through.
  const lateEvening = new Date(2026, 8, 16, 21, 30);
  assert.match(nextFormTitle('x', ['x'], lateEvening), /2026-09-16$/);
});

test('a form filed under some other name does not block the date', () => {
  assert.equal(
    nextFormTitle('Client Intake', ['Intake taken at the shelter'], march),
    'Client Intake — 2026-03-04',
  );
});
