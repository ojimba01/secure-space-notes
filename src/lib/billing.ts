// Billing & Revenue logic — 30-day billing cycles across 150-Day / 180-Day auth windows.
// All date math uses plain YYYY-MM-DD strings in the agency timezone (America/New_York).

export const AGENCY_TZ = 'America/New_York';
export const CYCLE_LENGTH_DAYS = 30;
export const MAX_CYCLES = 12;

export const RATE_LOW = 320;
export const RATE_HIGH = 640;

export const MCO_OPTIONS = ['Aetna', 'Horizon', 'Wellpoint', 'United Health', 'Fidelis'] as const;

export const BILLING_STATUSES = ['Not Billed', 'Ready to Bill', 'Submitted', 'Denied'] as const;
export const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Cycle-level claim resolution. A cycle is finished once it is Approved or Closed.
export const APPROVAL_STATES = ['Approved', 'Closed', 'Denied (will resubmit)'] as const;
export type ApprovalState = (typeof APPROVAL_STATES)[number];

// Claims must be submitted within 6 months of the cycle end date.
export const FINAL_DEADLINE_MONTHS = 6;
// A cycle enters "needs attention" this many days before its final deadline (4 weeks).
export const DEADLINE_WARNING_DAYS = 28;

export interface BillingCycle {
  id: string;
  client_id: string;
  cycle_number: number;
  phase: string;
  cycle_start: string;
  cycle_end: string;
  billed_amount: number | null;
  paid_amount: number;
  billing_status: BillingStatus;
  payment_status: PaymentStatus;
  claim_number: string | null;
  submitted_date: string | null;
  paid_date: string | null;
  is_auto_generated: boolean;
  notes: string | null;
  approval_state?: ApprovalState | null;
  final_deadline?: string | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}


// ---- date helpers ---------------------------------------------------
export function toDate(s: string): Date {
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
export function todayAgency(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: AGENCY_TZ }).format(new Date());
}
export function monthKey(s: string): string {
  return s.slice(0, 7); // YYYY-MM
}

export function rateForLevel(level: string | null | undefined): number | null {
  if (level === 'Low Level') return RATE_LOW;
  if (level === 'High Level') return RATE_HIGH;
  return null;
}

export interface GeneratedCycle {
  cycle_number: number;
  phase: string;
  cycle_start: string;
  cycle_end: string;
  billed_amount: number | null;
}

// Generate the ideal set of 30-day cycles for a client from their auth dates.
export function generateCyclesForClient(client: {
  auth_150_start?: string | null;
  auth_150_end?: string | null;
  auth_180_start?: string | null;
  auth_180_end?: string | null;
  level_of_need?: string | null;
}): GeneratedCycle[] {
  const start = client.auth_150_start;
  if (!start) return [];
  const endOfRun = client.auth_180_end || client.auth_150_end || null;
  const amount = rateForLevel(client.level_of_need);
  const cycles: GeneratedCycle[] = [];

  for (let n = 1; n <= MAX_CYCLES; n++) {
    const cycleStart = addDays(start, CYCLE_LENGTH_DAYS * (n - 1));
    if (endOfRun && daysBetween(cycleStart, endOfRun) < 0) break; // start passed end-of-run
    const cycleEnd = addDays(cycleStart, CYCLE_LENGTH_DAYS - 1);
    const phase =
      client.auth_150_end && daysBetween(cycleStart, client.auth_150_end) >= 0
        ? '150-Day'
        : '180-Day';
    cycles.push({ cycle_number: n, phase, cycle_start: cycleStart, cycle_end: cycleEnd, billed_amount: amount });
    if (endOfRun && daysBetween(endOfRun, cycleEnd) >= 0) break; // covered end-of-run
  }
  return cycles;
}

/**
 * True when the continuation authorization starts before the initial 30-day
 * period has finished, so both cover the same days.
 *
 * Cycle 1 runs the full 30 days from auth_30_start. A continuation that starts
 * inside that window bills days twice; one that starts on the window's last day
 * is the usual version of the mistake, because that date is what the
 * authorization letter shows as the end of the initial period. Starting on the
 * same day as the initial period is not an overlap — that is one continuous run
 * whose first 30 days are the initial authorization.
 */
export function continuationOverlapsInitial(
  auth30Start: string | null | undefined,
  auth150Start: string | null | undefined,
): boolean {
  if (!auth30Start || !auth150Start) return false;
  const offset = daysBetween(auth30Start, auth150Start);
  return offset > 0 && offset < CYCLE_LENGTH_DAYS;
}

