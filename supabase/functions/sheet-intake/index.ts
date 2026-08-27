// Receives client rows from the MASTER tab of the Housing Case Management
// workbook, sent by a "Send to Case Notes" button in the sheet itself.
//
// One-way and insert-only, on purpose. The sheet never edits or deletes a
// client that already exists here, so nobody can overwrite work done in the
// app by fixing a typo in a spreadsheet. Rows for people already in the app
// are reported as duplicates and skipped.
//
// Member ID is the key. It is filled on every row of the workbook and matched
// 46 of 47 clients on 2026-08-27, where matching on names needed 20 spelling
// corrections first. IDs are compared with punctuation stripped, because the
// sheet writes them as "ID-2370491", "ID2370491" and "ID 2370491" alike.
//
// Inserting a client is enough to start everything else: a trigger on `clients`
// generates the billing cycles, and touchpoints are scheduled the next time
// their case manager opens their queue.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-intake-secret',
};

/** Sheet's "Approval Status" values that mean the HSP has gone to the MCO. */
const HSP_SENT = new Set(['submitted', 'approved']);

/** Sheet "Current Case Status" -> the app's workflow stage. */
const STAGE: Record<string, string> = {
  'new': 'referred',
  'pending approval': 'initial_auth_pending',
  'approved': 'active_authorization',
  'on hold': 'initial_auth_pending',
  'closed': 'closed',
};

interface SheetRow {
  rowNumber: number;
  clientName?: string;
  mco?: string;
  memberId?: string;
  phone?: string;
  dateOfBirth?: string;
  intakeDate?: string;
  assessmentDueDate?: string;
  assignedStaff?: string;
  auth30Number?: string;
  auth30Start?: string;
  auth30End?: string;
  lonScore?: string;
  lonLevel?: string;
  approvalStatus?: string;
  auth150Number?: string;
  auth150Start?: string;
  auth150End?: string;
  auth180Number?: string;
  auth180Start?: string;
  auth180End?: string;
  caseStatus?: string;
  nextActionDueDate?: string;
  closedDate?: string;
  reasonClosed?: string;
  notes?: string;
}

const clean = (v?: string) => (v ?? '').toString().trim();
/**
 * The sheet writes "ID-042083979201"; the app stores "042083979201". Stripping
 * punctuation alone left the "ID" attached and the two never matched — on the
 * first live preview that would have created 29 duplicate clients for people
 * already in the app.
 *
 * Only a *leading* ID is removed. Eight member IDs carry a letter mid-string
 * (638W20113) and must survive intact. Checked against production: no stored
 * ID begins with "ID", and stripping introduces no collisions — 164 IDs, still
 * 164 distinct.
 */
const idKey = (v?: string) =>
  clean(v).replace(/[^0-9A-Za-z]/g, '').toUpperCase().replace(/^ID/, '');

/**
 * Eleven clients have no member ID at all, so the ID check cannot protect them
 * from being duplicated. Names are the fallback. A false match here causes a
 * *skip*, never a bad write, so leaning toward matching is the safe direction.
 */
const nameKey = (v?: string) =>
  clean(v).toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();

