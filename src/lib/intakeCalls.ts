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
      intake_call_assigned_at: new Date().toISOString(),
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

// ---------------------------------------------------------------------------
// The intake list: every client whose intake is still to be done, and those
// done in the last two weeks, with where each stands. Read by the Intake calls
// page and the admin dashboard, so both show the same thing.
// ---------------------------------------------------------------------------

export type IntakeStatus = 'not_called' | 'waiting' | 'review' | 'reviewed';

export const INTAKE_STATUS_LABEL: Record<IntakeStatus, string> = {
  not_called: 'Not called yet',
  waiting: 'Waiting to hear back from client',
  review: 'Ready for review',
  reviewed: 'Reviewed',
};

/** The short label, where space is tight. */
export const INTAKE_STATUS_SHORT: Record<IntakeStatus, string> = {
  not_called: 'Not called yet',
  waiting: 'Waiting on client',
  review: 'Ready for review',
  reviewed: 'Reviewed',
};

/** The forms a new member's package holds, which an admin reviews. */
export const PACKAGE_FORMS = [
  { type: 'Client Intake', short: 'Intake' },
  { type: 'Initial Assessment (IAT)', short: 'IAT' },
  { type: 'Level of Need (LON)', short: 'LON' },
  { type: 'Housing Stabilization Plan (HSP)', short: 'HSP' },
] as const;

export type PackageFormState = 'not_started' | 'draft' | 'completed' | 'reviewed';

/** The newest form of one type in a member's package, as the form window opens it. */
export interface PackageForm {
  type: string;
  short: string;
  state: PackageFormState;
  /** Comments not yet marked done. */
  openComments: number;
  /** The form's row, to open it; null when not started. */
  row: Record<string, unknown> | null;
}

export interface IntakeListRow {
  clientId: string;
  name: string;
  phone: string | null;
  managerId: string | null;
  /** When the client was put on the list. */
  since: string;
  status: IntakeStatus;
  /** Calls nobody answered, newest first. */
  calls: IntakeCall[];
  /** The call was answered and the intake started, not yet completed. */
  intakeStarted: boolean;
  /** When the Client Intake was completed. */
  doneAt: string | null;
  /** The four package forms, in order. */
  forms: PackageForm[];
}

/** A form counts as completed once it is no longer a draft. */
const OPEN_FORM = new Set(['draft', 'changes_requested']);
const REVIEWED_SHOWN_DAYS = 14;
const FORM_COLUMNS =
  'id, client_id, employee_id, form_type, title, file_path, original_file_path, status, signature_name, signed_at, approved_at, review_note, created_at, updated_at, form_data, clients(first_name, last_name)';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (t: string) => (supabase.from as any)(t);

