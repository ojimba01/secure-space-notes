// The Workbook's columns: the agency's MASTER CASE TRACKER, laid over the
// client records. Each column reads from, and where it can be edited writes
// to, the client record itself, so the Workbook and the rest of the app never
// disagree. The columns the Google Sheet had hidden (and "Auth # found in
// folder" / "Source Document") are left out; LON Score is left out because it
// was taken off the client record.
import {
  addDays,
  daysToFinalDeadline,
  finalDeadlineFor,
  hasCycleEnded,
  isCycleResolved,
  MCO_OPTIONS,
  normalizeLevel,
  rateForLevel,
  RATE_LOW,
  todayAgency,
  type BillingCycle,
} from '@/lib/billing';

export type Kind = 'manual' | 'drop' | 'auto' | 'docs';
export type Group = 'info' | 'auth' | 'lon' | 'status' | 'billing';

export const GROUP_LABEL: Record<Group, string> = {
  info: 'Client details',
  auth: 'Authorizations',
  lon: 'Intake, level & diagnosis',
  status: 'Status & notes',
  billing: 'Billing',
};

export const KIND_TIP: Record<Kind, string> = {
  manual: 'Manual entry. Select a cell to type.',
  drop: 'Dropdown. Choose a value from the list.',
  auto: 'Calculated automatically. Not editable.',
  docs: 'Usually read from client documents. Verify before use.',
};

/** A client as the Workbook reads it. */
export interface WbClient {
  id: string;
  first_name: string;
  last_name: string;
  insurance: string | null;
  member_id: string | null;
  medicaid_id: string | null;
  njhmis_id: string | null;
  date_of_birth: string | null;
  phone: string | null;
  address: string | null;
  auth_30_number: string | null;
  auth_30_start: string | null;
  auth_30_end: string | null;
  auth_150_number: string | null;
  auth_150_start: string | null;
  auth_150_end: string | null;
  auth_180_number: string | null;
  auth_180_start: string | null;
  auth_180_end: string | null;
  auth_180_approved: boolean | null;
  intake_date: string | null;
  level_of_need: string | null;
  diagnosis_code: string | null;
  status: string | null;
  approval_status: string | null;
  closed_date: string | null;
  reason_closed: string | null;
  notes: string | null;
  assigned_employee_id: string | null;
}

export const WB_SELECT =
  'id, first_name, last_name, insurance, member_id, medicaid_id, njhmis_id, date_of_birth, phone, address, ' +
  'auth_30_number, auth_30_start, auth_30_end, auth_150_number, auth_150_start, auth_150_end, ' +
  'auth_180_number, auth_180_start, auth_180_end, auth_180_approved, intake_date, level_of_need, ' +
  'diagnosis_code, status, approval_status, closed_date, reason_closed, notes, assigned_employee_id';

/** What the Workbook knows about a client beyond the record itself. */
export interface Extra {
  cycles: BillingCycle[];
  /** More than one initial 30-day authorization on file. */
  secondAuth: boolean;
}

export interface Column {
  key: string;
  label: string;
  kind: Kind;
  group: Group;
  type?: 'text' | 'date';
  /** The client field an edit is written to. */
  field?: keyof WbClient;
  options?: readonly string[];
  width?: number;
  value: (c: WbClient, x: Extra) => string;
}

/** An authorization's end: as recorded, or its length from the start. */
const endOf = (start: string | null, end: string | null, days: number) =>
  end ?? (start ? addDays(start, days - 1) : null);

const field = (key: keyof WbClient, label: string, kind: Kind, group: Group, extra: Partial<Column> = {}): Column => ({
  key,
  label,
  kind,
  group,
  field: key,
  value: (c) => {
    const v = c[key];
    return v == null ? '' : String(v);
  },
  ...extra,
});

/**
 * The ID Availity knows the member by, as the Google Sheet worked it out: the
 * first letter of the first name and of the last name, then the member ID
 * without spaces, dashes or dots, all in capitals. Blank without both.
 */
export function availityMemberId(fullName: string, memberId: string | null): string {
  const name = fullName.trim();
  const id = (memberId ?? '').trim();
  if (!name || !id) return '';
  const words = name.split(/\s+/);
  const initials = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0];
  return (initials + id.replace(/[\s.-]/g, '')).toUpperCase();
}

const billed = (c: BillingCycle) => c.billing_status === 'Submitted' || c.payment_status === 'Paid';

