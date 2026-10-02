// Saving clinical notes: the structured selections and the narrative together.
//
// The selections are the record of what happened; the narrative is how it was
// written up. Both are kept so the facts behind any note can be audited.
import { supabase } from '@/integrations/supabase/client';
import type { ComposedNote } from '@/components/clinicalNotes/NoteComposer';
import { isSplit, normalizeDraft, partFor, type ActivityPart } from '@/lib/clinicalNotes/generate';

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase.from as any)('clinical_notes');

export interface NoteContact {
  clientId?: string | null;
  contactId?: string | null;
  njhmisNoteId?: string | null;
  contactDate?: string | null;
  durationMinutes?: number | null;
  contactMethod?: string | null;
  faceToFace?: boolean | null;
  serviceType?: string | null;
  location?: string | null;
  progressNoteType?: string | null;
}

/** The row for a composed note. `finalText` is the note as saved, which may have been edited since. */
export function noteRow(c: ComposedNote, contact: NoteContact, finalText?: string) {
  const d = normalizeDraft(c.draft);
  const final = (finalText ?? c.final).trim();
  return {
    client_id: contact.clientId ?? null,
    contact_id: contact.contactId ?? null,
    njhmis_note_id: contact.njhmisNoteId ?? null,
    contact_date: contact.contactDate ?? null,
    duration_minutes: contact.durationMinutes ?? null,
    contact_method: contact.contactMethod ?? null,
    face_to_face: contact.faceToFace ?? null,
    service_type: contact.serviceType ?? null,
    location: contact.location ?? null,
    progress_note_type: contact.progressNoteType ?? null,
    // The categories picked (v3), or the topics of an older draft.
    primary_topic: (d.v === 3 ? d.tree?.categories[0] : d.topics[0]) ?? null,
    secondary_topics: d.v === 3 ? d.tree?.categories.slice(1) ?? [] : d.topics.slice(1),
    selections: d,
    // Answered per activity, each entry names its activity.
    interventions: (isSplit(d, 'actions') ? d.activities.map((id) => ({ id, p: partFor(d, id) })) : [{ id: null, p: d as ActivityPart }]).flatMap(({ id, p }) =>
      p.actions.map((a) => ({ ...(id ? { activity: id } : {}), ...(a.group === 'other' ? { group: 'other', text: p.actionsOther.trim() } : a) })),
    ),
    consumer_response: d.response.map((r) => (r === 'Other' || r === 'Other response' ? { other: d.responseOther.trim() } : r)),
    outcome: isSplit(d, 'result') ? Object.fromEntries(d.activities.map((id) => [id, partFor(d, id).result])) : d.result,
    barriers: isSplit(d, 'barriers')
      ? d.activities.flatMap((id) => {
          const b = partFor(d, id).barriers;
          return b.answer === 'Yes' ? b.list.map((x) => (x === 'Other barrier' ? b.other.trim() || x : x)) : [];
        })
      : d.barriers.answer === 'Yes'
        ? d.barriers.list.map((x) => (x === 'Other barrier' ? d.barriers.other.trim() || x : x))
        : d.result?.value === 'Barrier' && d.result.barrier
          ? [d.result.barrier === 'Other' ? d.result.barrierOther ?? 'Other' : d.result.barrier]
          : [],
    next_actions: d.steps.length || d.noNextStep || d.nextContact.kind ? { steps: d.steps, noNextStep: d.noNextStep, nextContact: d.nextContact } : d.next ?? null,
    free_text: d.freeText.trim() || null,
    generated_narrative: c.generated,
    final_narrative: final,
    generator: final === c.final.trim() ? c.generator : c.generator.endsWith('(edited)') ? c.generator : `${c.generator} (edited)`,
    reviewed_at: c.reviewedAt,
  };
}

