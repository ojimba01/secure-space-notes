// Billing & Revenue logic — 30-day billing cycles across 150-Day / 180-Day auth windows.
// All date math uses plain YYYY-MM-DD strings in the agency timezone (America/New_York).

export const AGENCY_TZ = 'America/New_York';
export const CYCLE_LENGTH_DAYS = 30;
export const MAX_CYCLES = 12;
// A standard 150-day authorization run is 5 x 30-day billing cycles.
export const CYCLES_150 = 5;

export const RATE_LOW = 320;
export const RATE_HIGH = 640;

export const MCO_OPTIONS = ['Aetna', 'Horizon', 'Wellpoint', 'United Health', 'Fidelis'] as const;

export const BILLING_STATUSES = ['Not Billed', 'Ready to Bill', 'Submitted', 'Denied'] as const;
export const PAYMENT_STATUSES = ['Unpaid', 'Partial', 'Paid'] as const;

export type BillingStatus = (typeof BILLING_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

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
    if (endOfRun && daysBetween(cycleEnd, endOfRun) >= 0) break; // covered end-of-run
  }
  return cycles;
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

// ---- Per-client billing status helpers (used by Billing Overview & Cycle Dates) ----

// A cycle is an "open claim" if it still needs to be billed (not submitted/paid/denied).
export function isOpenClaim(c: BillingCycle): boolean {
  return (
    c.billing_status !== 'Submitted' &&
    c.billing_status !== 'Denied' &&
    c.payment_status !== 'Paid'
  );
}

export type BillingUrgency = 'due_48' | 'due_week' | 'overdue' | 'none';

// Compute the urgency of a single cycle relative to today.
export function cycleUrgency(c: BillingCycle, today = todayAgency()): BillingUrgency {
  if (!isOpenClaim(c)) return 'none';
  const daysToEnd = daysBetween(today, c.cycle_end); // >0 future, <0 past
  if (daysToEnd < 0) return 'overdue';
  if (daysToEnd <= 2) return 'due_48';
  if (daysToEnd <= 7) return 'due_week';
  return 'none';
}

export interface ClientBillingSummary {
  urgency: BillingUrgency; // most severe across open cycles
  dueDate: string | null; // end date of the current/next open cycle
  hasDenied: boolean;
  hasPaid: boolean;
  claimStatus: BillingStatus | null; // current cycle billing status
  currentCycleNumber: number | null;
}

const URGENCY_RANK: Record<BillingUrgency, number> = { overdue: 3, due_48: 2, due_week: 1, none: 0 };

// Roll a client's cycles into a single summary for the overview row.
export function summarizeClientBilling(
  client: { auth_150_start?: string | null },
  cycles: BillingCycle[],
  today = todayAgency(),
): ClientBillingSummary {
  const cur = currentCycleNumber(client.auth_150_start, today);
  const currentCycle = cycles.find((c) => c.cycle_number === cur) ?? null;
  let urgency: BillingUrgency = 'none';
  let dueDate: string | null = currentCycle?.cycle_end ?? null;
  for (const c of cycles) {
    const u = cycleUrgency(c, today);
    if (URGENCY_RANK[u] > URGENCY_RANK[urgency]) {
      urgency = u;
      dueDate = c.cycle_end;
    }
  }
  return {
    urgency,
    dueDate,
    hasDenied: cycles.some((c) => c.billing_status === 'Denied'),
    hasPaid: cycles.some((c) => c.payment_status === 'Paid'),
    claimStatus: currentCycle?.billing_status ?? null,
    currentCycleNumber: cur,
  };
}

// Approval-stage filter values shown in the Billing Overview dropdown.
export const APPROVAL_STAGES = [
  'Pending HSP approval',
  'HSP approved',
  'Pending billing approval',
  'Billing approved',
] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

// Derive a client's approval stage from HSP approval + billing progress.
export function approvalStageFor(
  client: { approval_status?: string | null },
  cycles: BillingCycle[],
): ApprovalStage {
  const hspApproved = client.approval_status === 'Approved';
  if (!hspApproved) return 'Pending HSP approval';
  const anyBilled = cycles.some((c) => c.billing_status === 'Submitted' || c.payment_status === 'Paid');
  if (anyBilled) return 'Billing approved';
  const anyReady = cycles.some((c) => c.billing_status !== 'Not Billed');
  return anyReady ? 'Pending billing approval' : 'HSP approved';
}