export const COLUMNS: Column[] = [
  {
    key: 'name',
    label: 'Client Name',
    kind: 'manual',
    group: 'info',
    width: 180,
    value: (c) => `${c.first_name} ${c.last_name}`.trim(),
  },
  field('insurance', 'MCO', 'drop', 'info', { options: MCO_OPTIONS }),
  field('member_id', 'Member ID', 'manual', 'info'),
  field('medicaid_id', 'Medicaid ID', 'docs', 'info'),
  field('njhmis_id', 'HMIS ID', 'docs', 'info'),
  field('date_of_birth', 'DOB', 'docs', 'info', { type: 'date' }),
  field('phone', 'Phone #', 'manual', 'info'),
  field('address', 'Member Address', 'manual', 'info', { width: 220 }),

  field('auth_30_number', '30-Day Auth #', 'docs', 'auth'),
  field('auth_30_start', '30 Start Date', 'docs', 'auth', { type: 'date' }),
  { key: 'auth_30_end', label: '30 End Date', kind: 'auto', group: 'auth', type: 'date', value: (c) => endOf(c.auth_30_start, c.auth_30_end, 30) ?? '' },
  field('auth_150_number', '150-Day Auth #', 'docs', 'auth'),
  field('auth_150_start', '150 Start Date', 'docs', 'auth', { type: 'date' }),
  { key: 'auth_150_end', label: '150 End Date', kind: 'auto', group: 'auth', type: 'date', value: (c) => endOf(c.auth_150_start, c.auth_150_end, 150) ?? '' },
  field('auth_180_number', '180-Day Auth #', 'docs', 'auth'),
  field('auth_180_start', '180 Start Date', 'docs', 'auth', { type: 'date' }),
  { key: 'auth_180_end', label: '180 End Date', kind: 'auto', group: 'auth', type: 'date', value: (c) => endOf(c.auth_180_start, c.auth_180_end, 180) ?? '' },
  {
    key: 'availity_member_id',
    label: 'Availity Member ID',
    kind: 'auto',
    group: 'info',
    value: (c) => availityMemberId(`${c.first_name} ${c.last_name}`, c.member_id),
  },

  field('intake_date', 'Intake Date', 'manual', 'lon', { type: 'date' }),
  field('level_of_need', 'LON Level', 'drop', 'lon', { options: ['Low Level', 'High Level'] }),
  field('diagnosis_code', 'Diagnosis Code', 'docs', 'lon'),

  {
    key: 'case_status',
    label: 'Current Case Status',
    kind: 'auto',
    group: 'status',
    value: (c) => (c.status === 'closed' ? 'Closed' : c.approval_status === 'Approved' ? 'Approved' : 'Pending Approval'),
  },
  field('approval_status', 'Approval Status', 'drop', 'status', { options: ['Not Submitted', 'Submitted', 'Approved', 'Denied'] }),
  { key: 'second', label: '2nd Authorization?', kind: 'auto', group: 'status', value: (_c, x) => (x.secondAuth ? 'Yes' : 'No') },

  {
    key: 'billing_status',
    label: 'Billing Status',
    kind: 'auto',
    group: 'billing',
    value: (_c, x) => {
      const today = todayAgency();
      const toBill = x.cycles.filter((y) => !billed(y) && !isCycleResolved(y) && hasCycleEnded(y, today) && daysToFinalDeadline(y, today) >= 0).length;
      if (toBill) return `${toBill} to bill`;
      return x.cycles.some(billed) ? 'Up to date' : 'Not billed';
    },
  },
  {
    key: 'payment_status',
    label: 'Payment Status',
    kind: 'auto',
    group: 'billing',
    value: (_c, x) => {
      const pending = x.cycles.filter((y) => billed(y) && y.payment_status !== 'Paid').length;
      if (pending) return `${pending} pending`;
      return x.cycles.some((y) => y.payment_status === 'Paid') ? 'Paid' : '';
    },
  },
  { key: 'claims', label: 'Claims Submitted', kind: 'auto', group: 'billing', value: (_c, x) => String(x.cycles.filter(billed).length) },
  {
    key: 'billed_through',
    label: 'Last Billed Through',
    kind: 'auto',
    group: 'billing',
    type: 'date',
    value: (_c, x) => x.cycles.filter(billed).map((y) => y.cycle_end).sort().at(-1) ?? '',
  },

  { key: 'closed_date', label: 'Closed Date', kind: 'auto', group: 'status', type: 'date', value: (c) => c.closed_date ?? '' },
  { key: 'reason_closed', label: 'Reason Closed', kind: 'auto', group: 'status', value: (c) => c.reason_closed ?? '' },
  field('notes', 'Notes', 'manual', 'status', { width: 240 }),
];

