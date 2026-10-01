// Saving clinical notes: the structured selections and the narrative together.
//
// The selections are the record of what happened; the narrative is how it was
// written up. Both are kept so the facts behind any note can be audited.
import { supabase } from '@/integrations/supabase/client';
import type { ComposedNote } from '@/components/clinicalNotes/NoteComposer';

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
  const d = c.draft;
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
    primary_topic: d.topics[0] ?? null,
    secondary_topics: d.topics.slice(1),
    selections: d,
    interventions: d.actions.map((a) => (a.group === 'other' ? { group: 'other', text: d.actionsOther.trim() } : a)),
    consumer_response: d.response.map((r) => (r === 'Other' ? { other: d.responseOther.trim() } : r)),
    outcome: d.result,
    barriers: d.result?.value === 'Barrier' && d.result.barrier ? [d.result.barrier === 'Other' ? d.result.barrierOther ?? 'Other' : d.result.barrier] : [],
    next_actions: d.next,
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
  final_narrative: string;
  primary_topic: string | null;
  /** Manual entry: the name typed to organize drafts. Not in the note text. */
  client_label: string | null;
  composed: ComposedNote;
}

/** Save a draft that belongs to no client yet. */
export async function saveDraft(c: ComposedNote, contactMethod: string | null, id?: string, clientLabel?: string | null): Promise<string> {
  const row = { ...noteRow(c, { contactMethod }), status: 'draft', client_label: clientLabel?.trim() || null };
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
    .select('id, created_at, updated_at, contact_method, final_narrative, generated_narrative, generator, reviewed_at, primary_topic, client_label, selections')
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
    final_narrative: r.final_narrative ?? '',
    primary_topic: r.primary_topic,
    client_label: r.client_label ?? null,
    composed: {
      draft: r.selections,
      generated: r.generated_narrative ?? '',
      final: r.final_narrative ?? '',
      generator: r.generator ?? '',
      reviewedAt: r.reviewed_at ?? new Date().toISOString(),
    },
  }));
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
