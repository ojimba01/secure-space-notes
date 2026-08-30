import { supabase } from '@/integrations/supabase/client';
import {
  cleanAuthorizationNumber,
  resyncDerivedSchedules,
  syncAuthorizationsFromLegacyColumns,
} from '@/lib/authorizations';

/**
 * What the approval letters say about a client's authorizations.
 *
 * An approval letter is the authority on when an authorization ran. The reader
 * already pulls its number and its From/To range onto the document; until now
 * those values sat there and went nowhere, while the dates that drive billing
 * were whatever somebody had typed.
 *
 * Nothing here is written without a person accepting it, one line at a time.
 * A date that drives billing cycles and touchpoint windows is not something a
 * regex gets to change on its own: a wrong one hides a claim, or invents one.
 */

/** Which period a letter describes, decided by how long it ran. */
const PERIODS = [
  { type: 'initial_30' as const, min: 25, max: 35, label: '30-day authorization', prefix: 'auth_30' },
  { type: 'continuation_150' as const, min: 140, max: 160, label: '150-day continuation', prefix: 'auth_150' },
  { type: 'reauthorization_180' as const, min: 170, max: 190, label: '180-day reauthorization', prefix: 'auth_180' },
];

export interface AuthorizationProposal {
  /** The document it was read from. */
  documentId: string;
  documentName: string;
  formType: string;
  label: string;
  prefix: string;
  number: string | null;
  start: string;
  end: string;
  /** What the client record holds for this period now. */
  currentNumber: string | null;
  currentStart: string | null;
  currentEnd: string | null;
  /** True when the record already says exactly this. */
  agrees: boolean;
}

export interface ProposalSet {
  proposals: AuthorizationProposal[];
  /** Letters whose span matches no known period, so nothing is proposed. */
  unrecognised: { documentName: string; start: string; end: string; days: number }[];
}

const days = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000,
  );

export async function loadAuthorizationProposals(clientId: string): Promise<ProposalSet> {
  const [{ data: docs, error: docsError }, { data: client, error: clientError }] = await Promise.all([
    supabase
      .from('client_forms')
      .select(
        'id, title, source_filename, form_type, field_authorization_number, field_service_start, field_service_end',
      )
      .eq('client_id', clientId)
      .not('field_service_start', 'is', null)
      .order('field_service_start', { ascending: true }),
    supabase
      .from('clients')
      .select(
        'auth_30_number, auth_30_start, auth_30_end, auth_150_number, auth_150_start, auth_150_end, auth_180_number, auth_180_start, auth_180_end',
      )
      .eq('id', clientId)
      .maybeSingle(),
  ]);
  if (docsError) throw new Error(docsError.message);
  if (clientError) throw new Error(clientError.message);

  const record = (client ?? {}) as Record<string, string | null>;
  const proposals: AuthorizationProposal[] = [];
  const unrecognised: ProposalSet['unrecognised'] = [];
  const claimed = new Set<string>();

  for (const doc of docs ?? []) {
    const start = doc.field_service_start as string | null;
    const end = doc.field_service_end as string | null;
    if (!start || !end) continue;

    const span = days(start, end);
    const period = PERIODS.find((p) => span >= p.min && span <= p.max);
    const name = (doc.title as string) || (doc.source_filename as string) || 'a document';

    if (!period) {
      unrecognised.push({ documentName: name, start, end, days: span });
      continue;
    }
    // One letter per period. The earliest is the authorisation; a later letter
    // covering the same span is a copy or a correction, and choosing between
    // them is not something a span can do.
    if (claimed.has(period.prefix)) continue;
    claimed.add(period.prefix);

    const currentNumber = record[`${period.prefix}_number`] ?? null;
    const currentStart = record[`${period.prefix}_start`] ?? null;
    const currentEnd = record[`${period.prefix}_end`] ?? null;
    const number = cleanAuthorizationNumber(doc.field_authorization_number as string | null) || null;

    proposals.push({
      documentId: doc.id as string,
      documentName: name,
      formType: doc.form_type as string,
      label: period.label,
      prefix: period.prefix,
      number,
      start,
      end,
      currentNumber,
      currentStart,
      currentEnd,
      agrees:
        currentStart === start &&
        currentEnd === end &&
        (number === null || cleanAuthorizationNumber(currentNumber) === number),
    });
  }

  return { proposals, unrecognised };
}

/**
 * Write the accepted periods and rebuild everything they drive.
 *
 * Both helpers, in this order, always. Billing cycles come from the legacy
 * columns and the history lives in client_authorizations; updating one without
 * the other is the single most repeated source of defects in this app.
 */
export async function applyAuthorizationProposals(
  clientId: string,
  accepted: AuthorizationProposal[],
): Promise<void> {
  if (!accepted.length) return;

  const patch: Record<string, string | null> = {};
  for (const p of accepted) {
    patch[`${p.prefix}_start`] = p.start;
    patch[`${p.prefix}_end`] = p.end;
    if (p.number) patch[`${p.prefix}_number`] = p.number;
  }

  const { error } = await supabase.from('clients').update(patch).eq('id', clientId);
  if (error) throw new Error(error.message);

  await syncAuthorizationsFromLegacyColumns(clientId);
  await resyncDerivedSchedules(clientId);
}
