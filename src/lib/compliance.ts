// Rolling 30-day touchpoint compliance logic (shared by the client checklist,
// the staff work queue, and oversight). All date math uses a single agency
// time zone (America/New_York) via plain YYYY-MM-DD strings.

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
  in_person: 'In person',
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
    // 4 touchpoints per 30-day cycle, at least 2 in person
    return { requiredContacts: 4, requiredInPerson: 2, requiredActivities: 2 };
  }
  // Low Level: 2 touchpoints per 30-day cycle, at least 1 in person
  return { requiredContacts: 2, requiredInPerson: 1, requiredActivities: 0 };
}

// A valid level of need value (Low Level / High Level). Anything else = not set.
export function hasValidTier(tier: string | null | undefined): boolean {
  return tier === 'High Level' || tier === 'Low Level';
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

// ---- rolling 30-day billing windows --------------------------------
// Touchpoint compliance is tracked in rolling 30-day windows anchored to the
// client's HSP / authorization / touchpoint start date — NOT calendar months.
export const BILLING_WINDOW_DAYS = 30;
export const MIN_SPACING_DAYS = 7; // conservative internal scheduling rule

export interface BillingWindow {
  index: number; // 0-based window number since start
  start: string; // YYYY-MM-DD (inclusive)
  end: string; // YYYY-MM-DD (inclusive)
}

// The 30-day window that `today` falls into, given the client's start date.
// Returns null when there is no start date.
export function currentBillingWindow(
  startDate: string | null | undefined,
  today: string,
): BillingWindow | null {
  if (!startDate) return null;
  const diff = daysBetween(startDate, today);
  if (diff < 0) {
    // start date is in the future — the first window is upcoming
    return { index: 0, start: startDate, end: addDays(startDate, BILLING_WINDOW_DAYS - 1) };
  }
  const index = Math.floor(diff / BILLING_WINDOW_DAYS);
  const start = addDays(startDate, index * BILLING_WINDOW_DAYS);
  return { index, start, end: addDays(start, BILLING_WINDOW_DAYS - 1) };
}

// ---- the whole run of 30-day cycles, laid out ----------------------
// A client is authorised in three consecutive stretches -- an initial 30 days,
// a 150-day period, then a 180-day extension -- and a touchpoint quota falls
// due in every 30 days of all three, the initial period included. The cycles
// themselves roll every 30 days from the service start and take no notice of
// where one authorisation ends and the next begins, so the two are worked out
// separately here: the cycles from the start date, the colour from whichever
// authorisation covers the day a cycle opens.
//
// A cycle belonging to no authorisation is not an error to hide. It is a gap
// somebody has to fill, and the only place it becomes visible is a list like
// this one.

export type AuthPhase = 'initial_30' | 'period_150' | 'extension_180';

export type { AuthSpan };

export const AUTH_PHASE_LABEL: Record<AuthPhase, string> = {
  initial_30: 'Initial 30 days',
  period_150: '150-day authorization',
  extension_180: '180-day extension',
};

/** One colour per authorization, shared by every screen that shows them. */
export const AUTH_PHASE_DOT: Record<AuthPhase, string> = {
  initial_30: 'bg-blue-500',
  period_150: 'bg-green-600',
  extension_180: 'bg-purple-500',
};

/** The pale fill for a block of colour a person reads at a glance, not a dot. */
export const AUTH_PHASE_TINT: Record<AuthPhase, string> = {
  initial_30: 'bg-blue-100 text-blue-900',
  period_150: 'bg-green-100 text-green-900',
  extension_180: 'bg-purple-100 text-purple-900',
};

export const AUTH_PHASE_CLASS: Record<AuthPhase, string> = {
  initial_30: 'border-blue-300 bg-blue-50 text-blue-900',
  period_150: 'border-green-300 bg-green-50 text-green-900',
  extension_180: 'border-purple-300 bg-purple-50 text-purple-900',
};

export interface AuthorizationCycle {
  /** 1-based, as staff count them. */
  number: number;
  start: string;
  end: string;
  /** Null when no authorization covers the day this cycle opens. */
  phase: AuthPhase | null;
  isCurrent: boolean;
  isPast: boolean;
}

export interface AuthorizationSpans {
  auth_30_start?: string | null;
  auth_30_end?: string | null;
  auth_150_start?: string | null;
  auth_150_end?: string | null;
  auth_180_start?: string | null;
  auth_180_end?: string | null;
  hsp_150_date?: string | null;
}

/** Nobody is authorised for four years. A runaway date should not render 1,000 rows. */
const MAX_CYCLES = 24;

const spanEnd = (start: string | null | undefined, end: string | null | undefined, len: number) =>
  end ?? (start ? addDays(start, len - 1) : null);

/**
 * The authorization periods a client actually holds, from the record of them.
 *
 * The three legacy columns on `clients` hold one initial, one continuation and
 * one reauthorization, and that is all they can hold. A client on their second
 * or third reauthorization has periods those columns cannot represent, so
 * building the cycle list from them left the real months in between looking
 * unauthorized. `client_authorizations` is the history; this reads that.
 *
 * Denied and cancelled periods authorize nothing, so they are left out.
 * Superseded ones are kept: a period that was later replaced still covered the
 * days it ran for, and dropping it would punch a hole in the past.
 */
export function spansFromAuthorizations(
  rows: {
    authorization_type: string;
    start_date: string | null;
    end_date: string | null;
    status: string;
  }[],
): AuthSpan[] {
  const PHASE_OF: Record<string, AuthPhase> = {
    initial_30: 'initial_30',
    continuation_150: 'period_150',
    reauthorization_180: 'extension_180',
  };
  const LENGTH_OF: Record<string, number> = {
    initial_30: 30,
    continuation_150: 150,
    reauthorization_180: 180,
  };

  return rows
    .filter((r) => r.status !== 'denied' && r.status !== 'cancelled')
    .flatMap((r) => {
      const phase = PHASE_OF[r.authorization_type];
      if (!phase || !r.start_date) return [];
      const end = r.end_date ?? addDays(r.start_date, (LENGTH_OF[r.authorization_type] ?? 30) - 1);
      if (daysBetween(r.start_date, end) < 0) return []; // an end before its start covers nothing
      return [{ phase, start: r.start_date, end }];
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

interface AuthSpan {
  phase: AuthPhase;
  start: string;
  end: string;
}

/** The three authorization periods a client actually has, in order. */
export function authorizationSpans(c: AuthorizationSpans): AuthSpan[] {
  const spans: AuthSpan[] = [];
  const push = (phase: AuthPhase, start: string | null | undefined, end: string | null, len: number) => {
    const e = spanEnd(start, end, len);
    if (start && e) spans.push({ phase, start, end: e });
  };
  push('initial_30', c.auth_30_start, c.auth_30_end ?? null, 30);
  push('period_150', c.auth_150_start, c.auth_150_end ?? null, 150);
  // The extension usually follows the 150-day period without being given its
  // own start date, which is how the database derives it too.
  const ext180Start =
    c.auth_180_start || (c.auth_150_start ? addDays(c.auth_150_start, 150) : null);
  push('extension_180', ext180Start, c.auth_180_end ?? null, 180);
  return spans;
}

/** Which authorization covers a given day, if any. */
export function authPhaseOn(c: AuthorizationSpans | null | undefined, day: string): AuthPhase | null {
  if (!c) return null;
  return (
    authorizationSpans(c).find(
      (s) => daysBetween(s.start, day) >= 0 && daysBetween(day, s.end) >= 0,
    )?.phase ?? null
  );
}

/**
 * Every 30-day cycle from the service start to the end of the last
 * authorization, with the authorization each one falls in.
 */
export function authorizationCycles(
  c: AuthorizationSpans,
  today: string,
  /** The recorded authorizations, when there are any. They beat the columns. */
  recorded?: AuthSpan[],
): AuthorizationCycle[] {
  const spans = recorded && recorded.length > 0 ? recorded : authorizationSpans(c);
  if (spans.length === 0) return [];

  // Cycles are anchored to the day services started, which is the first
  // authorization if the legacy columns have nothing to say.
  const serviceStart =
    c.auth_30_start || c.auth_150_start || c.hsp_150_date || spans[0].start;
  if (!serviceStart) return [];

  const lastEnd = spans.reduce((acc, s) => (daysBetween(acc, s.end) > 0 ? s.end : acc), spans[0].end);

  /**
   * The authorization a whole cycle belongs to: the one covering most of its
   * days, not the one covering its first.
   *
   * Cycles run on their own 30-day beat from the service start and pay no
   * attention to when an authorization was approved, so a cycle routinely
   * straddles the join between two. Reading only day one called such a cycle
   * unauthorized whenever the next period had not quite begun -- a cycle 16 of
   * whose 30 days were funded showed as a red flag sitting between two healthy
   * ones, which is the "random unauthorized date in the middle" nobody could
   * account for.
   *
   * Null is now reserved for a cycle no authorization touches at all, which is
   * the only kind worth alarming anyone about.
   */
  const phaseForCycle = (start: string, end: string): AuthPhase | null => {
    let best: AuthPhase | null = null;
    let bestDays = 0;
    for (const s of spans) {
      const from = daysBetween(start, s.start) > 0 ? s.start : start;
      const to = daysBetween(s.end, end) > 0 ? s.end : end;
      const days = daysBetween(from, to) + 1;
      if (days > bestDays) {
        bestDays = days;
        best = s.phase;
      }
    }
    return bestDays > 0 ? best : null;
  };

  const cycles: AuthorizationCycle[] = [];
  let start = serviceStart;
  for (let i = 0; i < MAX_CYCLES && daysBetween(start, lastEnd) >= 0; i++) {
    const end = addDays(start, BILLING_WINDOW_DAYS - 1);
    cycles.push({
      number: i + 1,
      start,
      end,
      phase: phaseForCycle(start, end),
      isCurrent: daysBetween(start, today) >= 0 && daysBetween(today, end) >= 0,
      isPast: daysBetween(end, today) > 0,
    });
    start = addDays(end, 1);
  }
  return cycles;
}

// Contacts that fall inside a given window (inclusive of both ends).
export function contactsInWindow(contacts: ContactRow[], w: BillingWindow): ContactRow[] {
  return contacts.filter(
    (c) => daysBetween(w.start, c.contact_date) >= 0 && daysBetween(c.contact_date, w.end) >= 0,
  );
}

export type WindowStatus = 'on_track' | 'overdue' | 'complete' | 'missing_setup';

export interface WindowProgress {
  contactDays: number;
  inPersonSpaced: number;
  requiredContacts: number;
  requiredInPerson: number;
  remaining: number;
  remainingInPerson: number;
  isComplete: boolean;
}

export function windowProgress(req: Requirements, contacts: ContactRow[]): WindowProgress {
  const contactDays = distinctDays(contacts).length;
  const inPersonSpaced = spacedInPersonDates(contacts).length;
  const remaining = Math.max(0, req.requiredContacts - contactDays);
  const remainingInPerson = Math.max(0, req.requiredInPerson - inPersonSpaced);
  const isComplete = contactDays >= req.requiredContacts && inPersonSpaced >= req.requiredInPerson;
  return {
    contactDays,
    inPersonSpaced,
    requiredContacts: req.requiredContacts,
    requiredInPerson: req.requiredInPerson,
    remaining,
    remainingInPerson,
    isComplete,
  };
}

// Plain-English reasons the current cycle is overdue.
export function overdueReasons(
  req: Requirements,
  window: BillingWindow,
  windowContacts: ContactRow[],
  today: string,
): string[] {
  const prog = windowProgress(req, windowContacts);
  const reasons: string[] = [];
  if (prog.isComplete) return reasons;

  const windowEnded = daysBetween(window.end, today) > 0;
  const daysLeft = daysBetween(today, window.end); // >=0 while inside window

  if (windowEnded) {
    reasons.push(
      `${prog.contactDays} of ${req.requiredContacts} touchpoints logged in the closed 30-day window`,
    );
    return reasons;
  }

  if (prog.contactDays === 0 && daysBetween(window.start, today) >= BILLING_WINDOW_DAYS - 1) {
    reasons.push('No touchpoints logged since authorization start');
  }

  // not enough days left to fit remaining separate-day touchpoints
  if (prog.remaining > daysLeft + 1) {
    reasons.push('Not enough days left in billing window');
  }

  // required in-person touchpoint can no longer be completed
  if (prog.remainingInPerson > 0) {
    const need = (prog.remainingInPerson - 1) * MIN_SPACING_DAYS;
    if (need > daysLeft) reasons.push('Required in-person touchpoint can no longer be completed');
  }

  if (prog.contactDays < req.requiredContacts && daysLeft <= 5) {
    reasons.push(`${prog.contactDays} of ${req.requiredContacts} touchpoints logged in current 30-day window`);
  }

  return reasons;
}

export function windowStatus(
  req: Requirements,
  window: BillingWindow,
  windowContacts: ContactRow[],
  today: string,
): WindowStatus {
  const prog = windowProgress(req, windowContacts);
  if (prog.isComplete) return 'complete';
  return overdueReasons(req, window, windowContacts, today).length > 0 ? 'overdue' : 'on_track';
}

// ---- "start today" go-live floor ------------------------------------
// Touchpoint cycles are anchored to the client's HSP approval / authorization
// start date, so a client onboarded today may be mid-cycle. Nothing that
// happened before the agency went live should push staff around: cycles that
// began before the go-live date are shown for reference and can be worked, but
// they are never overdue and never fill the work queue as urgent.

/** Did this cycle begin before the agency started using the queue? */
export function isPreGoLiveCycle(window: BillingWindow, goLive: string | null): boolean {
  if (!goLive) return false;
  return daysBetween(goLive, window.start) < 0;
}

/** The earliest date a new touchpoint may be scheduled on. */
export function schedulingFloor(today: string, goLive: string | null): string {
  if (!goLive) return today;
  return daysBetween(goLive, today) > 0 ? today : goLive;
}

/** Status shown on a cycle in the staff work queue. */
export type CycleStatus = 'completed' | 'overdue' | 'due_soon' | 'incomplete';

export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  completed: 'Completed',
  overdue: 'Overdue',
  due_soon: 'Due soon',
  incomplete: 'Incomplete',
};

export const DUE_SOON_DAYS = 7;

export function cycleStatus(
  req: Requirements,
  window: BillingWindow,
  windowContacts: ContactRow[],
  today: string,
  goLive: string | null,
): CycleStatus {
  const prog = windowProgress(req, windowContacts);
  if (prog.isComplete) return 'completed';

  // A cycle that began before go-live is reference only, and that has to mean
  // *never urgent* — not just never overdue. Guarding only the overdue branch
  // still let a cycle ending within the week read "Due soon" and raise a
  // supervisor reminder, on the same row that says "not counted against you".
  // Staff were being chased for touchpoints they had no chance to make.
  //
  // It stays visible as Incomplete, so anyone who wants to backfill still can.
  if (isPreGoLiveCycle(window, goLive)) return 'incomplete';

  if (overdueReasons(req, window, windowContacts, today).length > 0) return 'overdue';
  const daysLeft = daysBetween(today, window.end);
  if (daysLeft >= 0 && daysLeft <= DUE_SOON_DAYS) return 'due_soon';
  return 'incomplete';
}

export const CYCLE_STATUS_CLASS: Record<CycleStatus, string> = {
  completed: 'bg-green-600 text-white hover:bg-green-600',
  overdue: 'bg-red-600 text-white hover:bg-red-600',
  due_soon: 'bg-amber-500 text-white hover:bg-amber-500',
  incomplete: 'bg-muted text-muted-foreground hover:bg-muted',
};

// ---- rule-based suggested touchpoint type ---------------------------
// Uses only structured data — never invents facts.
export function suggestTouchpointType(
  req: Requirements,
  windowContacts: ContactRow[],
): string {
  const prog = windowProgress(req, windowContacts);
  if (prog.contactDays === 0) return 'Initial check-in for this 30-day cycle';
  if (prog.remainingInPerson > 0) return 'In-person visit';
  return 'Phone, text, email, or video follow-up';
}

// ---- Touchpoint classification -------------------------------------
// Contact method answers "how did the contact happen?" (kept separate from type).
// The core scheduling/counting logic still uses the Modality type above;
// these are the selectable options in the Add touchpoint modal.
export interface ContactMethodOption { value: string; label: string; inPerson: boolean }
export const CONTACT_METHOD_OPTIONS: ContactMethodOption[] = [
  { value: 'in_person', label: 'In person', inPerson: true },
  { value: 'phone', label: 'Phone', inPerson: false },
  { value: 'text', label: 'Text', inPerson: false },
  { value: 'email', label: 'Email', inPerson: false },
  { value: 'virtual', label: 'Video', inPerson: false },
  { value: 'other', label: 'Other', inPerson: false },
];

/** Legacy alias — the same list under its old name. */
export const MODALITY_OPTIONS = CONTACT_METHOD_OPTIONS;

export function contactMethodLabel(value: string | null | undefined): string {
  if (!value) return '';
  return CONTACT_METHOD_OPTIONS.find((m) => m.value === value)?.label ?? value;
}

/** Only an in-person contact satisfies the in-person requirement. */
export function isInPersonMethod(value: string | null | undefined): boolean {
  return CONTACT_METHOD_OPTIONS.find((m) => m.value === value)?.inPerson ?? false;
}

// Touchpoint type answers "what kind of case-management work happened?"
// This is the staff-facing list. HSP work is deliberately absent — that
// belongs to the Admin and Superadmin workflows, not the staff queue.
export interface TouchpointTypeOption { value: string; label: string }
export const TOUCHPOINT_TYPES: TouchpointTypeOption[] = [
  { value: 'general_checkin', label: 'General check-in' },
  { value: 'landlord_tenant', label: 'Landlord coordination' },
  { value: 'housing_application', label: 'Housing application' },
  { value: 'voucher_support', label: 'Voucher support' },
  { value: 'recertification', label: 'Recertification' },
  { value: 'benefits_income', label: 'Benefits or income support' },
  { value: 'basic_needs', label: 'Basic needs' },
  { value: 'care_coordination', label: 'Care coordination' },
  { value: 'legal_aid', label: 'Legal aid' },
  { value: 'supportive_housing', label: 'Supportive housing' },
  { value: 'reassessment', label: 'Reassessment' },
  { value: 'crisis_followup', label: 'Crisis follow-up' },
  { value: 'other', label: 'Other' },
];

// Values written before the list above was adopted. Kept for display only —
// they are never offered as choices, so nothing new lands here.
const RETIRED_TOUCHPOINT_TYPE_LABELS: Record<string, string> = {
  housing_search: 'Housing application',
  hsp_goal: 'Housing Stabilization Plan goal follow-up',
  lease_issue: 'Landlord coordination',
  eviction_prevention: 'Landlord coordination',
  voucher_application: 'Voucher support',
  voucher_recert: 'Recertification',
  benefits_docs: 'Benefits or income support',
  resource_linkage: 'Basic needs',
  bh_medical: 'Care coordination',
};

export function touchpointTypeLabel(value: string | null | undefined): string {
  if (!value) return '';
  return (
    TOUCHPOINT_TYPES.find((t) => t.value === value)?.label ??
    RETIRED_TOUCHPOINT_TYPE_LABELS[value] ??
    value
  );
}

// Suggest a touchpoint type from structured client fields + whether any
// contact has been logged in the current cycle. Never invents facts.
export function suggestTouchpointTypeFromClient(client: {
  level_of_need?: string | null;
  housing_status?: string | null;
  voucher_status?: string | null;
}, hasContactThisWindow: boolean): string {
  const hs = (client.housing_status ?? '').toLowerCase();
  const vs = (client.voucher_status ?? '').toLowerCase();
  if (!hasContactThisWindow) return 'general_checkin';
  if (hs.includes('search')) return 'housing_application';
  if (vs.includes('active') || vs.includes('pending')) return 'voucher_support';
  if (client.level_of_need === 'High Level') return 'reassessment';
  return 'general_checkin';
}

// The order auto-generated touchpoints cycle through, so a client is never
// handed the same suggested type twice inside one 30-day cycle.
export const AUTO_TOUCHPOINT_TYPE_ROTATION = [
  'general_checkin',
  'care_coordination',
  'landlord_tenant',
  'basic_needs',
] as const;

// ---- NJHMIS progress note entry -------------------------------------
// Field values copied from the NJHMIS progress note screen. Saving a
// touchpoint stages a record in these terms; nothing is sent to NJHMIS.
export const NJHMIS_SERVICE_TYPES: string[] = [
  'Other Service Type',
  'Home Modifications & Remediation',
  'Move-In Supports',
  'Pre-tenancy services - higher level of need',
  'Pre-tenancy services - lower level of need',
  'Tenancy sustaining services - higher level of need',
  'Tenancy sustaining services - lower level of need',
];

export const NJHMIS_LOCATIONS: string[] = [
  'This Program Site',
  'Consumer Residence',
  'Consumer Workplace',
  'Other Program Site',
  'Other Service Provider',
  'Hospital',
  'Jail',
  'Other Site',
  'Telehealth',
];

export const NJHMIS_NOTE_TYPES: string[] = [
  'General Chart Note',
  'Initial Assessment',
  'Criteria for Discharge',
  'Hospitalization Referral',
  'Collateral Contact',
  'Service Plan Linked',
  'Periodic Summary Note',
  'Medication Monitoring',
  "Nurse's Note",
  "Psychiatrist's Note",
  'AWOL Status',
];

export const NJHMIS_DEFAULT_NOTE_TYPE = 'General Chart Note';

/**
 * The service type NJHMIS expects for a tenancy-sustaining touchpoint at this
 * client's tier. Only a starting point — staff can change it.
 */
export function defaultNjhmisServiceType(tier: string | null | undefined): string {
  return tier === 'High Level'
    ? 'Tenancy sustaining services - higher level of need'
    : 'Tenancy sustaining services - lower level of need';
}

/** In person happens at the consumer's residence by default; everything else is telehealth. */
export function defaultNjhmisLocation(method: string | null | undefined): string {
  return isInPersonMethod(method) ? 'Consumer Residence' : 'Telehealth';
}