/** Dates read as the sheet had them: MM/DD/YYYY. */
export const shown = (col: Pick<Column, 'type'>, v: string) =>
  col.type === 'date' && /^\d{4}-\d{2}-\d{2}/.test(v) ? `${v.slice(5, 7)}/${v.slice(8, 10)}/${v.slice(0, 4)}` : v;

// ---- Billing tracker ----------------------------------------------------

export const TRACKER_COLUMNS = [
  'Client Name',
  'MCO',
  'Level',
  'Rate',
  'Oldest cycle still filable (ends)',
  'FILE BY',
  'Days left',
  'Cycles still filable',
  'Cycles past the window',
  'Claims on file',
  'Last billed through',
] as const;

export interface TrackerRow {
  client: WbClient;
  level: string;
  rate: number;
  oldestEnd: string | null;
  fileBy: string | null;
  daysLeft: number | null;
  filable: number;
  past: number;
  claims: number;
  billedThrough: string | null;
}

export function trackerRows(clients: WbClient[], cyclesByClient: Map<string, BillingCycle[]>): TrackerRow[] {
  const today = todayAgency();
  return clients
    .map((client) => {
      const cycles = cyclesByClient.get(client.id) ?? [];
      const open = cycles.filter((y) => !billed(y) && !isCycleResolved(y) && hasCycleEnded(y, today));
      const live = open.filter((y) => daysToFinalDeadline(y, today) >= 0).sort((a, b) => a.cycle_end.localeCompare(b.cycle_end));
      const first = live[0];
      const level = normalizeLevel(client.level_of_need);
      return {
        client,
        level,
        rate: rateForLevel(client.level_of_need) ?? RATE_LOW,
        oldestEnd: first?.cycle_end ?? null,
        fileBy: first ? finalDeadlineFor(first) : null,
        daysLeft: first ? daysToFinalDeadline(first, today) : null,
        filable: live.length,
        past: open.length - live.length,
        claims: cycles.filter(billed).length,
        billedThrough: cycles.filter(billed).map((y) => y.cycle_end).sort().at(-1) ?? null,
      };
    })
    .filter((r) => r.client.status === 'active' || r.filable > 0)
    .sort((a, b) => (a.daysLeft ?? 99999) - (b.daysLeft ?? 99999));
}

// ---- 2nd authorization --------------------------------------------------

/** How long after an authorization ends, with no contact, before a client counts as lapsed. */
export const LAPSE_BUFFER_DAYS = 14;

export interface LapsedRow {
  client: WbClient;
  last: string;
  lastStart: string;
  ended: string;
  daysSince: number;
  lastContact: string | null;
}

/**
 * Open cases whose most recent authorization ended more than two weeks ago
 * with no new authorization and no contact since.
 */
export function lapsedRows(clients: WbClient[], lastContact: Map<string, string>): LapsedRow[] {
  const today = todayAgency();
  const out: LapsedRow[] = [];
  for (const c of clients) {
    if (c.status !== 'active') continue;
    const periods = [
      { label: '30-day', start: c.auth_30_start, end: endOf(c.auth_30_start, c.auth_30_end, 30) },
      { label: '150-day', start: c.auth_150_start, end: endOf(c.auth_150_start, c.auth_150_end, 150) },
      { label: '180-day', start: c.auth_180_start, end: endOf(c.auth_180_start, c.auth_180_end, 180) },
    ].filter((p): p is { label: string; start: string; end: string } => !!p.start && !!p.end);
    if (!periods.length) continue;
    const latest = periods.sort((a, b) => a.end.localeCompare(b.end)).at(-1)!;
    const since = Math.round((Date.parse(today) - Date.parse(latest.end)) / 86_400_000);
    if (since <= LAPSE_BUFFER_DAYS) continue;
    const contact = lastContact.get(c.id) ?? null;
    if (contact && contact > latest.end) continue;
    out.push({ client: c, last: latest.label, lastStart: latest.start, ended: latest.end, daysSince: since, lastContact: contact });
  }
  return out.sort((a, b) => a.daysSince - b.daysSince);
}
