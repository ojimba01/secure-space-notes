// One in-person visit per 30-day cycle, for everybody.
//
// The quota used to vary by level of need — four contacts and two visits for
// High Level, two and one for Low. The agency does not work that way: the visit
// is the touchpoint that matters and the only one the app asks for.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `
      export { requirementsForTier, windowProgress, currentBillingWindow } from './src/lib/compliance';
      export { generateTouchpointDates } from './src/lib/touchpoints';
    `,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{
    name: 'fake-database',
    setup(b) {
      b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'mock' }));
      b.onResolve({ filter: /touchpointSettings$/ }, () => ({ path: 'settings', namespace: 'mock' }));
      b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
        contents: path === 'db'
          ? 'export const supabase = { from: () => { throw new Error("no db in this test"); } };'
          : 'export const loadTouchpointSettings = async () => ({ goLiveDate: "2026-09-01" });\nexport const goLiveDate = async () => "2026-09-01";',
      }));
    },
  }],
});
const { requirementsForTier, generateTouchpointDates, currentBillingWindow, windowProgress } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const START = '2026-09-01';
const TODAY = '2026-09-11';
const gen = (contacts = [], manual = [], tier = 'High Level') =>
  generateTouchpointDates(START, tier, contacts, manual, TODAY, 0, '2026-09-01', []);

test('every level of need owes the same thing: one visit', () => {
  for (const tier of ['High Level', 'Low Level', null, undefined, 'nonsense']) {
    assert.deepEqual(requirementsForTier(tier), {
      requiredContacts: 1, requiredInPerson: 1, requiredActivities: 0,
    });
  }
});

test('a cycle with nothing logged schedules exactly one in-person visit', () => {
  const dates = gen();
  assert.equal(dates.length, 1);
  assert.equal(dates[0].modality, 'in_person');
});

test('a level of need is no longer needed to schedule anything', () => {
  // This used to return [] on hasValidTier, so a client missing a level of need
  // was scheduled nothing at all.
  assert.equal(gen([], [], null).length, 1);
  assert.equal(gen([], [], '').length, 1);
});

test('a logged visit fills the cycle and nothing more is scheduled', () => {
  const contacts = [{ id: '1', contact_date: '2026-09-05', modality: 'in_person' }];
  assert.equal(gen(contacts).length, 0);
});

test('a phone call does not cancel the visit — one is still scheduled', () => {
  // The generator used to stop once any contact filled the contact count, so a
  // call quietly cancelled that cycle's visit.
  const contacts = [{ id: '1', contact_date: '2026-09-05', modality: 'phone' }];
  const dates = gen(contacts);
  assert.equal(dates.length, 1, 'the visit is owed on its own account');
  assert.equal(dates[0].modality, 'in_person');
  assert.notEqual(dates[0].date, '2026-09-05', 'and not on the day already used');

  const prog = windowProgress(requirementsForTier(null), contacts);
  assert.equal(prog.inPersonSpaced, 0);
  assert.equal(prog.isComplete, false, 'a phone call alone does not complete the cycle');
  assert.ok(currentBillingWindow(START, TODAY));
});

test('a visit staff put on the calendar themselves counts', () => {
  const manual = [{ date: '2026-09-20', modality: 'in_person', touchpointType: null }];
  assert.equal(gen([], manual).length, 0);
});
