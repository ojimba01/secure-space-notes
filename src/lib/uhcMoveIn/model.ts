// The UHC Move-in Supports Request as the app keeps it: who it is for, and
// what the member asked for, line by line.
//
// It is filled in while talking with the member, so a line is picked with a
// quantity first and priced later. Costs are the estimated dollar amount for
// the whole line. UHC's own sheet has no formulas, so every total here is
// added up by the app and written into the sheet as a number.
import { FURNITURE_CAPS, NEEDS_PAPERWORK, UHC_TABS } from './layout';
import type { UhcLine, UhcTab } from './types';

export const UHC_FORM_TYPE = 'Move-In Supports Request';
export const UHC_FORM_LABEL = 'UHC Move-in Supports Request';
export const UHC_TEMPLATE = '/form-templates/uhc-move-in-supports.xlsx';
/** The MCO value on the client record that this form belongs to. */
export const UHC_MCO = 'UnitedHealthcare';

export interface UhcMember {
  provider: string;
  caseManager: string;
  cmPhone: string;
  cmEmail: string;
  memberName: string;
  medicaidId: string;
  householdSize: string;
  newAddress: string;
  newCityStateZip: string;
  memberPhone: string;
  /** ISO date. */
  moveInDate: string;
  emergencyName: string;
  emergencyPhone: string;
  delivery: string;
}

export interface UhcLineAnswer {
  qty?: number;
  /** Estimated dollars for the whole line. */
  cost?: number;
  note?: string;
  /** A blank line: what the item is. */
  item?: string;
  size?: string;
}

export interface UhcAnswers {
  v: 1;
  member: UhcMember;
  lines: Record<string, UhcLineAnswer>;
  /** Paperwork in hand for fees, deposits and moving costs. */
  paperwork: { w9?: boolean; invoices?: boolean; lease?: boolean };
}

export const emptyMember = (): UhcMember => ({
  provider: '',
  caseManager: '',
  cmPhone: '',
  cmEmail: '',
  memberName: '',
  medicaidId: '',
  householdSize: '',
  newAddress: '',
  newCityStateZip: '',
  memberPhone: '',
  moveInDate: '',
  emergencyName: '',
  emergencyPhone: '',
  delivery: '',
});

export const emptyAnswers = (): UhcAnswers => ({ v: 1, member: emptyMember(), lines: {}, paperwork: {} });

/** Answers as saved, with anything missing filled in. */
export function normalizeAnswers(raw: unknown): UhcAnswers {
  const r = (raw ?? {}) as Partial<UhcAnswers>;
  return { v: 1, member: { ...emptyMember(), ...(r.member ?? {}) }, lines: { ...(r.lines ?? {}) }, paperwork: { ...(r.paperwork ?? {}) } };
}

export const ALL_LINES: UhcLine[] = UHC_TABS.flatMap((t) => t.sections.flatMap((s) => s.lines));
const LINE_BY_ID = new Map(ALL_LINES.map((l) => [l.id, l]));
export const lineById = (id: string) => LINE_BY_ID.get(id);

/** Whether a line has been asked for. A blank line counts once it is named. */
export function isPicked(line: UhcLine, a: UhcLineAnswer | undefined): boolean {
  if (!a) return false;
  if (line.free) return !!(a.item ?? '').trim();
  return (a.qty ?? 0) > 0 || (a.cost ?? 0) > 0;
}

const money = (n: number) => Math.round(n * 100) / 100;

export function tabTotal(tab: UhcTab, answers: UhcAnswers): number {
  let sum = 0;
  for (const s of tab.sections)
    for (const l of s.lines) if (isPicked(l, answers.lines[l.id])) sum += answers.lines[l.id]?.cost ?? 0;
  return money(sum);
}

export const grandTotal = (answers: UhcAnswers) => money(UHC_TABS.reduce((n, t) => n + tabTotal(t, answers), 0));

export function pickedCount(tab: UhcTab, answers: UhcAnswers): number {
  return tab.sections.reduce((n, s) => n + s.lines.filter((l) => isPicked(l, answers.lines[l.id])).length, 0);
}

/** Picked lines with no cost yet. */
export const unpriced = (answers: UhcAnswers): UhcLine[] =>
  ALL_LINES.filter((l) => isPicked(l, answers.lines[l.id]) && !(answers.lines[l.id]?.cost ?? 0));

/** Whether the W-9, invoices and lease are called for: a fee, deposit or moving cost is picked. */
export const needsPaperwork = (answers: UhcAnswers) =>
  NEEDS_PAPERWORK.some((id) => {
    const l = lineById(id);
    return !!l && isPicked(l, answers.lines[id]);
  });

// ---- furniture caps ------------------------------------------------------------

/** Furniture lines and the cap on UHC's price list that each is held to. */
const CAP_FOR: Record<string, string> = {
  'household.sofa': 'Sofa',
  'household.loveseat': 'Loveseat',
  'household.chair': 'Chair',
  'household.nightstand': 'Night Stand',
  'household.table_and_chairs': '7 Piece Dining set',
  'household.long_dresser': 'Dresser and mirror',
  'household.tall_dresser': '5 Drawer Chest',
  'household.mattress_twin': 'Twin Ortho Mattress',
  'household.mattress_full': 'Full Ortho Mattress',
};

export function capFor(lineId: string): { label: string; max: number } | undefined {
  const name = CAP_FOR[lineId];
  return name ? FURNITURE_CAPS.find((c) => c.label === name) : undefined;
}

/** The cap a line's price per item goes over, if any. Over a cap is reviewed by UHC, not refused. */
export function overCap(lineId: string, a: UhcLineAnswer | undefined): { label: string; max: number } | undefined {
  const cap = capFor(lineId);
  if (!cap || !a?.cost) return undefined;
  const each = a.cost / Math.max(1, a.qty ?? 1);
  return each > cap.max ? cap : undefined;
}

export const formatMoney = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
