// What the uploaded documents say that the record does not.
//
// Approval letters, prior-authorization responses and the rest already have
// their fields read on upload and stored on client_forms as field_*. Until now
// only two of them went anywhere — the authorization number and its date range
// — and the rest sat on the document unread by anything.
//
// This gathers every extracted field that has a counterpart on the client
// record, compares the two, and proposes only the ones that differ. A value the
// record already agrees with is not a change and is not offered: a list that
// includes what is already true makes a person read past it to find what is not.
//
// Nothing is written without somebody accepting it, line by line. These values
// drive billing cycles and touchpoint windows; a date a regex misread would
// hide a claim or invent one.
import { supabase } from '@/integrations/supabase/client';
import {
  resyncDerivedSchedules,
  syncAuthorizationsFromLegacyColumns,
} from '@/lib/authorizations';

/** A field the reader pulls off a document and the record also holds. */
export interface FieldSpec {
  /** The extracted column on client_forms. */
  from: string;
  /** The column on clients it answers. */
  to: string;
  label: string;
  kind: 'date' | 'text';
  /** Said on the row, when accepting it moves more than the field itself. */
  consequence?: string;
}

export const FIELD_SPECS: FieldSpec[] = [
  { from: 'field_member_dob', to: 'date_of_birth', label: 'Date of birth', kind: 'date' },
  { from: 'field_member_id', to: 'member_id', label: 'Member ID', kind: 'text' },
  { from: 'field_medicaid_id', to: 'medicaid_id', label: 'Medicaid number', kind: 'text' },
  { from: 'field_njhmis_id', to: 'njhmis_id', label: 'NJ HMIS ID', kind: 'text' },
];

export interface FieldProposal {
  key: string;
  documentId: string;
  documentName: string;
  label: string;
  kind: 'date' | 'text';
  /** What the record holds now. Null when it holds nothing. */
  previous: string | null;
  /** What the document says. */
  updated: string;
  consequence?: string;
  /** The column to write. */
  column: string;
}

const norm = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

/** Same value, allowing for spacing and case on an identifier. */
const same = (a: string | null, b: string | null) =>
  (a ?? '').replace(/\s+/g, '').toLowerCase() === (b ?? '').replace(/\s+/g, '').toLowerCase();

/**
 * Every extracted field that disagrees with the record, newest document first.
 *
 * A document with nothing to say produces nothing. Two documents disagreeing
 * about the same field both appear — the person picks, rather than the app
 * guessing which letter is the later authority.
 */
export async function loadFieldProposals(clientId: string): Promise<FieldProposal[]> {
  const [{ data: docs, error: docsError }, { data: client, error: clientError }] = await Promise.all([
    supabase
      .from('client_forms')
      .select(
        `id, form_type, source_filename, created_at, ${FIELD_SPECS.map((f) => f.from).join(', ')}`,
      )
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    supabase
      .from('clients')
      .select(FIELD_SPECS.map((f) => f.to).join(', '))
      .eq('id', clientId)
      .maybeSingle(),
  ]);

  if (docsError) throw new Error(docsError.message);
  if (clientError) throw new Error(clientError.message);
  if (!client) return [];

  const record = client as unknown as Record<string, unknown>;
  const out: FieldProposal[] = [];
  const seen = new Set<string>();

  for (const doc of (docs ?? []) as unknown as Record<string, unknown>[]) {
    for (const spec of FIELD_SPECS) {
      const updated = norm(doc[spec.from]);
      if (!updated) continue;

      const previous = norm(record[spec.to]);
      if (same(previous, updated)) continue;

      // One proposal per field per value. The same number repeated across five
      // letters is one change to make, not five rows to read.
      const key = `${spec.to}:${updated}`;
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        key,
        documentId: String(doc.id),
        documentName: String(doc.source_filename ?? doc.form_type ?? 'a document'),
        label: spec.label,
        kind: spec.kind,
        previous,
        updated,
        consequence: spec.consequence,
        column: spec.to,
      });
    }
  }

  return out;
}

/**
 * Write the accepted values onto the record.
 *
 * The two sync calls run afterwards whatever was accepted, and in that order.
 * Doing one without the other is the most repeated source of defects in this
 * app: the first turns the legacy columns into authorization records, the
 * second rebuilds the billing cycles and touchpoint schedule counted from them.
 * Running them for a field that changed neither costs one query and removes a
 * question nobody should have to answer at the call site.
 */
export async function applyFieldProposals(
  clientId: string,
  accepted: FieldProposal[],
): Promise<void> {
  if (!accepted.length) return;

  const patch: Record<string, string> = {};
  for (const p of accepted) patch[p.column] = p.updated;

  const { error } = await supabase.from('clients').update(patch).eq('id', clientId);
  if (error) throw new Error(error.message);

  await syncAuthorizationsFromLegacyColumns(clientId);
  await resyncDerivedSchedules(clientId);
}

/**
 * What the record held before a set of document edits was accepted, so the
 * accept can be undone.
 *
 * Accepting writes client columns and then rebuilds the authorizations and
 * billing cycles from them. Undoing puts the columns back, restores the
 * authorizations as they were — removing any the accept created — and
 * rebuilds the cycles again, so everything that followed from the edit is
 * reversed with it.
 */
export interface AcceptSnapshot {
  clientId: string;
  columns: Record<string, unknown>;
  authorizations: {
    id: string;
    start_date: string | null;
    end_date: string | null;
    authorization_number: string | null;
    status: string;
  }[];
}

export async function snapshotBeforeAccept(
  clientId: string,
  columns: string[],
): Promise<AcceptSnapshot> {
  const [client, auths] = await Promise.all([
    supabase.from('clients').select(columns.join(', ')).eq('id', clientId).maybeSingle(),
    supabase
      .from('client_authorizations')
      .select('id, start_date, end_date, authorization_number, status')
      .eq('client_id', clientId),
  ]);
  if (client.error) throw new Error(client.error.message);
  if (auths.error) throw new Error(auths.error.message);
  return {
    clientId,
    columns: (client.data ?? {}) as unknown as Record<string, unknown>,
    authorizations: auths.data ?? [],
  };
}

export async function undoAccept(snapshot: AcceptSnapshot): Promise<void> {
  const { clientId } = snapshot;
  const { error } = await supabase.from('clients').update(snapshot.columns).eq('id', clientId);
  if (error) throw new Error(error.message);

  const { data: now, error: nowError } = await supabase
    .from('client_authorizations')
    .select('id')
    .eq('client_id', clientId);
  if (nowError) throw new Error(nowError.message);

  const before = new Map(snapshot.authorizations.map((a) => [a.id, a]));
  for (const row of now ?? []) {
    const was = before.get(row.id);
    if (!was) {
      // Created by the accept being undone.
      const { error: delError } = await supabase.from('client_authorizations').delete().eq('id', row.id);
      if (delError) throw new Error(delError.message);
      continue;
    }
    const { id, ...fields } = was;
    const { error: upError } = await supabase.from('client_authorizations').update(fields).eq('id', id);
    if (upError) throw new Error(upError.message);
  }

  await resyncDerivedSchedules(clientId);
}
