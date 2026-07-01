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