/** The sheet writes MM/DD/YYYY; Postgres wants YYYY-MM-DD. */
function toIsoDate(v?: string): string | null {
  const s = clean(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

function toLevel(v?: string): string | null {
  const s = clean(v).toLowerCase();
  if (s.startsWith('high')) return 'High Level';
  if (s.startsWith('low')) return 'Low Level';
  return null;
}

function splitName(full: string): { first: string; last: string } | null {
  const parts = clean(full).split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  const secret = Deno.env.get('SHEET_INTAKE_SECRET');
  if (!secret) return json({ error: 'SHEET_INTAKE_SECRET is not configured.' }, 500);
  if (req.headers.get('x-intake-secret') !== secret) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  let payload: { rows?: SheetRow[]; dryRun?: boolean };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const rows = payload.rows ?? [];
  const dryRun = payload.dryRun !== false; // safe by default: preview unless told otherwise
  if (!Array.isArray(rows) || rows.length === 0) return json({ error: 'No rows sent.' }, 400);
  if (rows.length > 500) return json({ error: 'Send at most 500 rows at a time.' }, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Every existing member ID, so a row for someone already here is skipped
  // rather than creating a second record for the same person.
  const { data: existing, error: exErr } = await supabase
    .from('clients')
    .select('id, member_id, first_name, last_name');
  if (exErr) return json({ error: `Could not read existing clients: ${exErr.message}` }, 500);

  const byMemberId = new Map<string, { first_name: string; last_name: string }>();
  const byName = new Map<string, { first_name: string; last_name: string }>();
  for (const c of existing ?? []) {
    const who = { first_name: c.first_name, last_name: c.last_name };
    const k = idKey(c.member_id ?? '');
    if (k) byMemberId.set(k, who);
    const n = nameKey(`${c.first_name} ${c.last_name}`);
    if (n) byName.set(n, who);
  }

  // Staff names -> profile ids, so "Assigned Staff" can route a new client.
  const { data: staff } = await supabase.from('profiles').select('id, first_name, last_name');
  const byStaffName = new Map<string, string>();
  for (const p of staff ?? []) {
    const k = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim().toLowerCase().replace(/\s+/g, ' ');
    if (k) byStaffName.set(k, p.id);
  }

  const created: unknown[] = [];
  const skipped: unknown[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const seenThisBatch = new Set<string>();

  for (const row of rows) {
    const where = { row: row.rowNumber, name: clean(row.clientName) || '(no name)' };

    const key = idKey(row.memberId);
    if (!key) {
      skipped.push({ ...where, reason: 'No Member ID — that is the field the app matches on.' });
      continue;
    }
    const name = splitName(row.clientName ?? '');
    if (!name) {
      skipped.push({ ...where, reason: 'Client Name needs both a first and last name.' });
      continue;
    }
    if (byMemberId.has(key)) {
      const c = byMemberId.get(key)!;
      skipped.push({ ...where, reason: `Already in the app as ${c.first_name} ${c.last_name}.` });
      continue;
    }
    // Catches clients stored without a member ID, who the ID check cannot see.
    const nkey = nameKey(row.clientName);
    if (nkey && byName.has(nkey)) {
      const c = byName.get(nkey)!;
      skipped.push({
        ...where,
        reason: `Already in the app as ${c.first_name} ${c.last_name} — matched on name, `
          + 'because that record has no Member ID. Worth adding one.',
      });
      continue;
    }
    if (seenThisBatch.has(key)) {
      skipped.push({ ...where, reason: 'This Member ID appears more than once in the sheet.' });
      continue;
    }
    seenThisBatch.add(key);

    const startDate = toIsoDate(row.auth30Start) ?? toIsoDate(row.auth150Start);
    const level = toLevel(row.lonLevel);
    const hspSubmitted = HSP_SENT.has(clean(row.approvalStatus).toLowerCase());
    const scoreRaw = clean(row.lonScore);
    const score = /^\d+$/.test(scoreRaw) ? Number(scoreRaw) : null;

    // What is still missing before a case manager can actually work them.
    // The client is created either way; this is what the sheet gets told.
    const missing: string[] = [];
    if (!hspSubmitted) missing.push('Approval Status is not Submitted or Approved');
    if (!startDate) missing.push('no 30-Day or 150-Day start date');
    if (!level) missing.push('no LON Level');

    toInsert.push({
      first_name: name.first,
      last_name: name.last,
      member_id: clean(row.memberId),
      insurance: clean(row.mco) || null,
      phone: clean(row.phone) || null,
      date_of_birth: toIsoDate(row.dateOfBirth),
      intake_date: toIsoDate(row.intakeDate),
      assessment_due_date: toIsoDate(row.assessmentDueDate),
      assigned_employee_id:
        byStaffName.get(clean(row.assignedStaff).toLowerCase().replace(/\s+/g, ' ')) ?? null,
      auth_30_number: clean(row.auth30Number) || null,
      auth_30_start: toIsoDate(row.auth30Start),
      auth_30_end: toIsoDate(row.auth30End),
      auth_150_number: clean(row.auth150Number) || null,
      auth_150_start: toIsoDate(row.auth150Start),
      auth_150_end: toIsoDate(row.auth150End),
      auth_180_number: clean(row.auth180Number) || null,
      auth_180_start: toIsoDate(row.auth180Start),
      auth_180_end: toIsoDate(row.auth180End),
      // The trigger on clients forces Low when the score is under 18, so a
      // mis-typed level in the sheet cannot raise anyone's billing rate.
      lon_score: score,
      level_of_need: level,
      hsp_submitted: hspSubmitted,
      workflow_stage: STAGE[clean(row.caseStatus).toLowerCase()] ?? 'referred',
      next_action_due_date: toIsoDate(row.nextActionDueDate),
      closed_date: toIsoDate(row.closedDate),
      reason_closed: clean(row.reasonClosed) || null,
      notes: clean(row.notes) || null,
      status: clean(row.caseStatus).toLowerCase() === 'closed' ? 'closed' : 'active',
      __missing: missing, // stripped before insert; reported back to the sheet
    });
  }

  const preview = toInsert.map((r) => ({
    name: `${r.first_name} ${r.last_name}`,
    memberId: r.member_id,
    workable: (r.__missing as string[]).length === 0,
    stillNeeded: r.__missing,
  }));

  if (dryRun) {
    return json({
      dryRun: true,
      wouldCreate: preview.length,
      wouldSkip: skipped.length,
      created: preview,
      skipped,
    });
  }

  if (toInsert.length) {
    const clean_rows = toInsert.map(({ __missing, ...rest }) => rest);
    const { error } = await supabase.from('clients').insert(clean_rows);
    if (error) return json({ error: `Insert failed, nothing was created: ${error.message}` }, 500);
    created.push(...preview);
  }

  return json({ dryRun: false, createdCount: created.length, skippedCount: skipped.length, created, skipped });
});
