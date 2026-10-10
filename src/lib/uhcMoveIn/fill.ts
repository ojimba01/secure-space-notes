// Writes the answers into UHC's own spreadsheet.
//
// The cells are set in the sheet XML directly, so everything else in the file
// (the logo, the colours, the merged boxes, the column widths) is exactly as
// UHC sent it. Rewriting the workbook through a spreadsheet library would drop
// its formatting.
import JSZip from 'jszip';
import { GRAND_TOTAL_CELL, MEMBER_CELLS, MEMBER_SHEET, UHC_TABS } from './layout';
import { grandTotal, isPicked, tabTotal, type UhcAnswers } from './model';

type Value = string | number;

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const colNumber = (ref: string) =>
  ref.replace(/\d+$/, '').split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const rowNumber = (ref: string) => Number(ref.replace(/^[A-Z]+/, ''));

function cellXml(ref: string, attrs: string, value: Value): string {
  // Keep the cell's style; drop any type, since the value decides it.
  const kept = attrs.replace(/\s+t="[^"]*"/, '');
  if (typeof value === 'number') return `<c r="${ref}"${kept}><v>${value}</v></c>`;
  return `<c r="${ref}"${kept} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

/** Set one cell in a worksheet's XML, adding the cell or its row where the sheet has none. */
export function setCell(xml: string, ref: string, value: Value): string {
  const cellRe = new RegExp(`<c r="${ref}"((?:\\s[^>]*?)?)(?:/>|>[\\s\\S]*?</c>)`);
  const m = xml.match(cellRe);
  if (m) {
    const attrs = (m[1] ?? '').replace(/\/$/, '');
    return xml.replace(cellRe, cellXml(ref, attrs, value));
  }
  const r = rowNumber(ref);
  const rowRe = new RegExp(`<row r="${r}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const row = xml.match(rowRe);
  const fresh = cellXml(ref, '', value);
  if (row) {
    const attrs = row[1];
    const cells = row[3] ?? '';
    // Cells in a row run left to right.
    const parts: string[] = [...(cells.match(/<c r="[A-Z]+\d+"[\s\S]*?(?:\/>|<\/c>)/g) ?? [])];
    const at = parts.findIndex((c) => colNumber(c.match(/r="([A-Z]+\d+)"/)![1]) > colNumber(ref));
    if (at === -1) parts.push(fresh);
    else parts.splice(at, 0, fresh);
    return xml.replace(rowRe, `<row r="${r}"${attrs.replace(/\/$/, '')}>${parts.join('')}</row>`);
  }
  // No row yet: put one in, in order.
  const rows = [...xml.matchAll(/<row r="(\d+)"/g)];
  const next = rows.find((x) => Number(x[1]) > r);
  const newRow = `<row r="${r}">${fresh}</row>`;
  if (next && next.index !== undefined) return xml.slice(0, next.index) + newRow + xml.slice(next.index);
  return xml.replace('</sheetData>', `${newRow}</sheetData>`).replace('<sheetData/>', `<sheetData>${newRow}</sheetData>`);
}

