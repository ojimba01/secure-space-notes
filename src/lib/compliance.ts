// Monthly touch-point compliance logic (shared by client checklist + My Month dashboard)
// All date math uses a single agency time zone (America/New_York) via plain YYYY-MM-DD strings.

export type Modality = 'phone' | 'virtual' | 'in_person';
export type ComplianceStatus = 'on_track' | 'behind' | 'complete' | 'incomplete_escalated';

export const ENFORCEMENT_START = '2026-07-01'; // enforcement begins July 2026

export interface SupportActivity {
  key: string;
  label: string;
  tooltipKey: string;
}

export const SUPPORT_ACTIVITIES: SupportActivity[] = [
  { key: 'landlord_tenant', label: 'Landlord / tenant coordination', tooltipKey: 'landlord_tenant' },
  { key: 'subsidy', label: 'Housing subsidy application or recertification', tooltipKey: 'subsidy' },
  { key: 'linkage', label: 'Linkage to community resources', tooltipKey: 'linkage' },
  { key: 'eviction_prevention', label: 'Eviction prevention / lease-violation response', tooltipKey: 'eviction_prevention' },
  { key: 'supportive_housing', label: 'Coordination with supportive housing programs', tooltipKey: 'supportive_housing' },
  { key: 'bh_referral', label: 'Behavioral health / SUD / medical / legal referral', tooltipKey: 'bh_referral' },
  { key: 'reassessment', label: 'Periodic reassessment of housing stability', tooltipKey: 'reassessment' },
];

export const MODALITY_LABELS: Record<Modality, string> = {
  phone: 'Phone',
  virtual: 'Virtual',
  in_person: 'In-Person',
};

export interface ContactRow {
  id: string;
  contact_date: string; // YYYY-MM-DD
  modality: Modality;
}

export interface Requirements {
  requiredContacts: number;
  requiredInPerson: number;
  requiredActivities: number;
}

export function requirementsForTier(tier: string | null | undefined): Requirements {
  if (tier === 'High Level') {
    return { requiredContacts: 4, requiredInPerson: 2, requiredActivities: 2 };
  }
  return { requiredContacts: 2, requiredInPerson: 0, requiredActivities: 0 };
}

