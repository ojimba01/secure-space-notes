// Formatted support replies: bold, italics, bullet points and a few colours.
//
// A reply is stored as blocks of runs rather than HTML, and shown by building
// React elements from it, so nothing typed or pasted can ever run as markup.
// Only the colours below are allowed; anything else shows in the normal text
// colour.

export interface RichRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
}

export interface RichBlock {
  /** A paragraph, or one bullet point. */
  kind: 'p' | 'li';
  runs: RichRun[];
}

export const TEXT_COLORS: { name: string; value: string }[] = [
  { name: 'Black', value: '#111827' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Purple', value: '#7c3aed' },
];

const ALLOWED = new Set(TEXT_COLORS.map((c) => c.value));

/** A colour from the palette, or undefined. Accepts #rrggbb and rgb(r, g, b). */
export function paletteColor(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim().toLowerCase();
  let hex = s;
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (rgb) {
    hex = `#${[rgb[1], rgb[2], rgb[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`;
  }
  // Black is the normal text colour: no need to store it.
  if (hex === '#111827' || hex === '#000000') return undefined;
  return ALLOWED.has(hex) ? hex : undefined;
}

/** Only well-formed blocks with text survive; anything else is dropped. */
export function cleanRich(value: unknown): RichBlock[] {
  if (!Array.isArray(value)) return [];
  const out: RichBlock[] = [];
  for (const b of value) {
    if (!b || typeof b !== 'object') continue;
    const kind = (b as RichBlock).kind === 'li' ? 'li' : 'p';
    const runs: RichRun[] = [];
    for (const r of Array.isArray((b as RichBlock).runs) ? (b as RichBlock).runs : []) {
      if (!r || typeof r.text !== 'string' || !r.text) continue;
      const run: RichRun = { text: r.text };
      if (r.bold === true) run.bold = true;
      if (r.italic === true) run.italic = true;
      const color = paletteColor(r.color);
      if (color) run.color = color;
      runs.push(run);
    }
    out.push({ kind, runs });
  }
  // Empty lines at the ends, beside a list, or twice in a row are noise.
  const blank = (b: RichBlock | undefined) => !!b && b.kind === 'p' && !b.runs.some((r) => r.text.trim());
  const kept = out.filter(
    (b, i) =>
      !blank(b) || (out[i - 1]?.kind !== 'li' && out[i + 1]?.kind !== 'li' && !blank(out[i - 1])),
  );
  while (kept.length && blank(kept[0])) kept.shift();
  while (kept.length && blank(kept[kept.length - 1])) kept.pop();
  return kept;
}

/** The same reply as plain text, for emails, previews and older screens. */
export function richToPlain(blocks: RichBlock[]): string {
  return blocks
    .map((b) => {
      const text = b.runs.map((r) => r.text).join('');
      return b.kind === 'li' ? `• ${text}` : text;
    })
    .join('\n')
    .trim();
}

/** True when the reply uses any formatting at all. */
export const hasFormatting = (blocks: RichBlock[]) =>
  blocks.some((b) => b.kind === 'li' || b.runs.some((r) => r.bold || r.italic || r.color));

// ---- reading the editor (browser only)

interface DomNodeLike {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<DomNodeLike>;
  getAttribute?: (name: string) => string | null;
  style?: { color?: string; fontWeight?: string; fontStyle?: string };
}

const BLOCK_TAGS = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'PRE']);

/**
 * Turn what the editor holds into blocks. Reads only text, bold, italics,
 * list items and colour; every other tag and attribute is ignored.
 */
export function domToRich(root: DomNodeLike): RichBlock[] {
  const blocks: RichBlock[] = [];
  let current: RichBlock | null = null;

  const start = (kind: RichBlock['kind']) => {
    current = { kind, runs: [] };
    blocks.push(current);
  };
  const add = (text: string, fmt: Omit<RichRun, 'text'>) => {
    if (!text) return;
    if (!current) start('p');
    const runs = current!.runs;
    const prev = runs[runs.length - 1];
    if (prev && prev.bold === fmt.bold && prev.italic === fmt.italic && prev.color === fmt.color) {
      prev.text += text;
    } else {
      runs.push({ text, ...fmt });
    }
  };

  const walk = (node: DomNodeLike, fmt: Omit<RichRun, 'text'>, inList: boolean) => {
    if (node.nodeType === 3) {
      add((node.textContent ?? '').replace(/\u00a0/g, ' '), fmt);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.nodeName.toUpperCase();
    if (tag === 'BR') {
      start(inList ? 'li' : 'p');
      return;
    }
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IMG') return;

    const next = { ...fmt };
    if (tag === 'B' || tag === 'STRONG') next.bold = true;
    if (tag === 'I' || tag === 'EM') next.italic = true;
    const weight = node.style?.fontWeight;
    if (weight === 'bold' || (weight && Number(weight) >= 600)) next.bold = true;
    if (node.style?.fontStyle === 'italic') next.italic = true;
    const color = paletteColor(node.style?.color) ?? paletteColor(node.getAttribute?.('color'));
    if (color) next.color = color;
    else if (node.style?.color || node.getAttribute?.('color')) delete next.color;

    const kids = Array.from(node.childNodes);
    if (tag === 'UL' || tag === 'OL') {
      kids.forEach((k) => walk(k, next, true));
      current = null;
      return;
    }
    if (tag === 'LI') {
      start('li');
      kids.forEach((k) => walk(k, next, true));
      current = null;
      return;
    }
    if (BLOCK_TAGS.has(tag)) {
      if (!inList) start('p');
      kids.forEach((k) => walk(k, next, inList));
      if (!inList) current = null;
      return;
    }
    kids.forEach((k) => walk(k, next, inList));
  };

  Array.from(root.childNodes).forEach((k) => walk(k, {}, false));
  return cleanRich(blocks);
}
