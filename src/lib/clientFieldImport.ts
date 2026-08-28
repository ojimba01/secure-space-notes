// Fill the client record from what the agency's documents say.
//
// The manifest workbook carries a `CLIENT FIELDS from docs` tab: one row per
// client folder, holding the values the agency extracted from that client's
// own paperwork. This reads it, works out what would change, and — only when
// asked — writes it.
//
// Two rules, and they are different on purpose:
//
//   FILL    Date of birth, Medicaid ID, MCO member ID, diagnosis, address.
//           Written only where the record has nothing. A document does not get
//           to overrule somebody who typed a value in.
//
//   OVERRIDE  The client's name, and the authorization dates that billing is
//           counted from. Misky's decision, 2026-08-28: a name in the app is
//           as likely as not a misspelling of the name on the paperwork, and
//           the documents are the better authority on the dates. What is
//           displaced is kept in `field_sources`, so an override is never a
//           silent loss.
//
// Every value written records where it came from, so the record can show which
// of its facts were read out of a document rather than entered by a person.
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

/** The tab holding one row per client folder. */
const CLIENT_SHEET_NAMES = ['client fields from docs', 'client fields', 'clients from docs'];

export interface ClientFieldRow {
  clientFolder: string;
  clientName: string | null;
  mco: string | null;
  dob: string | null;
  medicaidId: string | null;
  mcoMemberId: string | null;
  diagnosis: string | null;
  authNumbers: string | null;
  serviceStart: string | null;
  serviceEnd: string | null;
  memberAddress: string | null;
  needsReview: string | null;
}

/** One field the import would write, and what it would displace. */
export interface FieldChange {
  column: string;
  label: string;
  from: string | null;
  to: string;
  kind: 'fill' | 'override';
}

/** A value the documents hold that disagrees with what the record already has. */
export interface FieldDisagreement {
  label: string;
  record: string;
  document: string;
}

export interface ClientPlan {
  clientId: string | null;
  /** How the row was tied to a client, for the reviewer to judge. */
  matchedBy: 'medicaid_id' | 'member_id' | 'name' | null;
  documentName: string | null;
  recordName: string | null;
  changes: FieldChange[];
  /**
   * Where the documents say something different from what is already on the
   * record. Nothing is written for these — a document does not overrule a
   * person — but they are counted, because silently discarding a
   * disagreement is how a wrong value survives forever.
   */
  disagreements: FieldDisagreement[];
}

export interface ImportPlan {
  matched: ClientPlan[];
  /** Rows with no client in the app. Reported, never used to create one. */
  unmatched: ClientPlan[];
  sheetName: string;
  totalRows: number;
}

const text = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s && s.toLowerCase() !== 'none' ? s : null;
};

/** Identifiers compare as digits: the same ID is written a dozen ways. */
const idKey = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Names compare without case, punctuation, or word order. */
const nameKey = (v: string | null | undefined) =>
  (v ?? '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1)
    .sort()
    .join(' ');

/** `MM/DD/YYYY` and the other shapes the archive uses, to ISO, or null. */
export function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const us = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (us) {
    const y = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    const d = new Date(Date.UTC(y, Number(us[1]) - 1, Number(us[2])));
    if (d.getUTCFullYear() !== y || d.getUTCMonth() !== Number(us[1]) - 1) return null;
    return d.toISOString().slice(0, 10);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

/** Read the client tab out of the agency's workbook. */
export async function parseClientFields(
  file: File,
): Promise<{ rows: ClientFieldRow[]; sheetName: string }> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheetName = wb.SheetNames.find((n) =>
    CLIENT_SHEET_NAMES.includes(n.trim().toLowerCase()),
  );
  if (!sheetName) return { rows: [], sheetName: '' };

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: '',
  });
  const rows = raw.map((r) => {
    const g = (k: string) => text(r[k]);
    return {
      clientFolder: g('client_folder') ?? '',
      clientName: g('client_name'),
      mco: g('mco'),
      dob: g('dob'),
      medicaidId: g('medicaid_id'),
      mcoMemberId: g('mco_member_id'),
      diagnosis: g('diagnosis'),
      authNumbers: g('auth_numbers_found'),
      serviceStart: g('earliest_service_start'),
      serviceEnd: g('latest_service_end'),
      memberAddress: g('member_address'),
      needsReview: g('needs_review'),
    } satisfies ClientFieldRow;
  });
  return { rows: rows.filter((r) => r.clientFolder || r.clientName), sheetName };
}

