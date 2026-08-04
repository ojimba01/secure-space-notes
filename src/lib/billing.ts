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
  // Superseded cycles stay in the record for history but are not live deadlines.
  is_active?: boolean;
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

// Accept legacy/short labels ("Low", "High") as well as "Low Level" / "High Level".
export function rateForLevel(level: string | null | undefined): number | null {
  if (!level) return null;
  const l = level.trim().toLowerCase();
  if (l.startsWith('low')) return RATE_LOW;
  if (l.startsWith('high')) return RATE_HIGH;
  return null;
}

export interface GeneratedCycle {
  cycle_number: number;
  phase: string;
  cycle_start: string;
  cycle_end: string;
  billed_amount: number | null;
}

// The canonical billing anchor = the HSP approval start date.
// Stored in auth_150_start; legacy records may only carry hsp_150_date.
export function billingAnchor(client: {
  auth_150_start?: string | null;
  hsp_150_date?: string | null;
}): string | null {
  return client.auth_150_start || client.hsp_150_date || null;
}

// End of the 150-day authorization run: start + 149 days.
export function derivedAuth150End(anchor: string | null | undefined): string | null {
  return anchor ? addDays(anchor, 149) : null;
}

// Preview of the cycles the database engine will create for a client.
// The database is the source of truth (public.sync_client_billing_cycles);
// this mirrors it exactly so previews match what gets saved.
// Anchor = HSP approval start date (auth_150_start, falling back to hsp_150_date).
// 5 cycles for a 150-day run, 11 once the 180-day extension is approved.
export function generateCyclesForClient(client: {
  auth_150_start?: string | null;
  auth_150_end?: string | null;
  auth_180_start?: string | null;
  auth_180_end?: string | null;
  auth_180_approved?: boolean | null;
  hsp_150_date?: string | null;
  level_of_need?: string | null;
}): GeneratedCycle[] {
  const start = billingAnchor(client);
  if (!start) return [];
  const amount = rateForLevel(client.level_of_need);
  const extended = !!client.auth_180_approved;
  const lastCycle = extended ? CYCLES_180 : CYCLES_150;

  const cycles: GeneratedCycle[] = [];
  for (let n = 1; n <= lastCycle; n++) {
    const cycleStart = addDays(start, CYCLE_LENGTH_DAYS * (n - 1));
    const cycleEnd = addDays(cycleStart, CYCLE_LENGTH_DAYS - 1);
    const phase = n <= CYCLES_150 ? '150-Day' : '180-Day';
    cycles.push({ cycle_number: n, phase, cycle_start: cycleStart, cycle_end: cycleEnd, billed_amount: amount });
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
  hsp_150_date?: string | null;
  level_of_need?: string | null;
  status?: string | null;
  closed_date?: string | null;
}

// The active authorization run: from the HSP approval start date to the last known end.
export function getBillingRun(client: ClientBillingFields): BillingRun {
  const start = billingAnchor(client);
  const auth150End = client.auth_150_end || derivedAuth150End(start);
  return {
    start,
    end: client.auth_180_end || auth150End || null,
    auth150End,
    auth180End: client.auth_180_end ?? null,
  };
}

// HSP counts as submitted once the status says so, OR once an approval start date
// exists (an approval start date can only come from an approved HSP).
export function isHspSubmitted(
  client: { approval_status?: string | null; auth_150_start?: string | null; hsp_150_date?: string | null },
): boolean {
  const s = (client.approval_status ?? '').trim().toLowerCase();
  if (s === 'submitted' || s === 'approved') return true;
  return !!billingAnchor(client);
}

// Setup complete = HSP submitted + HSP approval start date + level of need.
// This is the gate for generating billing cycles and staff visibility.
export function isSetupComplete(
  client: ClientBillingFields & { approval_status?: string | null },
): boolean {
  if (!billingAnchor(client)) return false;
  if (!isHspSubmitted(client)) return false;
  if (rateForLevel(client.level_of_need) == null) return false;
  return true;
}

// True when a client lacks the data needed to generate billing cycles.
export function isMissingBillingSetup(
  client: ClientBillingFields & { approval_status?: string | null },
): boolean {
  return !isSetupComplete(client);
}

// Ordered list of what is still missing before cycles can be generated.
export function missingSetupItems(
  client: ClientBillingFields & { approval_status?: string | null },
): string[] {
  const missing: string[] = [];
  if (!isHspSubmitted(client)) missing.push('HSP submission');
  if (!billingAnchor(client)) missing.push('HSP approval start date');
  if (rateForLevel(client.level_of_need) == null) missing.push('LoN');
  return missing;
}

export function missingBillingSetupReason(
  client: ClientBillingFields & { approval_status?: string | null },
): string {
  const missing = missingSetupItems(client);
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
  client: { auth_150_start?: string | null; hsp_150_date?: string | null },
  cycles: BillingCycle[],
  today = todayAgency(),
): ClientBillingSummary {
  const cur = currentCycleNumber(billingAnchor(client), today);
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

// ---- User-facing labels ---------------------------------------------

// Internal billing_status values map to plain-language labels in the UI.
// "Submitted" is never shown as-is; it reads "Pending billing approval".
export function billingStatusLabel(status: BillingStatus | null | undefined): string {
  switch (status) {
    case 'Submitted':
      return 'Pending billing approval';
    case 'Ready to Bill':
      return 'Ready to bill';
    case 'Denied':
      return 'Denied';
    case 'Not Billed':
      return 'Not billed';
    default:
      return '—';
  }
}

// The plain-language claim status for a cycle, folding payment state in.
export function claimStatusLabel(c: BillingCycle): string {
  if (c.billing_status === 'Denied') return 'Denied';
  if (c.payment_status === 'Paid') return 'Billing approved';
  return billingStatusLabel(c.billing_status);
}

export function urgencyLabel(u: BillingUrgency): string | null {
  switch (u) {
    case 'overdue':
      return 'Overdue';
    case 'due_48':
      return 'Due within 48h';
    case 'due_week':
      return 'Due this week';
    default:
      return null;
  }
}

// Approval-stage filter values shown in the Billing Overview dropdown.
export const APPROVAL_STAGES = [
  'Pending HSP approval',
  'HSP approved',
  'Pending billing approval',
  'Billing approved',
] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

// HSP status shown in Billing Overview.
export type HspStatus = 'HSP needs submission' | 'Pending HSP approval' | 'HSP approved' | 'HSP denied';

export function hspStatusFor(
  client: { approval_status?: string | null; auth_150_start?: string | null; hsp_150_date?: string | null },
): HspStatus {
  const s = (client.approval_status ?? '').trim().toLowerCase();
  if (s === 'denied') return 'HSP denied';
  // An approval start date means the HSP came back approved.
  if (billingAnchor(client)) return 'HSP approved';
  if (s === 'approved') return 'HSP approved';
  if (s === 'submitted') return 'Pending HSP approval';
  return 'HSP needs submission';
}

// Derive a client's approval stage from HSP approval + billing progress.
export function approvalStageFor(
  client: { approval_status?: string | null; auth_150_start?: string | null; hsp_150_date?: string | null },
  cycles: BillingCycle[],
): ApprovalStage {
  const hsp = hspStatusFor(client);
  if (hsp !== 'HSP approved') return 'Pending HSP approval';
  if (cycles.some((c) => c.payment_status === 'Paid')) return 'Billing approved';
  if (cycles.some((c) => c.billing_status === 'Submitted')) return 'Pending billing approval';
  return 'HSP approved';
}

// ---- Next action ----------------------------------------------------

export interface NextAction {
  label: string;
  dueDate: string | null;
  urgency: BillingUrgency;
}

// Plain-language next action for a client row. Never a bare date.
export function nextBillingAction(
  client: ClientBillingFields & { approval_status?: string | null },
  cycles: BillingCycle[],
  today = todayAgency(),
): NextAction {
  const summary = summarizeClientBilling(client, cycles, today);

  // Setup gaps come first.
  if (!isHspSubmitted(client)) return { label: 'Submit HSP', dueDate: null, urgency: 'none' };
  if (!billingAnchor(client)) return { label: 'Add HSP approval start date', dueDate: null, urgency: 'none' };
  if (rateForLevel(client.level_of_need) == null) return { label: 'Add LoN', dueDate: null, urgency: 'none' };
  if (cycles.length === 0) return { label: 'Generate billing cycles', dueDate: null, urgency: 'none' };

  const denied = cycles.find((c) => c.billing_status === 'Denied');
  if (denied) return { label: 'Review denied claim', dueDate: denied.cycle_end, urgency: 'overdue' };

  // The earliest open (unbilled) cycle drives the action.
  const open = cycles.filter(isOpenClaim).sort((a, b) => a.cycle_number - b.cycle_number)[0];
  if (open) {
    return {
      label: `Submit Cycle ${open.cycle_number} claim`,
      dueDate: open.cycle_end,
      urgency: cycleUrgency(open, today),
    };
  }

  // Everything billed — is anything still awaiting payment confirmation?
  const awaiting = cycles
    .filter((c) => c.billing_status === 'Submitted' && c.payment_status !== 'Paid')
    .sort((a, b) => a.cycle_number - b.cycle_number)[0];
  if (awaiting) {
    return { label: 'Confirm billing approval', dueDate: awaiting.cycle_end, urgency: 'none' };
  }

  return { label: 'No action needed', dueDate: summary.dueDate, urgency: 'none' };
}

