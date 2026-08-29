import { supabase } from '@/integrations/supabase/client';

/**
 * `client_form_checklist` is newer than the generated types, which Lovable
 * regenerates only after the migration is applied. Narrowed to this one table
 * so nothing else in the file loses its typing.
 */
const checklist = () =>
  (supabase as unknown as {
    from: (t: string) => ReturnType<typeof supabase.from>;
  }).from('client_form_checklist');

/**
 * The forms every client should have.
 *
 * Four, in the order the work happens. Everything else a client file holds —
 * approval letters, leases, award letters — is a document that arrives, not a
 * form somebody is answerable for, and lives in the groups below the checklist.
 */
export const CHECKLIST_TYPES = [
  'Client Intake',
  'Initial Assessment (IAT)',
  'Level of Need (LON)',
  'Housing Stabilization Plan (HSP)',
] as const;

export type ChecklistType = (typeof CHECKLIST_TYPES)[number];

/**
 * Form types ticked by hand for one client — the ones with no document behind
 * them. A type holding a document is ticked by the document itself, and is
 * deliberately not recorded here.
 */
export async function loadManualTicks(clientId: string): Promise<Set<string>> {
  const { data, error } = await checklist().select('form_type').eq('client_id', clientId);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { form_type: string }[]).map((r) => r.form_type));
}

export async function tickByHand(
  clientId: string,
  formType: string,
  profileId: string,
): Promise<void> {
  const { error } = await checklist().insert({
    client_id: clientId,
    form_type: formType,
    marked_by: profileId,
  } as never);
  // Two people ticking the same box is agreement, not a clash.
  if (error && !error.message.includes('duplicate key')) throw new Error(error.message);
}

export async function untickByHand(clientId: string, formType: string): Promise<void> {
  const { error } = await checklist()
    .delete()
    .eq('client_id', clientId)
    .eq('form_type', formType);
  if (error) throw new Error(error.message);
}