// ---- date helpers ---------------------------------------------------
export function toDate(s: string): Date {
  // interpret as noon UTC to avoid off-by-one
  return new Date(`${s}T12:00:00Z`);
}
export function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(s: string, days: number): string {
  const d = toDate(s);
  d.setUTCDate(d.getUTCDate() + days);
  return fmt(d);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
}
export function firstOfMonth(s: string): string {
  return `${s.slice(0, 7)}-01`;
}
export function lastOfMonth(s: string): string {
  const d = toDate(firstOfMonth(s));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return fmt(d);
}
export function todayAgency(): string {
  // agency tz date
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

// ---- counting -------------------------------------------------------
export function distinctDays(contacts: ContactRow[]): string[] {
  return Array.from(new Set(contacts.map((c) => c.contact_date))).sort();
}

// in-person visits that satisfy the >=7-day-apart spacing (greedy earliest-first)
export function spacedInPersonDates(contacts: ContactRow[]): string[] {
  const dates = Array.from(
    new Set(contacts.filter((c) => c.modality === 'in_person').map((c) => c.contact_date)),
  ).sort();
  const kept: string[] = [];
  for (const d of dates) {
    if (kept.length === 0 || daysBetween(kept[kept.length - 1], d) >= 7) {
      kept.push(d);
    }
  }
  return kept;
}

export interface ComplianceProgress {
  contactDays: number;
  inPersonSpaced: number;
  activitiesDone: number;
  hasNote: boolean;
  isComplete: boolean;
}

export function computeProgress(
  req: Requirements,
  contacts: ContactRow[],
  activities: string[],
  summaryNote: string | null,
): ComplianceProgress {
  const contactDays = distinctDays(contacts).length;
  const inPersonSpaced = spacedInPersonDates(contacts).length;
  const activitiesDone = activities.length;
  const hasNote = !!summaryNote && summaryNote.trim().length > 0;
  const isComplete =
    contactDays >= req.requiredContacts &&
    inPersonSpaced >= req.requiredInPerson &&
    activitiesDone >= req.requiredActivities &&
    (req.requiredActivities === 0 || hasNote);
  return { contactDays, inPersonSpaced, activitiesDone, hasNote, isComplete };
}

// ---- feasibility ("behind") ----------------------------------------
// A client is "behind" when finishing the month is no longer possible under
// the spacing rules: more separate-day contacts remain than days left can hold,
// OR remaining in-person visits cannot be fit >=7 days apart before month end.
export function isFeasible(
  req: Requirements,
  contacts: ContactRow[],
  today: string,
): boolean {
  const monthEnd = lastOfMonth(today);
  if (daysBetween(today, monthEnd) < 0) return true; // month already over
  const usedDays = new Set(distinctDays(contacts));
  const contactsRemaining = Math.max(0, req.requiredContacts - usedDays.size);

  // count remaining calendar days that are not already used for a contact
  let freeDays = 0;
  for (let d = today; daysBetween(d, monthEnd) >= 0; d = addDays(d, 1)) {
    if (!usedDays.has(d)) freeDays++;
  }
  if (contactsRemaining > freeDays) return false;

  // in-person spacing feasibility
  const spaced = spacedInPersonDates(contacts);
  const inPersonRemaining = Math.max(0, req.requiredInPerson - spaced.length);
  if (inPersonRemaining > 0) {
    let earliest = today;
    if (spaced.length > 0) {
      const candidate = addDays(spaced[spaced.length - 1], 7);
      if (daysBetween(today, candidate) > 0) earliest = candidate;
    }
    // need inPersonRemaining visits, each 7 days apart, starting no earlier than `earliest`
    const lastNeeded = addDays(earliest, (inPersonRemaining - 1) * 7);
    if (daysBetween(lastNeeded, monthEnd) < 0) return false;
  }
  return true;
}

export function deriveStatus(
  req: Requirements,
  contacts: ContactRow[],
  activities: string[],
  summaryNote: string | null,
  today: string,
  isNewClientFirstWeek: boolean,
): ComplianceStatus {
  const prog = computeProgress(req, contacts, activities, summaryNote);
  if (prog.isComplete) return 'complete';
  if (isNewClientFirstWeek) return 'on_track';
  return isFeasible(req, contacts, today) ? 'on_track' : 'behind';
}

// ---- plan date generation ------------------------------------------
function jitter(base: string, range: number): string {
  const offset = Math.floor(Math.random() * (range * 2 + 1)) - range;
  return addDays(base, offset);
}

export interface PlanDate {
  date: string;
  modality: Modality;
  suggested: true;
}

export function generatePlanDates(tier: string, monthStart: string, startFrom?: string): PlanDate[] {
  const monthEnd = lastOfMonth(monthStart);
  const begin = startFrom && daysBetween(monthStart, startFrom) > 0 ? startFrom : addDays(monthStart, 2);
  const clamp = (d: string) => (daysBetween(d, monthEnd) < 0 ? monthEnd : d);
  const dates: PlanDate[] = [];
  if (tier === 'High Level') {
    // 4 dates ~weekly, mark 2 in-person spaced
    const slots = [0, 1, 2, 3].map((i) => clamp(jitter(addDays(begin, i * 7), 2)));
    slots.forEach((d, i) =>
      dates.push({ date: d, modality: i % 2 === 0 ? 'in_person' : 'phone', suggested: true }),
    );
  } else {
    const a = clamp(jitter(addDays(begin, 3), 2));
    const b = clamp(jitter(addDays(begin, 17), 2));
    dates.push({ date: a, modality: 'phone', suggested: true });
    dates.push({ date: b, modality: 'phone', suggested: true });
  }
  return dates;
}

// weekly client target = ceil(caseload / 4)
export function weeklyTarget(caseload: number): number {
  return Math.ceil(caseload / 4);
}

export function startOfWeek(today: string): string {
  const d = toDate(today);
  const day = d.getUTCDay(); // 0 Sun
  return addDays(today, -day);
}
export function endOfWeek(today: string): string {
  return addDays(startOfWeek(today), 6);
}
