// The UHC Move-in Supports Request: answers go into UHC's own spreadsheet,
// in the right cells, with the totals the sheet itself does not work out.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import JSZip from 'jszip';

const bundle = await build({
  stdin: {
    contents: `export * from './src/lib/uhcMoveIn/model'; export * from './src/lib/uhcMoveIn/fill'; export * from './src/lib/uhcMoveIn/layout';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  alias: { '@': `${process.cwd()}/src` },
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const template = readFileSync('public/form-templates/uhc-move-in-supports.xlsx');

function sample() {
  const a = mod.emptyAnswers();
  Object.assign(a.member, {
    provider: 'Sample Agency', caseManager: 'Pat Example', cmPhone: '555-0100', cmEmail: 'pat@example.org',
    memberName: 'Alex Sample', medicaidId: '123456789', householdSize: '3', newAddress: '1 Main St Apt 2',
    newCityStateZip: 'Newark, NJ 07102', memberPhone: '555-0199', moveInDate: '2026-11-01',
    emergencyName: 'Sam Sample', emergencyPhone: '555-0123', delivery: 'Weekday mornings',
  });
  a.lines['food.asparagus'] = { qty: 2, cost: 7.5 };
  a.lines['food.yogurt_flavor'] = { qty: 4, cost: 6, note: 'Strawberry' };
  a.lines['food.other1'] = { qty: 1, item: 'Plantains', cost: 3 };
  a.lines['services.security_deposit'] = { cost: 1500 };
  a.lines['household.sofa'] = { qty: 1, cost: 750 };
  a.lines['clothing.bras_front_back'] = { qty: 2, cost: 20, size: 'M', note: 'Front' };
  return a;
}

const cell = (xml, ref) => {
  const m = xml.match(new RegExp(`<c r="${ref}"[^>]*?(?:/>|>([\\s\\S]*?)</c>)`));
  if (!m || !m[1]) return null;
  const v = m[1].match(/<v>([^<]*)<\/v>/);
  if (v) return Number(v[1]);
  const t = m[1].match(/<t[^>]*>([^<]*)<\/t>/);
  return t ? t[1] : null;
};

test('every line names cells that exist on the sheet layout', () => {
  const ids = new Set();
  for (const t of mod.UHC_TABS) for (const s of t.sections) for (const l of s.lines) {
    assert.ok(!ids.has(l.id), `duplicate id ${l.id}`);
    ids.add(l.id);
    for (const ref of [l.cell, l.qty, l.total, l.size].filter(Boolean)) assert.match(ref, /^[A-Z]+\d+$/, `${l.id} ${ref}`);
  }
  assert.ok(ids.size > 400, `${ids.size} lines`);
  for (const id of mod.NEEDS_PAPERWORK) assert.ok(ids.has(id), id);
});

test('totals add up per tab and overall', () => {
  const a = sample();
  const food = mod.UHC_TABS.find((t) => t.id === 'food');
  assert.equal(mod.tabTotal(food, a), 16.5);
  assert.equal(mod.grandTotal(a), 16.5 + 1500 + 750 + 20);
  assert.equal(mod.needsPaperwork(a), true);
  assert.equal(mod.overCap('household.sofa', a.lines['household.sofa']).max, 689);
  assert.equal(mod.overCap('household.sofa', { qty: 2, cost: 1000 }), undefined);
});

test('answers land in the right cells of UHC\'s spreadsheet', async () => {
  const out = await mod.fillUhcWorkbook(template, sample());
  const zip = await JSZip.loadAsync(out);
  const member = await zip.file('xl/worksheets/sheet1.xml').async('string');
  assert.equal(cell(member, 'C11'), 'Alex Sample');
  assert.equal(cell(member, 'C13'), 3);
  assert.equal(cell(member, 'C14'), '1 Main St Apt 2, Newark, NJ 07102');
  assert.equal(cell(member, 'C16'), '11/01/2026');
  assert.equal(cell(member, 'B18'), 'Sam Sample, 555-0123');
  assert.equal(cell(member, 'F22'), 2286.5);
  const food = await zip.file('xl/worksheets/sheet3.xml').async('string');
  assert.equal(cell(food, 'A3'), 2);
  assert.equal(cell(food, 'C3'), 7.5);
  assert.equal(cell(food, 'B30'), 'Yogurt Flavor: Strawberry');
  assert.equal(cell(food, 'B129'), 'Plantains');
  assert.equal(cell(food, 'I148'), 16.5);
  const services = await zip.file('xl/worksheets/sheet2.xml').async('string');
  assert.equal(cell(services, 'C4'), 1500);
  assert.equal(cell(services, 'C28'), 1500);
  const pantry = await zip.file('xl/worksheets/sheet4.xml').async('string');
  assert.equal(cell(pantry, 'T3'), 'M');
  assert.equal(cell(pantry, 'W3'), 'Bras (Front/Back): Front');
  assert.equal(cell(pantry, 'W17'), 20);
  // The logo and the rest of UHC's file are untouched.
  assert.ok(zip.file('xl/media/image1.jpeg'));
  const before = await JSZip.loadAsync(template);
  assert.equal(await zip.file('xl/styles.xml').async('string'), await before.file('xl/styles.xml').async('string'));
});

test('setCell adds a cell in column order when the row lacks it', () => {
  const xml = '<sheetData><row r="2"><c r="A2" s="1"/><c r="C2" s="1"/></row></sheetData>';
  const out = mod.setCell(xml, 'B2', 5);
  assert.equal(out, '<sheetData><row r="2"><c r="A2" s="1"/><c r="B2"><v>5</v></c><c r="C2" s="1"/></row></sheetData>');
  assert.equal(mod.setCell(xml, 'A4', 'x'), '<sheetData><row r="2"><c r="A2" s="1"/><c r="C2" s="1"/></row><row r="4"><c r="A4" t="inlineStr"><is><t xml:space="preserve">x</t></is></c></row></sheetData>');
});
