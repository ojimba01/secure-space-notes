// A caseload's visits are spread across the month, not stacked on the next
// few days, and a planned visit stays on its day when the schedule is rebuilt.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export { generateTouchpointDates, seedForClient } from './src/lib/touchpoints';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'fake', setup(b) {
    b.onResolve({ filter: /integrations\/supabase\/client$/ }, () => ({ path: 'db', namespace: 'mock' }));
    b.onResolve({ filter: /touchpointSettings$/ }, () => ({ path: 'settings', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
      contents: path === 'db' ? 'export const supabase = {};' : 'export const goLiveDate = async () => "2026-09-01";',
    }));
  } }],
});
const { generateTouchpointDates, seedForClient } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

const day = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const clients = Array.from({ length: 60 }, (_, i) => ({ id: `client-${i}`, start: day('2026-08-01', i % 30) }));
const plan = (c, today) => generateTouchpointDates(c.start, 'Low Level', [], [], today, seedForClient(c.id), '2026-09-01', []);

test('no day carries more than a fair share of a 60-client caseload', () => {
  const perDay = new Map();
  for (const c of clients) for (const d of plan(c, '2026-10-26')) perDay.set(d.date, (perDay.get(d.date) ?? 0) + 1);
  const busiest = Math.max(...perDay.values());
  // Nobody has logged anything here, so most visits are overdue and go to the
  // coming week; this used to put 50+ of them on three days.
  assert.ok(busiest <= 12, `busiest day has ${busiest}`);
  assert.ok(perDay.size >= 10, `only ${perDay.size} days used`);
});

test('a visit keeps its day when the schedule is rebuilt the next day', () => {
  // Rebuilt on Monday and again on Tuesday: anything placed after Tuesday,
  // planned or catching up, stays where it was.
  let kept = 0, later = 0;
  for (const c of clients) {
    const a = plan(c, '2026-10-26')[0];
    if (!a || a.date <= '2026-10-27') continue;
    later += 1;
    if (plan(c, '2026-10-27')[0]?.date === a.date) kept += 1;
  }
  assert.ok(later > 20, `only ${later}`);
  assert.equal(kept, later);
});