// The current cycle number = the one whose 30-day range contains today.
export function currentCycleNumber(auth150Start: string | null | undefined, today = todayAgency()): number | null {
  if (!auth150Start) return null;
  const diff = daysBetween(auth150Start, today);
  if (diff < 0) return 1;
  return Math.max(1, Math.floor(diff / CYCLE_LENGTH_DAYS) + 1);
}

export function nextBillDue(cycles: BillingCycle[], auth150Start: string | null | undefined): string | null {
  const cur = currentCycleNumber(auth150Start);
  if (cur == null) return null;
  const cycle = cycles.find((c) => c.cycle_number === cur) ?? cycles[cycles.length - 1];
  return cycle ? cycle.cycle_end : null;
}

export function isPastDue(cycle: BillingCycle, today = todayAgency()): boolean {
  return daysBetween(cycle.cycle_end, today) > 0 && cycle.billing_status !== 'Submitted';
}

export function isBilled(status: BillingStatus): boolean {
  return status === 'Submitted';
}

// ---- final submission deadline (6 months after the cycle ends) -------
export function addMonthsISO(s: string, months: number): string {
  const d = toDate(s);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const daysInMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, daysInMonth));
  return fmt(d);
}

// Only cycles that have already ended have a live final deadline.
export function finalDeadlineFor(cycle: Pick<BillingCycle, 'cycle_end' | 'final_deadline'>): string {
  return cycle.final_deadline ?? addMonthsISO(cycle.cycle_end, FINAL_DEADLINE_MONTHS);
}

export function hasCycleEnded(cycle: Pick<BillingCycle, 'cycle_end'>, today = todayAgency()): boolean {
  return daysBetween(cycle.cycle_end, today) > 0;
}

// Days until the final deadline; negative means the deadline has passed.
export function daysToFinalDeadline(
  cycle: Pick<BillingCycle, 'cycle_end' | 'final_deadline'>,
  today = todayAgency(),
): number {
  return daysBetween(today, finalDeadlineFor(cycle));
}

export function isCycleResolved(cycle: Pick<BillingCycle, 'approval_state'>): boolean {
  return cycle.approval_state === 'Approved' || cycle.approval_state === 'Closed';
}

// A cycle needs attention when it has ended, is not yet approved or closed,
// and its final submission deadline is four weeks or less away (or has passed).
export function isDeadlineAtRisk(
  cycle: Pick<BillingCycle, 'cycle_end' | 'final_deadline' | 'approval_state'>,
  today = todayAgency(),
): boolean {
  if (isCycleResolved(cycle)) return false;
  if (!hasCycleEnded(cycle, today)) return false;
  return daysToFinalDeadline(cycle, today) <= DEADLINE_WARNING_DAYS;
}

// True once the 6-month submission deadline for a cycle has passed.
export function isDeadlinePassed(
  cycle: Pick<BillingCycle, 'cycle_end' | 'final_deadline'>,
  today = todayAgency(),
): boolean {
  return daysToFinalDeadline(cycle, today) < 0;
}

// Still worth working: the cycle has ended, is not approved or closed, and the
// six-month filing window is still open. Only these are billable money.
export function isStillBillable(
  cycle: Pick<BillingCycle, 'cycle_end' | 'final_deadline' | 'approval_state'>,
  today = todayAgency(),
): boolean {
  if (isCycleResolved(cycle)) return false;
  if (!hasCycleEnded(cycle, today)) return false;
  return !isDeadlinePassed(cycle, today);
}

// The six-month window closed with nothing submitted: this cycle cannot be
// claimed any more. It is history, not work, and must not sit in a queue that
// asks someone to act on it.
export function isPastFilingWindow(
  cycle: Pick<BillingCycle, 'cycle_end' | 'final_deadline' | 'approval_state' | 'billing_status'>,
  today = todayAgency(),
): boolean {
  if (isCycleResolved(cycle)) return false;
  if (cycle.billing_status === 'Submitted') return false;
  return isDeadlinePassed(cycle, today);
}

