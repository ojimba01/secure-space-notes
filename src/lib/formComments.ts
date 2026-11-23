// Corrections on forms (supabase/migrations/20261118180000_form_comments_notifications.sql).
//
// A supervisor comments on a question of someone's form, picking a ready-made
// comment so there is little to type. The person who filled the form is
// notified, sees the comment on the question, and marks it done once fixed.
// When a supervisor changes answers on someone's form themselves, that person
// is told which answers changed.
import { supabase } from '@/integrations/supabase/client';

/** Ready-made comments. Each asks for one thing. */
export const COMMENT_PRESETS: { key: string; label: string }[] = [
  { key: 'update', label: 'Please update this answer' },
  { key: 'missing', label: 'This answer is missing' },
  { key: 'mismatch', label: "This doesn't match the client record" },
  { key: 'detail', label: 'Please add more detail' },
  { key: 'date', label: 'Please check this date' },
  { key: 'spelling', label: 'Please check the spelling' },
];

export interface FormComment {
  id: string;
  client_form_id: string;
  client_id: string;
  field: string | null;
  field_label: string | null;
  preset: string | null;
  body: string;
  author_id: string | null;
  recipient_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface FormRef {
  id: string;
  client_id: string;
  employee_id: string;
  form_type: string;
  clientName: string;
}

/** One answer an admin changed: what it was, and what it is now. */
export interface TrackedChange {
  field: string;
  label: string;
  before: string;
  after: string;
}

export interface AppNotification {
  id: string;
  kind: 'form_comment' | 'form_corrected' | 'intake_assigned' | 'form_submitted';
  title: string;
  body: string | null;
  client_id: string | null;
  client_form_id: string | null;
  created_at: string;
  read_at: string | null;
  /** For form_corrected: every answer changed, before and after. */
  details: { changes?: TrackedChange[] } | null;
}

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => (supabase.from as any)(name);

async function nameOf(profileId: string): Promise<string> {
  const { data } = await supabase.from('profiles').select('first_name, last_name').eq('id', profileId).maybeSingle();
  return `${data?.first_name ?? ''} ${data?.last_name ?? ''}`.trim() || 'Your supervisor';
}

/** Comments on one form, oldest first. */
export async function loadFormComments(formId: string): Promise<FormComment[]> {
  const { data, error } = await table('form_comments')
    .select('*')
    .eq('client_form_id', formId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as FormComment[];
}

/** Open comments per form, for the forms list. */
export async function openCommentCounts(formIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!formIds.length) return out;
  const { data } = await table('form_comments').select('client_form_id').in('client_form_id', formIds).is('resolved_at', null);
  for (const r of (data ?? []) as { client_form_id: string }[]) out.set(r.client_form_id, (out.get(r.client_form_id) ?? 0) + 1);
  return out;
}

/** Leave a comment on a question (or the whole form) and tell the person who filled it. */
export async function addFormComment(input: {
  form: FormRef;
  field: string | null;
  fieldLabel: string | null;
  preset: string | null;
  note: string;
  authorId: string;
}): Promise<void> {
  const presetLabel = COMMENT_PRESETS.find((p) => p.key === input.preset)?.label ?? '';
  const body = [presetLabel, input.note.trim()].filter(Boolean).join('. ');
  if (!body) throw new Error('Pick a comment or write one.');
  const { error } = await table('form_comments').insert({
    client_form_id: input.form.id,
    client_id: input.form.client_id,
    field: input.field,
    field_label: input.fieldLabel,
    preset: input.preset,
    body,
    author_id: input.authorId,
    recipient_id: input.form.employee_id,
  });
  if (error) throw new Error(error.message);
  if (input.form.employee_id === input.authorId) return;
  const author = await nameOf(input.authorId);
  await table('notifications').insert({
    recipient_id: input.form.employee_id,
    kind: 'form_comment',
    title: `${author} left a comment on your ${input.form.form_type}`,
    body: `${input.form.clientName}${input.fieldLabel ? `, ${input.fieldLabel}` : ''}: ${body}`,
    client_id: input.form.client_id,
    client_form_id: input.form.id,
    actor_id: input.authorId,
  });
}

/** The person who filled the form fixed it. */
export async function resolveFormComment(id: string, by: string): Promise<void> {
  const { error } = await table('form_comments').update({ resolved_at: new Date().toISOString(), resolved_by: by }).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Tell the person who filled a form what a supervisor changed: each answer,
 * before and after (tracked changes). Each change is also kept as a
 * form_corrections row, the record of what gets corrected most.
 */
export async function notifyCorrections(form: FormRef, changes: TrackedChange[], actorId: string): Promise<void> {
  if (!changes.length || form.employee_id === actorId) return;
  const actor = await nameOf(actorId);
  const labels = changes.map((c) => c.label);
  const shown = labels.slice(0, 5).join(', ') + (labels.length > 5 ? ` and ${labels.length - 5} more` : '');
  await table('form_corrections').insert(
    changes.map((c) => ({
      client_form_id: form.id,
      client_id: form.client_id,
      form_type: form.form_type,
      field: c.field,
      field_label: c.label,
      before_value: c.before,
      after_value: c.after,
      corrected_by: actorId,
      recipient_id: form.employee_id,
    })),
  );
  await table('notifications').insert({
    recipient_id: form.employee_id,
    kind: 'form_corrected',
    title: `${actor} made changes to your ${form.form_type}`,
    body: `${form.clientName}: ${labels.length === 1 ? 'changed' : `changed ${labels.length} answers:`} ${shown}`,
    client_id: form.client_id,
    client_form_id: form.id,
    actor_id: actorId,
    details: { changes },
  });
}

/** Answers that differ between two readings of a form's boxes. */
export function changedFields(before: Record<string, string>, after: Record<string, string>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => (before[k] ?? '').trim() !== (after[k] ?? '').trim());
}

/** Each changed answer, before and after, with the question as people read it. */
export function trackedChanges(
  before: Record<string, string>,
  after: Record<string, string>,
  label: (field: string) => string,
): TrackedChange[] {
  return changedFields(before, after).map((field) => ({
    field,
    label: label(field),
    before: (before[field] ?? '').trim(),
    after: (after[field] ?? '').trim(),
  }));
}

export async function loadNotifications(profileId: string, limit = 30): Promise<AppNotification[]> {
  const { data, error } = await table('notifications')
    .select('id, kind, title, body, client_id, client_form_id, created_at, read_at, details')
    .eq('recipient_id', profileId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as AppNotification[];
}

export async function markNotificationsRead(ids: string[]): Promise<void> {
  if (!ids.length) return;
  await table('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
}
