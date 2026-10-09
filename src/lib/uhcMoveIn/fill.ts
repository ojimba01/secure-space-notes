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