interface ExistingClient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  date_of_birth: string | null;
  medicaid_id: string | null;
  member_id: string | null;
  diagnosis_code: string | null;
  address: string | null;
  auth_30_start: string | null;
  auth_150_start: string | null;
}

/** Split "FIRST LAST" or "LAST, FIRST" into the app's two columns. */
export function splitName(full: string): { first: string; last: string } | null {
  const s = full.replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.includes(',')) {
    const [last, first] = s.split(',', 2).map((x) => x.trim());
    if (last && first) return { first, last };
  }
  const parts = s.split(' ');
  if (parts.length < 2) return null;
  // Middle names stay with the first name; the app has two columns, not three.
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

/**
 * Work out what importing these rows would change, without changing anything.
 *
 * Matching runs Medicaid ID, then MCO member ID, then name — in that order and
 * for a reason. Names are the thing being corrected, so matching on a name
 * first would mean the misspelled records never match and arrive as duplicate
 * clients instead of corrections.
 */
export async function planClientFieldImport(rows: ClientFieldRow[]): Promise<ImportPlan> {
  const { data } = await supabase
    .from('clients')
    .select(
      'id, first_name, last_name, date_of_birth, medicaid_id, member_id, diagnosis_code, address, auth_30_start, auth_150_start',
    );
  const clients = (data ?? []) as ExistingClient[];

  const byMedicaid = new Map<string, ExistingClient>();
  const byMember = new Map<string, ExistingClient>();
  const byName = new Map<string, ExistingClient>();
  for (const c of clients) {
    if (idKey(c.medicaid_id)) byMedicaid.set(idKey(c.medicaid_id), c);
    if (idKey(c.member_id)) byMember.set(idKey(c.member_id), c);
    const n = nameKey(`${c.first_name ?? ''} ${c.last_name ?? ''}`);
    if (n) byName.set(n, c);
  }

  const matched: ClientPlan[] = [];
  const unmatched: ClientPlan[] = [];

  for (const row of rows) {
    let client: ExistingClient | undefined;
    let matchedBy: ClientPlan['matchedBy'] = null;

    if (idKey(row.medicaidId)) {
      client = byMedicaid.get(idKey(row.medicaidId));
      if (client) matchedBy = 'medicaid_id';
    }
    if (!client && idKey(row.mcoMemberId)) {
      client = byMember.get(idKey(row.mcoMemberId));
      if (client) matchedBy = 'member_id';
    }
    if (!client && row.clientName) {
      client = byName.get(nameKey(row.clientName));
      if (client) matchedBy = 'name';
    }

    const recordName = client
      ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
      : null;

    if (!client) {
      unmatched.push({
        clientId: null,
        matchedBy: null,
        documentName: row.clientName,
        recordName: null,
        changes: [],
        disagreements: [],
      });
      continue;
    }

    const changes: FieldChange[] = [];
    const disagreements: FieldDisagreement[] = [];
    const fill = (
      column: string,
      label: string,
      value: string | null,
      current: string | null,
      same: (a: string, b: string) => boolean = (a, b) => a === b,
    ) => {
      if (!value) return;
      if (current === null || current === undefined || String(current).trim() === '') {
        changes.push({ column, label, from: null, to: value, kind: 'fill' });
      } else if (!same(value, String(current))) {
        disagreements.push({ label, record: String(current), document: value });
      }
    };
    const sameId = (a: string, b: string) => a.replace(/\D/g, '') === b.replace(/\D/g, '');

    fill('date_of_birth', 'Date of birth', toIsoDate(row.dob), client.date_of_birth);
    fill('medicaid_id', 'Medicaid ID', row.medicaidId, client.medicaid_id, sameId);
    fill('member_id', 'MCO member ID', row.mcoMemberId, client.member_id, sameId);
    fill('diagnosis_code', 'Diagnosis code', row.diagnosis, client.diagnosis_code);
    // Addresses are written a dozen ways and rarely worth flagging as a
    // disagreement, so only an empty one is filled.
    if (row.memberAddress && !String(client.address ?? '').trim()) {
      changes.push({ column: 'address', label: 'Address', from: null, to: row.memberAddress, kind: 'fill' });
    }

    // Override: the name on the paperwork wins, but only when it is genuinely
    // a different spelling rather than the same name written another way.
    if (row.clientName) {
      const split = splitName(row.clientName);
      const sameName = nameKey(row.clientName) === nameKey(recordName);
      if (split && !sameName) {
        changes.push({
          column: 'first_name',
          label: 'First name',
          from: client.first_name,
          to: split.first,
          kind: 'override',
        });
        changes.push({
          column: 'last_name',
          label: 'Last name',
          from: client.last_name,
          to: split.last,
          kind: 'override',
        });
      }
    }

    matched.push({
      clientId: client.id,
      matchedBy,
      documentName: row.clientName,
      recordName,
      changes,
      disagreements,
    });
  }

  return { matched, unmatched, sheetName: '', totalRows: rows.length };
}

