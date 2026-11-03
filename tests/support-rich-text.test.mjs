// Formatted support replies: what the editor holds becomes safe blocks of
// text, and only the palette colours survive.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: { contents: `export * from './src/lib/richText';`, resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, platform: 'node', format: 'esm',
  alias: { '@': `${process.cwd()}/src` },
});
const { domToRich, cleanRich, richToPlain, paletteColor, hasFormatting } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

// A tiny stand-in for the editor's DOM.
const text = (t) => ({ nodeType: 3, nodeName: '#text', textContent: t, childNodes: [] });
const el = (tag, kids = [], style = {}, attrs = {}) => ({
  nodeType: 1,
  nodeName: tag,
  textContent: null,
  childNodes: kids,
  style,
  getAttribute: (n) => attrs[n] ?? null,
});

test('bold, italics and colour become runs', () => {
  const root = el('DIV', [
    text('Select '),
    el('B', [text('Continue')]),
    text(' then '),
    el('SPAN', [el('I', [text('Complete form')])], { color: 'rgb(220, 38, 38)' }),
  ]);
  assert.deepEqual(domToRich(root), [
    {
      kind: 'p',
      runs: [
        { text: 'Select ' },
        { text: 'Continue', bold: true },
        { text: ' then ' },
        { text: 'Complete form', italic: true, color: '#dc2626' },
      ],
    },
  ]);
});

test('bullet points and line breaks become blocks', () => {
  const root = el('DIV', [
    el('DIV', [text('Steps:')]),
    el('UL', [el('LI', [text('Open Clients')]), el('LI', [text('Select the client')])]),
    el('DIV', [text('Thanks')]),
  ]);
  const blocks = domToRich(root);
  assert.deepEqual(blocks.map((b) => b.kind), ['p', 'li', 'li', 'p']);
  assert.equal(richToPlain(blocks), 'Steps:\n• Open Clients\n• Select the client\nThanks');
  assert.equal(hasFormatting(blocks), true);
});

test('colours outside the palette, scripts and images are dropped', () => {
  const root = el('DIV', [
    el('SPAN', [text('odd colour')], { color: '#123456' }),
    el('SCRIPT', [text('alert(1)')]),
    el('IMG'),
    el('A', [text(' link text')], {}, { href: 'javascript:alert(1)' }),
  ]);
  assert.deepEqual(domToRich(root), [{ kind: 'p', runs: [{ text: 'odd colour link text' }] }]);
});

test('stored replies are cleaned before they are shown', () => {
  assert.deepEqual(
    cleanRich([
      { kind: 'script', runs: [{ text: 'x', bold: 'yes', color: 'url(evil)', onclick: 'x' }] },
      { kind: 'li', runs: [{ text: 42 }, { text: 'ok', color: '#2563EB' }] },
      { kind: 'p', runs: [] },
    ]),
    [
      { kind: 'p', runs: [{ text: 'x' }] },
      { kind: 'li', runs: [{ text: 'ok', color: '#2563eb' }] },
    ],
  );
  assert.deepEqual(cleanRich('<b>not blocks</b>'), []);
});

test('blank lines beside a list or repeated are dropped', () => {
  const blocks = cleanRich([
    { kind: 'p', runs: [{ text: 'Hi' }] },
    { kind: 'p', runs: [] },
    { kind: 'p', runs: [] },
    { kind: 'p', runs: [{ text: 'Steps' }] },
    { kind: 'p', runs: [] },
    { kind: 'li', runs: [{ text: 'One' }] },
    { kind: 'p', runs: [] },
  ]);
  assert.deepEqual(blocks.map((b) => b.runs.map((r) => r.text).join('')), ['Hi', '', 'Steps', 'One']);
});

test('palette colours only', () => {
  assert.equal(paletteColor('rgb(22, 163, 74)'), '#16a34a');
  assert.equal(paletteColor('#000000'), undefined);
  assert.equal(paletteColor('red'), undefined);
});