export function deadlineLabel(
  cycle: Pick<BillingCycle, 'cycle_end' | 'final_deadline' | 'approval_state'>,
  today = todayAgency(),
): string {
  const days = daysToFinalDeadline(cycle, today);
  if (days < 0) return 'Past the six-month window';
  if (days === 0) return 'Deadline today';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

export function approvalBadgeClass(state: ApprovalState | null | undefined): string {
  switch (state) {
    case 'Approved':
      return 'bg-green-600 text-white hover:bg-green-600';
    case 'Closed':
      return 'bg-slate-600 text-white hover:bg-slate-600';
    case 'Denied (will resubmit)':
      return 'bg-red-600 text-white hover:bg-red-600';
    default:
      return 'bg-gray-400 text-white hover:bg-gray-400';
  }
}


// Payment & billing badge colors, consistent across the app.
export function paymentBadgeClass(status: PaymentStatus): string {
  switch (status) {
    case 'Paid':
      return 'bg-green-600 text-white hover:bg-green-600';
    case 'Partial':
      return 'bg-amber-500 text-white hover:bg-amber-500';
    default:
      return 'bg-gray-400 text-white hover:bg-gray-400';
  }
}

export function billingBadgeClass(status: BillingStatus): string {
  switch (status) {
    case 'Submitted':
      return 'bg-blue-600 text-white hover:bg-blue-600';
    case 'Ready to Bill':
      return 'bg-amber-500 text-white hover:bg-amber-500';
    case 'Denied':
      return 'bg-red-600 text-white hover:bg-red-600';
    default:
      return 'bg-gray-400 text-white hover:bg-gray-400';
  }
}

export function formatMoney(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

export interface ClientTotals {
  expected: number;
  billed: number;
  collected: number;
  outstanding: number;
}

export function totalsForCycles(cycles: BillingCycle[]): ClientTotals {
  const expected = cycles.reduce((s, c) => s + (c.billed_amount ?? 0), 0);
  const billed = cycles.filter((c) => isBilled(c.billing_status)).reduce((s, c) => s + (c.billed_amount ?? 0), 0);
  const collected = cycles.reduce((s, c) => s + (c.paid_amount ?? 0), 0);
  return { expected, billed, collected, outstanding: billed - collected };
}

// ---- Named Excel-mirroring billing helpers --------------------------
// These wrap the existing logic with clear names so components stop
// duplicating billing date math. Use these everywhere.

export type BillingPhase = 'Not started' | '150-Day' | '180-Day' | 'Completed';

export interface BillingRun {
  start: string | null; // 150-day auth start
  end: string | null; // end of active authorization run (180 end || 150 end)
  auth150End: string | null;
  auth180End: string | null;
}

export interface ClientBillingFields {
  auth_150_start?: string | null;
  auth_150_end?: string | null;
  auth_180_start?: string | null;
  auth_180_end?: string | null;
  level_of_need?: string | null;
  status?: string | null;
}

// The active authorization run: from the 150-day start to the last known end.
export function getBillingRun(client: ClientBillingFields): BillingRun {
  return {
    start: client.auth_150_start ?? null,
    end: client.auth_180_end || client.auth_150_end || null,
    auth150End: client.auth_150_end ?? null,
    auth180End: client.auth_180_end ?? null,
  };
}

// True when a client has enough setup to generate billing cycles.
export function isMissingBillingSetup(client: ClientBillingFields): boolean {
  const run = getBillingRun(client);
  if (!run.start) return true;
  if (!run.end) return true; // need a clearly-defined billing end
  if (rateForLevel(client.level_of_need) == null) return true; // billed amount depends on LoN
  return false;
}

export function missingBillingSetupReason(client: ClientBillingFields): string {
  const missing: string[] = [];
  if (!client.auth_150_start) missing.push('150-day authorization start date');
  if (!(client.auth_180_end || client.auth_150_end)) missing.push('authorization end date');
  if (rateForLevel(client.level_of_need) == null) missing.push('level of need');
  if (missing.length === 0) return '';
  return `Billing cycles cannot be generated until the ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} entered.`;
}

// Alias matching the requested helper name.
export function generateBillingCyclesForClient(client: ClientBillingFields): GeneratedCycle[] {
  return generateCyclesForClient(client);
}

// Current billing phase relative to today.
export function getCurrentBillingPhase(client: ClientBillingFields, today = todayAgency()): BillingPhase {
  const run = getBillingRun(client);
  if (!run.start) return 'Not started';
  if (daysBetween(today, run.start) > 0) return 'Not started'; // today before start
  if (run.auth150End && daysBetween(today, run.auth150End) >= 0) return '150-Day'; // today <= 150 end
  if (run.end && daysBetween(today, run.end) >= 0) return '180-Day'; // between 150 end and final end
  if (run.end && daysBetween(run.end, today) > 0) return 'Completed';
  return '150-Day';
}

// Current cycle number = ceil((today - start + 1) / 30), clamped to [1, cycleCount].
export function getCurrentBillingCycle(
  client: ClientBillingFields,
  today = todayAgency(),
  cycles?: GeneratedCycle[],
): number | null {
  const run = getBillingRun(client);
  if (!run.start) return null;
  const generated = cycles ?? generateCyclesForClient(client);
  const maxCycle = generated.length || 1;
  const diff = daysBetween(run.start, today); // today - start
  if (diff < 0) return 1;
  const n = Math.floor(diff / CYCLE_LENGTH_DAYS) + 1; // ceil((diff+1)/30) == floor(diff/30)+1
  return Math.min(Math.max(1, n), maxCycle);
}

// Next bill due = end date of the current billing cycle.
export function getNextBillDue(
  client: ClientBillingFields,
  cycles?: Array<{ cycle_number: number; cycle_end: string }>,
  today = todayAgency(),
): string | null {
  const generated = cycles ?? generateCyclesForClient(client);
  const cur = getCurrentBillingCycle(client, today, generated as GeneratedCycle[]);
  if (cur == null) return null;
  const cycle = generated.find((c) => c.cycle_number === cur) ?? generated[generated.length - 1];
  return cycle ? cycle.cycle_end : null;
}

// ---- the 30-day HSP window (not billable) ---------------------------
// Every client relationship opens with a 30-day window in which the HSP must
// be submitted. Its end date is the HSP due date. Billing only starts after
// the HSP is approved (the 150-day authorization start).
export const HSP_WINDOW_DAYS = 30;

export function hspDueDateFor(auth30Start: string | null | undefined): string | null {
  if (!auth30Start) return null;
  return addDays(auth30Start, HSP_WINDOW_DAYS - 1);
}

// ---- level of need labels -------------------------------------------
// Historic records store "Low"/"Low Level"/"High"/"High Level". The UI works
// with the short label so a saved value always shows up in the dropdown.
export function normalizeLevel(level: string | null | undefined): 'Low' | 'High' | '' {
  const t = (level ?? '').trim().toLowerCase();
  if (t.startsWith('low')) return 'Low';
  if (t.startsWith('high')) return 'High';
  return '';
}

// ---- duplicate client detection --------------------------------------
// A possible duplicate needs BOTH a near-identical name (each part within two
// letters, to allow for spelling slips) AND a matching member ID or
// authorization number. A shared name alone is never enough.
export function editDistance(a: string, b: string): number {
  const s = a.trim().toLowerCase(), t = b.trim().toLowerCase();
  const rows = Array.from({ length: s.length + 1 }, (_, i) => [i, ...new Array(t.length).fill(0)]);
  for (let j = 0; j <= t.length; j++) rows[0][j] = j;
  for (let i = 1; i <= s.length; i++)
    for (let j = 1; j <= t.length; j++)
      rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
  return rows[s.length][t.length];
}

export interface DuplicateCandidate {
  id: string;
  first_name: string;
  last_name: string;
  member_id?: string | null;
  auth_30_number?: string | null;
  auth_150_number?: string | null;
  auth_180_number?: string | null;
}

const sameCode = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function isPossibleDuplicate(a: DuplicateCandidate, b: DuplicateCandidate, tolerance = 2): boolean {
  if (a.id === b.id) return false;
  if (!a.first_name?.trim() || !a.last_name?.trim() || !b.first_name?.trim() || !b.last_name?.trim()) return false;
  const nameClose =
    editDistance(a.first_name, b.first_name) <= tolerance && editDistance(a.last_name, b.last_name) <= tolerance;
  if (!nameClose) return false;
  const codes: Array<keyof DuplicateCandidate> = ['member_id', 'auth_30_number', 'auth_150_number', 'auth_180_number'];
  const aCodes = codes.map((k) => a[k] as string | null | undefined);
  const bCodes = codes.map((k) => b[k] as string | null | undefined);
  return aCodes.some((x) => bCodes.some((y) => sameCode(x, y)));
}

export function findPossibleDuplicates<T extends DuplicateCandidate>(client: T, all: T[], tolerance = 2): T[] {
  return all.filter((other) => isPossibleDuplicate(client, other, tolerance));
}

// ---- 180-day extension watch ----------------------------------------
// Alert staff when a 150-day authorization ends soon so the 180-day
// extension can be confirmed before billing stops.
export const EXTENSION_WARNING_DAYS = 30;

export function daysUntil150End(client: { auth_150_end?: string | null }, today = todayAgency()): number | null {
  if (!client.auth_150_end) return null;
  return daysBetween(today, client.auth_150_end);
}

export function needsExtensionReview(
  client: { auth_150_end?: string | null; auth_180_approved?: boolean | null; status?: string | null },
  today = todayAgency(),
): boolean {
  if (client.auth_180_approved) return false;
  const days = daysUntil150End(client, today);
  if (days == null) return false;
  // Once the 150-day end date is more than six months (about 183 days) past,
  // the extension window has closed and the client drops off the queue.
  if (days < -183) return false;
  return days <= EXTENSION_WARNING_DAYS;
}

// The 180-day extension always starts the day after the 150-day run ends.
export function projected180Start(auth150Start: string | null | undefined): string | null {
  if (!auth150Start) return null;
  return addDays(auth150Start, 150);
}
