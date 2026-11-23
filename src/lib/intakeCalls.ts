// Intake calls (supabase/migrations/20261118160000_intake_calls.sql).
//
// A new client waits for their intake call until someone reaches them. Every
// call is recorded, answered or not, so the case manager's effort shows and
// their supervisor knows who has been called. Starting the Client Intake marks
// the client reached.
import { supabase } from '@/integrations/supabase/client';

export type CallOutcome = 'no_answer' | 'voicemail' | 'wrong_number' | 'not_in_service' | 'answered';

/** The unanswered outcomes, as buttons. */
export const NO_ANSWER_OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: 'no_answer', label: 'No answer' },
  { value: 'voicemail', label: 'Left voicemail' },
  { value: 'wrong_number', label: 'Wrong number' },
  { value: 'not_in_service', label: 'Number not in service' },
];

export const OUTCOME_LABEL: Record<CallOutcome, string> = {
  no_answer: 'No answer',
  voicemail: 'Left voicemail',
  wrong_number: 'Wrong number',
  not_in_service: 'Number not in service',
  answered: 'Answered',
};

export interface IntakeCall {
  id: string;
  client_id: string;
  called_by: string | null;
  called_at: string;
  outcome: CallOutcome;
}

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const calls = () => (supabase.from as any)('intake_calls');

/** Calls on these clients, newest first, grouped by client. */
export async function loadIntakeCalls(clientIds: string[]): Promise<Map<string, IntakeCall[]>> {
  const out = new Map<string, IntakeCall[]>();
  for (let i = 0; i < clientIds.length; i += 200) {
    const { data, error } = await calls()
      .select('id, client_id, called_by, called_at, outcome')
      .in('client_id', clientIds.slice(i, i + 200))
      .order('called_at', { ascending: false });
    if (error) throw new Error(error.message);
    for (const c of (data ?? []) as IntakeCall[]) out.set(c.client_id, [...(out.get(c.client_id) ?? []), c]);
  }
  return out;
}

/** Record a call on a client. */
export async function logIntakeCall(clientId: string, calledBy: string, outcome: CallOutcome): Promise<void> {
  const { error } = await calls().insert({ client_id: clientId, called_by: calledBy, outcome });
  if (error) throw new Error(error.message);
}

/** The call was answered: record it, and take the client out of waiting. */
export async function markIntakeCallReached(clientId: string, calledBy: string): Promise<void> {
  await logIntakeCall(clientId, calledBy, 'answered');
  const { error } = await supabase
    .from('clients')
    .update({ intake_call_status: 'reached' } as never)
    .eq('id', clientId);
  if (error) throw new Error(error.message);
}

export interface UnreachedClientInput {
  first_name: string;
  last_name: string;
  phone: string;
  auth_30_number?: string;
  address?: string;
  email?: string;
  assigned_employee_id: string | null;
}

/**
 * A client whose intake call was not answered: added with what is known, and
 * waiting for their call, with this first call recorded.
 */
export async function addUnreachedClient(
  input: UnreachedClientInput,
  calledBy: string,
  outcome: CallOutcome,
): Promise<{ id: string; name: string }> {
  const { data, error } = await supabase
    .from('clients')
    .insert({
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      phone: input.phone.trim() || null,
      auth_30_number: input.auth_30_number?.trim() || null,
      address: input.address?.trim() || null,
      email: input.email?.trim() || null,
      assigned_employee_id: input.assigned_employee_id,
      intake_call_status: 'awaiting',
    } as never)
    .select('id, first_name, last_name')
    .single();
  if (error) throw new Error(error.message);
  const row = data as { id: string; first_name: string; last_name: string };
  await logIntakeCall(row.id, calledBy, outcome);
  return { id: row.id, name: `${row.first_name} ${row.last_name}` };
}

/** "Assigned 2 days ago" and the like, from a timestamp. */
export function daysSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
}