const mmddyyyy = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${m}/${d}/${y}` : iso;
};

/** Every cell to write, sheet by sheet. */
export function cellsFor(answers: UhcAnswers): Map<string, Map<string, Value>> {
  const out = new Map<string, Map<string, Value>>();
  const put = (sheet: string, ref: string | undefined, v: Value | undefined | null) => {
    if (!ref || v === undefined || v === null || v === '') return;
    if (!out.has(sheet)) out.set(sheet, new Map());
    out.get(sheet)!.set(ref, v);
  };

  const m = answers.member;
  const household = Number(m.householdSize);
  put(MEMBER_SHEET, MEMBER_CELLS.provider, m.provider.trim());
  put(MEMBER_SHEET, MEMBER_CELLS.caseManager, m.caseManager.trim());
  put(MEMBER_SHEET, MEMBER_CELLS.cmPhone, m.cmPhone.trim());
  put(MEMBER_SHEET, MEMBER_CELLS.cmEmail, m.cmEmail.trim());
  put(MEMBER_SHEET, MEMBER_CELLS.memberName, m.memberName.trim());
  put(MEMBER_SHEET, MEMBER_CELLS.medicaidId, m.medicaidId.trim());
  put(MEMBER_SHEET, MEMBER_CELLS.householdSize, m.householdSize.trim() && Number.isFinite(household) ? household : m.householdSize.trim());
  put(MEMBER_SHEET, MEMBER_CELLS.newAddress, [m.newAddress, m.newCityStateZip].map((s) => s.trim()).filter(Boolean).join(', '));
  put(MEMBER_SHEET, MEMBER_CELLS.memberPhone, m.memberPhone.trim());
  put(MEMBER_SHEET, MEMBER_CELLS.moveInDate, m.moveInDate ? mmddyyyy(m.moveInDate) : '');
  put(MEMBER_SHEET, MEMBER_CELLS.emergencyContact, [m.emergencyName, m.emergencyPhone].map((s) => s.trim()).filter(Boolean).join(', '));
  put(MEMBER_SHEET, MEMBER_CELLS.delivery, m.delivery.trim());
  put(MEMBER_SHEET, GRAND_TOTAL_CELL, grandTotal(answers));

  for (const tab of UHC_TABS) {
    for (const s of tab.sections)
      for (const l of s.lines) {
        const a = answers.lines[l.id];
        if (!isPicked(l, a)) continue;
        if (l.qty && a?.qty) put(tab.sheet, l.qty, a.qty);
        if (l.total && a?.cost) put(tab.sheet, l.total, a.cost);
        if (l.size) put(tab.sheet, l.size, (a?.size ?? '').trim());
        if (l.free) put(tab.sheet, l.cell, (a?.item ?? '').trim());
        else if (l.note && (a?.note ?? '').trim()) {
          // After UHC's words, as somebody filling it by hand would write it.
          const base = (l.text ?? l.label ?? '').replace(/\s+$/, '');
          const sep = /[:\-–]$/.test(base) ? ' ' : ': ';
          put(tab.sheet, l.cell, `${base}${sep}${a!.note!.trim()}`);
        }
      }
    put(tab.sheet, tab.totalCell, tabTotal(tab, answers));
  }
  return out;
}

/** UHC's spreadsheet with the answers written in. */
export async function fillUhcWorkbook(template: ArrayBuffer | Uint8Array, answers: UhcAnswers): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(template);
  for (const [sheet, cells] of cellsFor(answers)) {
    const file = zip.file(sheet);
    if (!file) throw new Error(`The UHC template has no ${sheet}.`);
    let xml = await file.async('string');
    for (const [ref, v] of cells) xml = setCell(xml, ref, v);
    zip.file(sheet, xml);
  }
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

// ---- reading a filled copy back ---------------------------------------------------

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** The text runs of a string item, joined (rich text keeps its words in several <t>). */
const runs = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');

/** A cell's value as Excel saved it: shared string, inline string or number. */
export function getCell(xml: string, ref: string, shared: string[]): string | number | null {
  const m = xml.match(new RegExp(`<c r="${ref}"((?:\\s[^>]*?)?)(?:/>|>([\\s\\S]*?)</c>)`));
  if (!m || !m[2]) return null;
  const type = (m[1].match(/\st="([^"]*)"/) ?? [])[1];
  if (type === 'inlineStr') return runs(m[2]);
  const v = (m[2].match(/<v>([\s\S]*?)<\/v>/) ?? [])[1];
  if (v === undefined) return null;
  if (type === 's') return shared[Number(v)] ?? null;
  if (type === 'str' || type === 'e') return unescapeXml(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : unescapeXml(v);
}

/** Excel keeps dates as days since 1899-12-30. */
const excelDate = (v: string | number | null): string => {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v ?? '').trim();
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};

const num = (v: string | number | null): number | undefined => {
  if (v === null || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) && n !== 0 ? Math.round(n * 100) / 100 : undefined;
};

/**
 * The answers in a UHC spreadsheet somebody filled in by hand, so an uploaded
 * copy opens in the app like one filled in here. Returns null when the file is
 * not UHC's checklist.
 */
export async function readUhcWorkbook(bytes: ArrayBuffer | Uint8Array): Promise<UhcAnswers | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    return null;
  }
  const memberXml = await zip.file(MEMBER_SHEET)?.async('string');
  if (!memberXml) return null;
  const sharedXml = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '';
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]));
  if (!/Move In Supports/i.test(String(getCell(memberXml, 'B5', shared) ?? ''))) return null;

  const sheets = new Map<string, string>([[MEMBER_SHEET, memberXml]]);
  for (const t of UHC_TABS) if (!sheets.has(t.sheet)) sheets.set(t.sheet, (await zip.file(t.sheet)?.async('string')) ?? '');
  const at = (sheet: string, ref: string | undefined) => (ref ? getCell(sheets.get(sheet) ?? '', ref, shared) : null);
  const text = (sheet: string, ref: string | undefined) => {
    const v = at(sheet, ref);
    return v === null ? '' : String(v).trim();
  };

  const a: UhcAnswers = { v: 1, member: { ...emptyMemberValues() }, lines: {}, paperwork: {} };
  const m = a.member;
  const M = (k: keyof typeof MEMBER_CELLS) => text(MEMBER_SHEET, MEMBER_CELLS[k]);
  m.provider = M('provider');
  m.caseManager = M('caseManager');
  m.cmPhone = M('cmPhone');
  m.cmEmail = M('cmEmail');
  m.memberName = M('memberName');
  m.medicaidId = M('medicaidId');
  m.householdSize = M('householdSize');
  m.newAddress = M('newAddress');
  m.memberPhone = M('memberPhone');
  m.moveInDate = excelDate(at(MEMBER_SHEET, MEMBER_CELLS.moveInDate));
  m.emergencyName = M('emergencyContact');
  m.delivery = M('delivery');

  for (const tab of UHC_TABS)
    for (const s of tab.sections)
      for (const l of s.lines) {
        const qty = num(at(tab.sheet, l.qty));
        const cost = num(at(tab.sheet, l.total));
        const size = l.size ? text(tab.sheet, l.size) : '';
        const cellText = text(tab.sheet, l.cell);
        const ans: { qty?: number; cost?: number; note?: string; item?: string; size?: string } = {};
        if (qty) ans.qty = qty;
        if (cost) ans.cost = cost;
        if (size) ans.size = size;
        if (l.free) {
          if (cellText) ans.item = cellText;
        } else if (l.note) {
          // Whatever follows UHC's own words is the note.
          const base = (l.text ?? '').trim();
          if (base && cellText.startsWith(base) && cellText.length > base.length) ans.note = cellText.slice(base.length).replace(/^[\s:\-–]+/, '').trim();
        }
        if (Object.keys(ans).length && (ans.qty || ans.cost || ans.item)) a.lines[l.id] = ans;
      }
  return a;
}

function emptyMemberValues() {
  return { provider: '', caseManager: '', cmPhone: '', cmEmail: '', memberName: '', medicaidId: '', householdSize: '', newAddress: '', newCityStateZip: '', memberPhone: '', moveInDate: '', emergencyName: '', emergencyPhone: '', delivery: '' };
}
