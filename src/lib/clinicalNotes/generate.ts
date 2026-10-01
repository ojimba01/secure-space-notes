// Turns a case manager's selections into a progress note.
//
// Only what was selected or typed goes in. The note follows the usual order:
// why the contact happened, the consumer's update, what CM did, the result,
// the consumer's response, anything typed, and the next step. A section with
// nothing selected is left out rather than padded.
//
// `variant` picks among equivalent wordings, so "Regenerate wording" reads
// differently while saying exactly the same thing.
import {
  ACTIONS,
  BARRIERS,
  METHOD_MEANS,
  METHOD_PHRASES,
  NEXT_CM,
  NEXT_CONSUMER,
  NEXT_THIRD,
  RESPONSES,
  RESULTS,
  TERMS,
  THIRD_PARTIES,
  TIMING,
  choose,
  joinList,
  tidy,
  topicById,
  type Answers,
} from './config';

export const GENERATOR_VERSION = 'clinical-notes-template-v1';

export interface NoteDraft {
  /** Selected topics; the first is the primary one. */
  topics: string[];
  /** Topic-level answers, such as the benefit type. */
  topicContext: Record<string, Answers>;
  /** Per topic, the items picked and their answers, in the order picked. */
  items: Record<string, { id: string; answers: Answers }[]>;
  /** What CM did: group id → chosen options. "other" holds typed text. */
  actions: { group: string; options: string[] }[];
  actionsOther: string;
  result: { value: string; barrier?: string; barrierOther?: string } | null;
  response: string[];
  responseOther: string;
  next: {
    who: string;
    cm: string[];
    consumer: string[];
    third: string[];
    /** Who the third party is (Parent/guardian, Provider …). */
    thirdWho?: string;
    other: string;
    timing?: string;
    date?: string;
  } | null;
  freeText: string;
}

export const emptyDraft = (): NoteDraft => ({
  topics: [],
  topicContext: {},
  items: {},
  actions: [],
  actionsOther: '',
  result: null,
  response: [],
  responseOther: '',
  next: null,
  freeText: '',
});

export interface ContactFacts {
  /** client_contacts.modality, when known. */
  method?: string | null;
}

/** Whether an item has every required answer. */
export function itemComplete(topicId: string, itemId: string, answers: Answers): boolean {
  const item = topicById(topicId)?.items.find((i) => i.id === itemId);
  if (!item) return false;
  return item.questions.every((q) => {
    if (q.optional) return true;
    const a = answers[q.key];
    return Array.isArray(a) ? a.length > 0 : !!a;
  });
}

function purpose(draft: NoteDraft, contact: ContactFacts, v: number): string {
  const [primary, ...rest] = draft.topics.map((id) => topicById(id)).filter(Boolean) as NonNullable<ReturnType<typeof topicById>>[];
  if (!primary) return '';
  const about = [primary, ...rest].map((t) => t.purpose).filter(Boolean);
  const subject = about.length ? joinList(about) : '';
  const method = contact.method ?? 'other';

  // Care coordination is often with a provider, not the consumer.
  if (primary.id === 'care_coordination') {
    const means = METHOD_MEANS[method] ?? '';
    return `${TERMS.cm} completed care coordination for the ${TERMS.client}${means ? ` ${means}` : ''}${
      rest.length ? `, including ${joinList(rest.map((t) => t.purpose).filter(Boolean))}` : ''
    }.`;
  }
  const how = choose(v, METHOD_PHRASES[method] ?? METHOD_PHRASES.other);
  if (!subject) return `${TERMS.cm} ${how}.`;
  // A check-in reads "for a housing stability check-in"; the rest "regarding …".
  const joiner = primary.id === 'checkin' ? 'for' : 'regarding';
  return `${TERMS.cm} ${how} ${joiner} ${subject}.`;
}

function updates(draft: NoteDraft, v: number): string[] {
  const out: string[] = [];
  draft.topics.forEach((topicId, ti) => {
    const topic = topicById(topicId);
    if (!topic) return;
    for (const [ii, picked] of (draft.items[topicId] ?? []).entries()) {
      const item = topic.items.find((i) => i.id === picked.id);
      if (!item || !itemComplete(topicId, picked.id, picked.answers)) continue;
      out.push(...item.say(picked.answers, v + ti + ii, { topic: draft.topicContext[topicId] ?? {} }));
    }
  });
  return out;
}

function cmActions(draft: NoteDraft, v: number): string[] {
  const out: string[] = [];
  for (const [i, a] of draft.actions.entries()) {
    if (a.group === 'other') continue;
    const group = ACTIONS.find((g) => g.id === a.group);
    if (!group) continue;
    const phrases = a.options.map((o) => group.options[o]).filter(Boolean);
    if (phrases.length) out.push(group.say(phrases, v + i));
  }
  const typed = tidy(draft.actionsOther);
  if (draft.actions.some((a) => a.group === 'other') && typed) out.push(typed);
  return out;
}

function result(draft: NoteDraft, v: number): string[] {
  const r = draft.result;
  if (!r) return [];
  if (r.value === 'Barrier') {
    const b = r.barrier === 'Other' ? (r.barrierOther ?? '').trim() : BARRIERS[r.barrier ?? ''] ?? '';
    if (!b) return [choose(v, ['A barrier was identified.', 'A barrier was noted.'])];
    return [choose(v, [`A barrier was identified: ${b}.`, `Progress was limited by a barrier: ${b}.`])];
  }
  const list = RESULTS[r.value];
  return list?.length ? [choose(v, list)] : [];
}

function response(draft: NoteDraft, v: number): string[] {
  const out = draft.response
    .filter((r) => r !== 'Other')
    .map((r) => RESPONSES[r])
    .filter((l): l is string[] => !!l && l.length > 0)
    .map((l, i) => choose(v + i, l));
  const typed = tidy(draft.responseOther);
  if (draft.response.includes('Other') && typed) out.push(typed);
  return out;
}