export interface DraftNote {
  id: string;
  created_at: string;
  updated_at: string;
  contact_method: string | null;
  /** The day the contact happened, when typed. Becomes the touchpoint date. */
  contact_date: string | null;
  final_narrative: string;
  primary_topic: string | null;
  /** Manual entry: the name typed to organize drafts. Not in the note text. */
  client_label: string | null;
  /** Backlog notes: the 150-day start, which cycle, and whether the extension is included. */
  backlog_start: string | null;
  backlog_cycle: number | null;
  backlog_extension: boolean;
  composed: ComposedNote;
}

export interface BacklogRef {
  start: string;
  cycle: number;
  extension: boolean;
}

export interface DraftOptions {
  contactMethod: string | null;
  /** Update this draft instead of adding one. */
  id?: string;
  clientLabel?: string | null;
  contactDate?: string | null;
  backlog?: BacklogRef | null;
}

/** Save a draft that belongs to no client yet. */
export async function saveDraft(c: ComposedNote, o: DraftOptions): Promise<string> {
  const { id, backlog } = o;
  const row = {
    ...noteRow(c, { contactMethod: o.contactMethod, contactDate: o.contactDate || null }),
    status: 'draft',
    client_label: o.clientLabel?.trim() || null,
    backlog_start: backlog?.start ?? null,
    backlog_cycle: backlog?.cycle ?? null,
    backlog_extension: backlog?.extension ?? false,
  };
  if (id) {
    const { error } = await table().update(row).eq('id', id);
    if (error) throw new Error(error.message);
    return id;
  }
  const { data: who } = await supabase.auth.getUser();
  const { data, error } = await table().insert({ ...row, created_by: who.user?.id }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function loadMyDrafts(userId: string): Promise<DraftNote[]> {
  const { data, error } = await table()
    .select('id, created_at, updated_at, contact_method, contact_date, final_narrative, generated_narrative, generator, reviewed_at, primary_topic, client_label, backlog_start, backlog_cycle, backlog_extension, selections')
    .eq('status', 'draft')
    .eq('created_by', userId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    contact_method: r.contact_method,
    contact_date: r.contact_date ?? null,
    final_narrative: r.final_narrative ?? '',
    primary_topic: r.primary_topic,
    client_label: r.client_label ?? null,
    backlog_start: r.backlog_start ?? null,
    backlog_cycle: r.backlog_cycle ?? null,
    backlog_extension: !!r.backlog_extension,
    composed: {
      draft: r.selections,
      generated: r.generated_narrative ?? '',
      final: r.final_narrative ?? '',
      generator: r.generator ?? '',
      reviewedAt: r.reviewed_at ?? new Date().toISOString(),
    },
  }));
}

/** For one backlog (name and start date), which cycles have a note, and whether it is assigned yet. */
export async function loadBacklogNotes(userId: string, clientLabel: string, start: string): Promise<Record<number, { id: string; status: 'draft' | 'saved' }>> {
  const { data, error } = await table()
    .select('id, backlog_cycle, status')
    .eq('created_by', userId)
    .eq('backlog_start', start)
    .eq('client_label', clientLabel.trim());
  if (error) throw new Error(error.message);
  const out: Record<number, { id: string; status: 'draft' | 'saved' }> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (data ?? []) as any[]) {
    // An assigned note counts over a draft for the same cycle.
    if (r.backlog_cycle && out[r.backlog_cycle]?.status !== 'saved') out[r.backlog_cycle] = { id: r.id, status: r.status };
  }
  return out;
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await table().delete().eq('id', id).eq('status', 'draft');
  if (error) throw new Error(error.message);
}

/**
 * Record the note with its touchpoint. A draft being assigned becomes this
 * client's note; otherwise a new note is added.
 */
export async function saveWithTouchpoint(c: ComposedNote, contact: NoteContact, finalText: string, draftId?: string | null): Promise<void> {
  const row = { ...noteRow(c, contact, finalText), status: 'saved' };
  const { error } = draftId ? await table().update(row).eq('id', draftId) : await table().insert(row);
  if (error) throw new Error(error.message);
}
