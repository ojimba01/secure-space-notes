// The LON's total, added up as the scores are chosen.
//
// Each LON question has a score dropdown (Score_2 … Score_19), and the form
// asks the assessor to "add up all the scores and provide the total score" in
// one box. The app fills that box in from the dropdowns whenever one changes,
// so nobody adds it up by hand. The total still saves with the form and is
// what the client record reads back as the LON score.
import type { PDFDocumentProxy } from 'pdfjs-dist';

export const LON_TOTAL_FIELD = 'Please add up all the scores and provide the total score below TOTAL SCORE';
const isScoreField = (name: string) => /^Score_\d+$/.test(name);

type FieldObject = { id: string; value?: unknown };
type Storage = {
  getValue: (id: string, fallback: { value: unknown }) => { value: unknown };
  setValue: (id: string, value: { value: string }) => void;
};

const asNumber = (v: unknown): number => {
  const first = Array.isArray(v) ? v[0] : v;
  const n = Number(first);
  return Number.isFinite(n) ? n : 0;
};

/** Add up the score dropdowns and write the total into its box. Returns the total, or null if this is not a LON. */
export async function updateLonTotal(doc: PDFDocumentProxy | null): Promise<number | null> {
  if (!doc) return null;
  const fields = ((await doc.getFieldObjects()) ?? {}) as Record<string, FieldObject[]>;
  const totalField = fields[LON_TOTAL_FIELD]?.[0];
  if (!totalField) return null;
  const storage = (doc as unknown as { annotationStorage: Storage }).annotationStorage;

  let total = 0;
  for (const [name, objects] of Object.entries(fields)) {
    if (!isScoreField(name)) continue;
    for (const o of objects) total += asNumber(storage.getValue(o.id, { value: o.value }).value);
  }

  const text = String(total);
  storage.setValue(totalField.id, { value: text });
  // The box on the page, when it is drawn.
  const box = document.querySelector<HTMLInputElement>(`[data-element-id="${totalField.id}"]`);
  if (box) box.value = text;
  return total;
}

/** True for a change to one of the LON's score dropdowns. */
export const isLonScoreChange = (target: EventTarget | null): boolean =>
  target instanceof HTMLSelectElement && isScoreField(target.name);