export async function loadIntakeList(): Promise<IntakeListRow[]> {
  const { data: clientData, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, phone, assigned_employee_id, created_at, intake_call_status, intake_call_assigned_at')
    .in('intake_call_status' as never, ['awaiting', 'reached'] as never)
    .eq('status', 'active')
    .is('deleted_at', null);
  if (error) throw new Error(error.message);
  const clients = (clientData ?? []) as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    assigned_employee_id: string | null;
    created_at: string;
    intake_call_status: 'awaiting' | 'reached';
    intake_call_assigned_at: string | null;
  }[];
  if (!clients.length) return [];
  const ids = clients.map((c) => c.id);

  const [calls, formsRes] = await Promise.all([
    loadIntakeCalls(ids).catch(() => new Map<string, IntakeCall[]>()),
    supabase
      .from('client_forms')
      .select(FORM_COLUMNS)
      .in('form_type', PACKAGE_FORMS.map((f) => f.type))
      .in('client_id', ids)
      .order('created_at', { ascending: false }),
  ]);
  type FormRowData = { id: string; client_id: string; form_type: string; status: string; signed_at: string | null; updated_at: string };
  const forms = (formsRes.data ?? []) as unknown as FormRowData[];
  // The newest form of each type for each client.
  const newest = new Map<string, FormRowData>();
  for (const f of forms) {
    const key = `${f.client_id}|${f.form_type}`;
    if (!newest.has(key)) newest.set(key, f);
  }
  const formIds = [...newest.values()].map((f) => f.id);
  const reviewedAt = new Map<string, string>();
  const openComments = new Map<string, number>();
  for (let i = 0; i < formIds.length; i += 200) {
    const slice = formIds.slice(i, i + 200);
    const [r, c] = await Promise.all([
      fromTable('form_reviews').select('client_form_id, reviewed_at').in('client_form_id', slice),
      fromTable('form_comments').select('client_form_id').is('resolved_at', null).in('client_form_id', slice),
    ]);
    for (const x of (r.data ?? []) as { client_form_id: string; reviewed_at: string }[]) reviewedAt.set(x.client_form_id, x.reviewed_at);
    for (const x of (c.data ?? []) as { client_form_id: string }[]) openComments.set(x.client_form_id, (openComments.get(x.client_form_id) ?? 0) + 1);
  }

  const rows: IntakeListRow[] = [];
  for (const c of clients) {
    const packageForms: PackageForm[] = PACKAGE_FORMS.map((p) => {
      const f = newest.get(`${c.id}|${p.type}`);
      if (!f) return { type: p.type, short: p.short, state: 'not_started', openComments: 0, row: null };
      const reviewed = reviewedAt.get(f.id);
      // Reviewed, unless it was completed again since.
      const state: PackageFormState = OPEN_FORM.has(f.status)
        ? 'draft'
        : reviewed && (!f.signed_at || f.signed_at <= reviewed)
          ? 'reviewed'
          : 'completed';
      return { type: p.type, short: p.short, state, openComments: openComments.get(f.id) ?? 0, row: f as unknown as Record<string, unknown> };
    });
    const intake = newest.get(`${c.id}|Client Intake`);
    const doneAt = intake && !OPEN_FORM.has(intake.status) ? intake.signed_at ?? intake.updated_at : null;
    const allReviewed = packageForms.every((f) => f.state === 'reviewed');
    if (allReviewed) {
      const last = packageForms.map((f) => reviewedAt.get(String(f.row?.id)) ?? '').sort().pop() ?? '';
      if (last && daysSince(last) > REVIEWED_SHOWN_DAYS) continue;
    }
    const all = calls.get(c.id) ?? [];
    const unanswered = all.filter((x) => x.outcome !== 'answered');
    const status: IntakeStatus = allReviewed
      ? 'reviewed'
      : doneAt
        ? 'review'
        : unanswered.length || c.intake_call_status === 'reached'
          ? 'waiting'
          : 'not_called';
    rows.push({
      clientId: c.id,
      name: `${c.first_name} ${c.last_name}`.trim(),
      phone: c.phone,
      managerId: c.assigned_employee_id,
      since: c.intake_call_assigned_at ?? c.created_at,
      status,
      calls: unanswered,
      intakeStarted: !doneAt && c.intake_call_status === 'reached',
      doneAt,
      forms: packageForms,
    });
  }
  const order: Record<IntakeStatus, number> = { not_called: 0, waiting: 1, review: 2, reviewed: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status] || a.since.localeCompare(b.since));
  return rows;
}

/** An admin marks package forms reviewed. */
export async function markFormsReviewed(formIds: string[], reviewedBy: string): Promise<void> {
  if (!formIds.length) return;
  const { error } = await fromTable('form_reviews').upsert(
    formIds.map((id) => ({ client_form_id: id, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })),
    { onConflict: 'client_form_id' },
  );
  if (error) throw new Error(error.message);
}

/**
 * An admin puts a client on the intake list and assigns the call: the staff
 * member becomes the client's case manager, and the client waits for their
 * intake call.
 */
export async function assignIntakeCall(clientId: string, managerId: string): Promise<void> {
  const { error } = await supabase
    .from('clients')
    .update({ assigned_employee_id: managerId, intake_call_status: 'awaiting', intake_call_assigned_at: new Date().toISOString() } as never)
    .eq('id', clientId);
  if (error) throw new Error(error.message);
}

/** Hand a call already on the list to another staff member; how long it has waited stays. */
export async function reassignIntakeCall(clientId: string, managerId: string): Promise<void> {
  const { error } = await supabase.from('clients').update({ assigned_employee_id: managerId }).eq('id', clientId);
  if (error) throw new Error(error.message);
}

/** Active clients with no completed Client Intake who are not on the list yet. */
export async function clientsWithoutIntake(): Promise<{ id: string; name: string; managerId: string | null }[]> {
  const { data: clientData, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, assigned_employee_id, intake_call_status')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('last_name');
  if (error) throw new Error(error.message);
  const clients = ((clientData ?? []) as unknown as {
    id: string;
    first_name: string;
    last_name: string;
    assigned_employee_id: string | null;
    intake_call_status: string | null;
  }[]).filter((c) => c.intake_call_status !== 'awaiting');
  const { data: forms } = await supabase.from('client_forms').select('client_id, status').eq('form_type', 'Client Intake');
  const done = new Set(
    ((forms ?? []) as { client_id: string; status: string }[]).filter((f) => !OPEN_FORM.has(f.status)).map((f) => f.client_id),
  );
  return clients
    .filter((c) => !done.has(c.id))
    .map((c) => ({ id: c.id, name: `${c.last_name}, ${c.first_name}`, managerId: c.assigned_employee_id }));
}