function when(next: NonNullable<NoteDraft['next']>): string {
  if (next.timing === 'Specific date' && next.date) {
    const d = new Date(`${next.date}T12:00:00`);
    return `by ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
  }
  return next.timing ? TIMING[next.timing] ?? '' : '';
}

function nextSteps(draft: NoteDraft, v: number): string[] {
  const n = draft.next;
  if (!n) return [];
  if (n.who === 'None') return [choose(v, ['No further action is needed at this time.', 'No next step is needed at this time.'])];
  const timing = when(n);
  const tail = timing ? ` ${timing}` : '';
  const typed = n.other.trim();
  const phrases = (chosen: string[], map: Record<string, string>) =>
    chosen.map((c) => (c === 'Other' ? typed : map[c])).filter(Boolean);
  const out: string[] = [];

  if (n.who === 'CM' || n.who === 'Both') {
    const p = phrases(n.cm, NEXT_CM);
    if (p.length) out.push(choose(v, [`${TERMS.cm} will ${joinList(p)}${tail}.`, `${TERMS.cm} plans to ${joinList(p)}${tail}.`]));
  }
  if (n.who === 'Consumer' || n.who === 'Both') {
    const p = phrases(n.consumer, NEXT_CONSUMER);
    if (p.length) out.push(choose(v + 1, [`${TERMS.Client} will ${joinList(p)}${tail}.`, `${TERMS.Client} is to ${joinList(p)}${tail}.`]));
  }
  if (n.who === 'Third party') {
    const party = THIRD_PARTIES[n.thirdWho ?? ''] ?? 'a third party';
    const p = n.third.map((c) => (c === 'Other' ? typed : NEXT_THIRD[c]?.(party) ?? '')).filter(Boolean);
    if (!p.length && n.thirdWho) p.push(`a response from ${party}`);
    if (p.length) out.push(choose(v, [`Next step is pending ${joinList(p)}${tail}.`, `Awaiting ${joinList(p)}${tail}.`]));
  }
  if (!out.length && timing) out.push(`Next contact is planned ${timing}.`);
  return out;
}

/** The note for a draft, in wording `variant`. */
export function generateNote(draft: NoteDraft, contact: ContactFacts, variant = 0): string {
  const parts = [
    purpose(draft, contact, variant),
    ...updates(draft, variant),
    ...cmActions(draft, variant),
    ...result(draft, variant),
    ...response(draft, variant),
    tidy(draft.freeText),
    ...nextSteps(draft, variant),
  ].filter(Boolean);
  return parts.join(' ');
}

/** True when there is enough to write a note: a topic and one detail or action. */
export function canGenerate(draft: NoteDraft): boolean {
  if (!draft.topics.length) return false;
  const anyItem = draft.topics.some((t) => (draft.items[t] ?? []).some((p) => itemComplete(t, p.id, p.answers)));
  return anyItem || draft.actions.length > 0 || !!draft.freeText.trim();
}

// ---- the short "Selected" summary -----------------------------------------

export interface SummaryLine {
  heading: string;
  lines: string[];
}

const show = (a: string | string[] | undefined) => (Array.isArray(a) ? a.join(', ') : a ?? '');

export function summarize(draft: NoteDraft): SummaryLine[] {
  const out: SummaryLine[] = [];
  draft.topics.forEach((id, i) => {
    const topic = topicById(id);
    if (!topic) return;
    const lines: string[] = [];
    const ctx = topic.context ? show(draft.topicContext[id]?.[topic.context.key]) : '';
    if (ctx) lines.push(`Type: ${ctx}`);
    for (const p of draft.items[id] ?? []) {
      const item = topic.items.find((x) => x.id === p.id);
      if (!item) continue;
      const vals = item.questions.map((q) => show(p.answers[q.key])).filter(Boolean);
      lines.push(vals.length ? `${item.label}: ${vals.join(' → ')}` : `${item.label}: …`);
    }
    out.push({ heading: `${topic.label}${i === 0 && draft.topics.length > 1 ? ' (primary)' : ''}`, lines });
  });
  const acts = draft.actions.map((a) => {
    const g = ACTIONS.find((x) => x.id === a.group);
    if (a.group === 'other') return `Other${draft.actionsOther.trim() ? `: ${draft.actionsOther.trim()}` : ''}`;
    return `${g?.label ?? a.group}${a.options.length ? ` → ${a.options.join(', ')}` : ''}`;
  });
  if (acts.length) out.push({ heading: `${TERMS.cm} action`, lines: acts });
  if (draft.result) {
    const r = draft.result;
    out.push({
      heading: 'Result',
      lines: [r.value === 'Barrier' && r.barrier ? `Barrier → ${r.barrier === 'Other' ? r.barrierOther || 'Other' : r.barrier}` : r.value],
    });
  }
  if (draft.response.length) out.push({ heading: 'Client response', lines: [draft.response.join(', ')] });
  if (draft.next) {
    const n = draft.next;
    const what = [...(n.thirdWho ? [n.thirdWho] : []), ...n.cm, ...n.consumer, ...n.third].filter((x) => x !== 'Other');
    if (n.other.trim()) what.push(n.other.trim());
    const t = n.timing === 'Specific date' ? n.date ?? '' : n.timing ?? '';
    const who = n.who === 'Consumer' ? 'Client' : n.who;
    out.push({ heading: 'Next', lines: [[who, what.join(', '), t].filter(Boolean).join(' · ')] });
  }
  if (draft.freeText.trim()) out.push({ heading: 'Added detail', lines: [draft.freeText.trim()] });
  return out;
}
