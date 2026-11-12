// Suggested updates on the client's Overview: where an uploaded document says
// something different from the record, shown under the field it applies to,
// with a check to accept it and an X to decline it.
//
// The differences come from the same readers as the Suggested updates tab
// (documentProposals.ts, authorizationProposals.ts). A declined suggestion is
// saved in document_suggestion_dismissals, so it does not come back; a
// different value from a later document is a new suggestion.
import { supabase } from '@/integrations/supabase/client';
import {
  applyAuthorizationProposals,
  loadAuthorizationProposals,
  type AuthorizationProposal,
} from '@/lib/authorizationProposals';
import {
  applyFieldProposals,
  loadFieldProposals,
  snapshotBeforeAccept,
  type AcceptSnapshot,
  type FieldProposal,
} from '@/lib/documentProposals';

export const fieldKey = (f: FieldProposal) => `field:${f.column}:${f.updated}`;
export const authKey = (p: AuthorizationProposal) => `auth:${p.prefix}:${p.start}:${p.end}:${p.number ?? ''}`;

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase.from as any)('document_suggestion_dismissals');

/** The suggestions declined for this client. Empty when they cannot be read. */
export async function loadDismissed(clientId: string): Promise<Set<string>> {
  const { data, error } = await table().select('suggestion_key').eq('client_id', clientId);
  if (error) return new Set();
  return new Set(((data ?? []) as { suggestion_key: string }[]).map((r) => r.suggestion_key));
}

export interface Suggestions {
  fields: FieldProposal[];
  authorizations: AuthorizationProposal[];
}

/** Every difference between the documents and the record, less the declined ones. */
export async function loadSuggestions(clientId: string): Promise<Suggestions> {
  const [auth, fields, dismissed] = await Promise.all([
    loadAuthorizationProposals(clientId),
    loadFieldProposals(clientId),
    loadDismissed(clientId),
  ]);
  return {
    fields: fields.filter((f) => !dismissed.has(fieldKey(f))),
    authorizations: auth.proposals.filter((p) => !p.agrees && !dismissed.has(authKey(p))),
  };
}

export async function dismissSuggestion(clientId: string, key: string): Promise<void> {
  const { data } = await supabase.auth.getUser();
  const { error } = await table().upsert(
    { client_id: clientId, suggestion_key: key, dismissed_by: data.user?.id },
    { onConflict: 'client_id,suggestion_key', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
}

/** Write one suggestion to the record. Returns what it replaced, for Undo. */
export async function acceptField(clientId: string, f: FieldProposal): Promise<AcceptSnapshot> {
  const snapshot = await snapshotBeforeAccept(clientId, [f.column]);
  await applyFieldProposals(clientId, [f]);
  return snapshot;
}

export async function acceptAuthorization(clientId: string, p: AuthorizationProposal): Promise<AcceptSnapshot> {
  const snapshot = await snapshotBeforeAccept(clientId, [`${p.prefix}_start`, `${p.prefix}_end`, `${p.prefix}_number`]);
  await applyAuthorizationProposals(clientId, [p]);
  return snapshot;
}