export interface ApplyResult {
  clientsChanged: number;
  fieldsFilled: number;
  fieldsOverridden: number;
  failed: { clientId: string; error: string }[];
}

/**
 * Write the plan.
 *
 * Every value carries its provenance into `clients.field_sources`, so the
 * record can show which of its facts were read out of a document. An override
 * additionally records what it displaced, because a name corrected from
 * paperwork is still a name somebody typed, and losing it silently would make
 * a wrong correction impossible to notice afterwards.
 *
 * Authorization dates are deliberately not written here. Changing one rebuilds
 * every billing cycle and touchpoint derived from it, which is a different
 * operation with different safeguards — see the billing import.
 */
export async function applyClientFieldImport(
  plans: ClientPlan[],
  batchLabel: string,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    clientsChanged: 0,
    fieldsFilled: 0,
    fieldsOverridden: 0,
    failed: [],
  };
  const at = new Date().toISOString();

  for (const plan of plans) {
    if (!plan.clientId || plan.changes.length === 0) continue;

    const { data: current } = await supabase
      .from('clients')
      .select('field_sources')
      .eq('id', plan.clientId)
      .maybeSingle();

    const sources: Record<string, unknown> =
      (current?.field_sources as Record<string, unknown> | null) ?? {};
    const patch: Record<string, string> = {};

    for (const change of plan.changes) {
      patch[change.column] = change.to;
      sources[change.column] = {
        from: 'document',
        at,
        source: batchLabel,
        ...(change.kind === 'override' ? { overwrote: change.from } : {}),
      };
      if (change.kind === 'fill') result.fieldsFilled += 1;
      else result.fieldsOverridden += 1;
    }

    const { error } = await supabase
      .from('clients')
      .update({ ...patch, field_sources: sources as Json })
      .eq('id', plan.clientId);

    if (error) {
      result.failed.push({ clientId: plan.clientId, error: error.message });
      result.fieldsFilled -= plan.changes.filter((c) => c.kind === 'fill').length;
      result.fieldsOverridden -= plan.changes.filter((c) => c.kind === 'override').length;
      continue;
    }
    result.clientsChanged += 1;
  }

  return result;
}
