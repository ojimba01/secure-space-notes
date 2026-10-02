// Turns a case manager's selections into a progress note.
//
// Only what was selected or typed goes in. The note follows the usual order:
// why the contact happened (the activities, what prompted it and the housing
// goal), the member's housing status, the details, what CM did, the result,
// barriers, the member's response, anything typed, the next steps and the next
// contact. A section with nothing selected is left out rather than padded.
//
// Activity, action, result and next step are kept apart: the activity says why
// the contact took place, the action what CM actually did. Each choice makes
// one claim, and nothing is written from a heading alone.
//
// `variant` picks among equivalent wordings, so "Regenerate wording" reads
// differently while saying exactly the same thing.
//
// Older drafts (picked topics instead of activities, one "next" instead of
// separate steps, a barrier as the result) still read as they did.
import {
  ACTIONS,
  BARRIERS,
  BARRIER_LIST,
  HOUSING_CHANGED,
  HOUSING_STATUS,
  METHOD_MEANS,
  METHOD_PHRASES,
  NEXT_CM,
  NEXT_CONSUMER,
  NEXT_CONTACT_TIMEFRAMES,
  NEXT_THIRD,
  NEXT_WHO_LABELS,
  RESPONSES,
  RESULTS,
  SPECIFIC_DATE,
  TERMS,
  THIRD_PARTIES,
  TIMING,
  activityById,
  choose,
  joinList,
  tidy,
  topicById,
  type Answers,
  type Section,
} from './config';

export const GENERATOR_VERSION = 'clinical-notes-template-v2';

/** One next step: who, what, when, and the goal it supports. */
export interface NextStep {
  who: string;
  actions: string[];
  /** Who the third party is (Landlord, Provider …). */
  thirdWho?: string;
  /** Typed text for Other. */
  other: string;
  timing?: string;
  date?: string;
  goal: string;
}

export interface NoteDraft {
  /** The housing support activities that took place, in the order picked. */
  activities: string[];
  /** Typed for "Other activity". */
  activityOther: string;
  /** Detail sections added beyond what the activities open (Voucher, Legal …). */
  extraSections: string[];
  /** The member's housing goal this contact supported, as typed. */
  goal: string;
  /** What prompted the contact, as typed. */
  reason: string;
  housing: { status?: string; changed?: string; change: string };
  /** Detail sections shown; the first is the primary one. Follows the activities. */
  topics: string[];
  /** Topic-level answers, such as the benefit type. */
  topicContext: Record<string, Answers>;
  /** Per topic, the items picked and their answers, in the order picked. */
  items: Record<string, { id: string; answers: Answers }[]>;
  /** What CM did: group id → chosen options. "other" holds typed text. */
  actions: { group: string; options: string[] }[];
  actionsOther: string;
  /** Words typed for an action option that asks for them, keyed "group:option". */
  actionText: Record<string, string>;
  result: { value: string; barrier?: string; barrierOther?: string } | null;
  barriers: { answer?: string; list: string[]; other: string; impact: string };
  response: string[];
  responseOther: string;
  /** Next steps, one per responsible party and action. */
  steps: NextStep[];
  noNextStep: boolean;
  nextContact: { kind?: string; date?: string; timeframe?: string };
  /** Older drafts: one next step for several people. */
  next?: {
    /** CM, Consumer, Third party, or None alone. A single string in the oldest drafts. */
    who: string[] | string;
    cm: string[];
    consumer: string[];
    third: string[];
    thirdWho?: string;
    other: string;
    timing?: string;
    date?: string;
  } | null;
  freeText: string;
}

export const emptyDraft = (): NoteDraft => ({
  activities: [],
  activityOther: '',
  extraSections: [],
  goal: '',
  reason: '',
  housing: { change: '' },
  topics: [],
  topicContext: {},
  items: {},
  actions: [],
  actionsOther: '',
  actionText: {},
  result: null,
  barriers: { list: [], other: '', impact: '' },
  response: [],
  responseOther: '',
  steps: [],
  noNextStep: false,
  nextContact: {},
  next: null,
  freeText: '',
});

/** A draft with every field present, whatever version saved it. */
export function normalizeDraft(d: Partial<NoteDraft> | null | undefined): NoteDraft {
  const e = emptyDraft();
  const x = { ...e, ...(d ?? {}) } as NoteDraft;
  x.housing = { ...e.housing, ...(d?.housing ?? {}) };
  x.barriers = { ...e.barriers, ...(d?.barriers ?? {}) };
  x.nextContact = { ...(d?.nextContact ?? {}) };
  return x;
}

export interface ContactFacts {
  /** client_contacts.modality, when known. */
  method?: string | null;
}

// ---- which detail questions show --------------------------------------------

/** The detail sections the activities and added sections open, merged by topic. */
export function sectionsOf(d: NoteDraft): Section[] {
  const out: Section[] = [];
  const add = (s: Section) => {
    const cur = out.find((x) => x.topic === s.topic);
    if (!cur) out.push({ ...s, items: s.items ? [...s.items] : undefined });
    else if (!s.items) cur.items = undefined;
    else if (cur.items) cur.items = [...new Set([...cur.items, ...s.items])];
  };
  for (const id of d.activities ?? []) for (const s of activityById(id)?.sections ?? []) add(s);
  for (const t of d.extraSections ?? []) add({ topic: t });
  return out;
}

/** Items of a topic that can be picked, or null for all of them. */
export function allowedItems(d: NoteDraft, topicId: string): string[] | null {
  if (!(d.activities ?? []).length && !(d.extraSections ?? []).length) return null; // older drafts
  return sectionsOf(d).find((s) => s.topic === topicId)?.items ?? null;
}

/** Bring the shown sections in line with the activities, dropping answers for anything no longer shown. */
export function syncSections(d: NoteDraft): NoteDraft {
  const secs = sectionsOf(d);
  d.topics = secs.map((s) => s.topic);
  for (const t of Object.keys(d.items)) {
    const s = secs.find((x) => x.topic === t);
    if (!s) delete d.items[t];
    else if (s.items) d.items[t] = d.items[t].filter((p) => s.items!.includes(p.id));
  }
  for (const t of Object.keys(d.topicContext)) if (!secs.some((x) => x.topic === t)) delete d.topicContext[t];
  return d;
}

/** Whether a question is asked, given the answers so far. */
export const asked = (q: { showIf?: (a: Answers) => boolean }, a: Answers) => !q.showIf || q.showIf(a);

/** Whether an item has every required answer. */
export function itemComplete(topicId: string, itemId: string, answers: Answers): boolean {
  const item = topicById(topicId)?.items.find((i) => i.id === itemId);
  if (!item) return false;
  return item.questions.every((q) => {
    if (q.optional || !asked(q, answers)) return true;
    const a = answers[q.key];
    return Array.isArray(a) ? a.length > 0 : !!(typeof a === 'string' ? a.trim() : a);
  });
}

// ---- the note ---------------------------------------------------------------

const longDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

/** The activities as they read: typed text for Other. */
function activityPhrases(d: NoteDraft): string[] {
  return d.activities.map((id) => (id === 'other' ? d.activityOther.trim() : activityById(id)?.phrase ?? '')).filter(Boolean);
}

function purpose(draft: NoteDraft, contact: ContactFacts, v: number): string[] {
  const method = contact.method ?? 'other';
  const how = choose(v, METHOD_PHRASES[method] ?? METHOD_PHRASES.other);
  const out: string[] = [];
  if (draft.activities.length) {
    const p = activityPhrases(draft);
    const coordinationOnly = draft.activities.every((id) => activityById(id)?.coordination);
    if (!p.length) out.push(`${TERMS.cm} ${how}.`);
    else if (coordinationOnly) {
      // Coordination is often with a provider, not the member.
      const means = METHOD_MEANS[method] ?? '';
      out.push(`${TERMS.cm} completed ${joinList(p)} for the ${TERMS.client}${means ? ` ${means}` : ''}.`);
    } else out.push(`${TERMS.cm} ${how} regarding ${joinList(p)}.`);
  } else {
    // Older drafts: the topics say what it was about.
    const [primary, ...rest] = draft.topics.map((id) => topicById(id)).filter(Boolean) as NonNullable<ReturnType<typeof topicById>>[];
    if (!primary) return [];
    const about = [primary, ...rest].map((t) => t.purpose).filter(Boolean);
    if (primary.id === 'care_coordination') {
      const means = METHOD_MEANS[method] ?? '';
      out.push(`${TERMS.cm} completed care coordination for the ${TERMS.client}${means ? ` ${means}` : ''}${
        rest.length ? `, including ${joinList(rest.map((t) => t.purpose).filter(Boolean))}` : ''
      }.`);
    } else if (!about.length) out.push(`${TERMS.cm} ${how}.`);
    else out.push(`${TERMS.cm} ${how} ${primary.id === 'checkin' ? 'for' : 'regarding'} ${joinList(about)}.`);
  }
  const reason = tidy(draft.reason);
  if (reason) out.push(`Reason for contact: ${reason}`);
  const goal = tidy(draft.goal);
  if (goal) out.push(`Housing goal: ${goal}`);
  return out;
}

function housing(draft: NoteDraft, v: number): string[] {
  const h = draft.housing;
  const out: string[] = [];
  const s = HOUSING_STATUS[h.status ?? ''];
  if (s) out.push(choose(v, s));
  const c = HOUSING_CHANGED[h.changed ?? ''];
  if (c) out.push(c);
  const what = tidy(h.change);
  if (h.changed === 'Yes' && what) out.push(`Change reported: ${what}`);
  return out;
}

function updates(draft: NoteDraft, v: number): string[] {
  const out: string[] = [];
  draft.topics.forEach((topicId, ti) => {
    const topic = topicById(topicId);
    if (!topic) return;
    const allowed = allowedItems(draft, topicId);
    for (const [ii, picked] of (draft.items[topicId] ?? []).entries()) {
      if (allowed && !allowed.includes(picked.id)) continue;
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
    const phrases = a.options
      .map((o) => {
        const typed = (draft.actionText?.[`${a.group}:${o}`] ?? '').trim();
        const detail = group.detail?.[o];
        return detail && typed ? detail.phrase(typed) : group.options[o];
      })
      .filter(Boolean);
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
    // Older drafts picked a barrier as the result.
    const b = r.barrier === 'Other' ? (r.barrierOther ?? '').trim() : BARRIERS[r.barrier ?? ''] ?? '';
    if (!b) return [choose(v, ['A barrier was identified.', 'A barrier was noted.'])];
    return [choose(v, [`A barrier was identified: ${b}.`, `Progress was limited by a barrier: ${b}.`])];
  }
  const list = RESULTS[r.value];
  return list?.length ? [choose(v, list)] : [];
}

function barriers(draft: NoteDraft, v: number): string[] {
  const b = draft.barriers;
  if (b.answer === 'No') return [choose(v, ['No barriers were identified.', 'No barriers were noted.'])];
  if (b.answer === 'Not assessed') return ['Barriers were not assessed.'];
  if (b.answer !== 'Yes') return [];
  const out: string[] = [];
  const list = b.list.map((x) => (x === 'Other barrier' ? b.other.trim() : BARRIER_LIST[x])).filter(Boolean);
  if (list.length) out.push(choose(v, [`Barriers affecting the housing goal: ${joinList(list)}.`, `The housing goal was affected by ${joinList(list)}.`]));
  const impact = tidy(b.impact);
  if (impact) out.push(`Impact on the housing goal: ${impact}`);
  return out;
}

function response(draft: NoteDraft, v: number): string[] {
  const out = draft.response
    .filter((r) => r !== 'Other' && r !== 'Other response')
    .map((r) => RESPONSES[r])
    .filter((l): l is string[] => !!l && l.length > 0)
    .map((l, i) => choose(v + i, l));
  const typed = tidy(draft.responseOther);
  if (draft.response.some((r) => r === 'Other' || r === 'Other response') && typed) out.push(typed);
  return out;
}

function whenText(timing?: string, date?: string): string {
  if (timing === SPECIFIC_DATE && date) return `by ${longDate(date)}`;
  return timing ? TIMING[timing] ?? '' : '';
}

/** One next step as a sentence, with its goal when it differs from the contact's. */
function stepSentences(draft: NoteDraft, s: NextStep, v: number): string[] {
  const timing = whenText(s.timing, s.date);
  const tail = timing ? ` ${timing}` : '';
  const typed = s.other.trim();
  const out: string[] = [];
  if (s.who === 'Third party') {
    const party = THIRD_PARTIES[s.thirdWho ?? ''] ?? 'a third party';
    const p = s.actions.map((c) => (c === 'Other' ? typed : NEXT_THIRD[c]?.(party) ?? '')).filter(Boolean);
    if (!p.length && s.thirdWho) p.push(`a response from ${party}`);
    if (p.length) out.push(choose(v, [`Next step is pending ${joinList(p)}${tail}.`, `Awaiting ${joinList(p)}${tail}.`]));
  } else {
    const map = s.who === 'CM' ? NEXT_CM : NEXT_CONSUMER;
    const p = s.actions.map((c) => (c === 'Other' ? typed : map[c])).filter(Boolean);
    const who = s.who === 'CM' ? TERMS.cm : TERMS.Client;
    if (p.length) out.push(choose(v, [`${who} will ${joinList(p)}${tail}.`, `${who} ${s.who === 'CM' ? 'plans to' : 'is to'} ${joinList(p)}${tail}.`]));
  }
  const goal = tidy(s.goal);
  if (out.length && goal && goal !== tidy(draft.goal)) out.push(`This step supports the housing goal: ${goal}`);
  return out;
}

/** Older drafts: who is responsible for the one next step ("Both" was CM and the member). */
export function nextWho(next: NoteDraft['next']): string[] {
  if (!next) return [];
  const w = next.who;
  if (Array.isArray(w)) return w;
  return w === 'Both' ? ['CM', 'Consumer'] : w ? [w] : [];
}

function legacyNext(draft: NoteDraft, v: number): string[] {
  const n = draft.next;
  if (!n) return [];
  const who = nextWho(n);
  if (!who.length) return [];
  if (who.includes('None')) return [choose(v, ['No further action is needed at this time.', 'No next step is needed at this time.'])];
  const steps: NextStep[] = [];
  const base = { other: n.other, timing: n.timing, date: n.date, goal: '' };
  if (who.includes('CM')) steps.push({ ...base, who: 'CM', actions: n.cm });
  if (who.includes('Consumer')) steps.push({ ...base, who: 'Member', actions: n.consumer });
  if (who.includes('Third party')) steps.push({ ...base, who: 'Third party', actions: n.third, thirdWho: n.thirdWho });
  const out = steps.flatMap((s, i) => stepSentences(draft, s, v + i));
  const timing = whenText(n.timing, n.date);
  if (!out.length && timing) out.push(`Next contact is planned ${timing}.`);
  return out;
}

function nextSteps(draft: NoteDraft, v: number): string[] {
  if (draft.noNextStep) return [choose(v, ['No next step was identified.', 'No next step was identified at this time.'])];
  if (draft.steps.length) return draft.steps.flatMap((s, i) => stepSentences(draft, s, v + i));
  return legacyNext(draft, v);
}

function nextContact(draft: NoteDraft): string[] {
  const n = draft.nextContact;
  if (n.kind === 'Specific date' && n.date) return [`Next contact is planned for ${longDate(n.date)}.`];
  if (n.kind === 'Timeframe' && n.timeframe && NEXT_CONTACT_TIMEFRAMES[n.timeframe]) return [`Next contact is planned ${NEXT_CONTACT_TIMEFRAMES[n.timeframe]}.`];
  if (n.kind === 'Not yet scheduled') return ['Next contact is not yet scheduled.'];
  return [];
}

/** The note for a draft, in wording `variant`. */
export function generateNote(input: NoteDraft, contact: ContactFacts, variant = 0): string {
  const draft = normalizeDraft(input);
  const parts = [
    ...purpose(draft, contact, variant),
    ...housing(draft, variant),
    ...updates(draft, variant),
    ...cmActions(draft, variant),
    ...result(draft, variant),
    ...barriers(draft, variant),
    ...response(draft, variant),
    tidy(draft.freeText),
    ...nextSteps(draft, variant),
    ...nextContact(draft),
  ].filter(Boolean);
  return parts.join(' ');
}

/** True when there is enough to write a note: an activity (or older topic) and something said. */
export function canGenerate(input: NoteDraft): boolean {
  const draft = normalizeDraft(input);
  if (draft.activities.length) return activityPhrases(draft).length > 0;
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

export function summarize(input: NoteDraft): SummaryLine[] {
  const draft = normalizeDraft(input);
  const out: SummaryLine[] = [];
  if (draft.activities.length) {
    const lines = draft.activities.map((id) => (id === 'other' ? `Other: ${draft.activityOther.trim() || '…'}` : activityById(id)?.label ?? id));
    out.push({ heading: 'Activities', lines });
  }
  const why = [draft.reason.trim() && `Reason: ${draft.reason.trim()}`, draft.goal.trim() && `Goal: ${draft.goal.trim()}`].filter(Boolean) as string[];
  if (why.length) out.push({ heading: 'Reason and goal', lines: why });
  const h = draft.housing;
  const hl = [h.status, h.changed && `Changed: ${h.changed}${h.changed === 'Yes' && h.change.trim() ? ` → ${h.change.trim()}` : ''}`].filter(Boolean) as string[];
  if (hl.length) out.push({ heading: 'Housing status', lines: hl });
  draft.topics.forEach((id, i) => {
    const topic = topicById(id);
    if (!topic) return;
    const lines: string[] = [];
    const ctx = topic.context ? show(draft.topicContext[id]?.[topic.context.key]) : '';
    if (ctx) lines.push(`Type: ${ctx}`);
    for (const p of draft.items[id] ?? []) {
      const item = topic.items.find((x) => x.id === p.id);
      if (!item) continue;
      const vals = item.questions.filter((q) => asked(q, p.answers)).map((q) => show(p.answers[q.key])).filter(Boolean);
      lines.push(vals.length ? `${item.label}: ${vals.join(' → ')}` : item.questions.length ? `${item.label}: …` : item.label);
    }
    // With activities, a section only shows in the summary once something in it is picked.
    if (!lines.length && draft.activities.length) return;
    out.push({ heading: `${topic.label}${i === 0 && draft.topics.length > 1 && !draft.activities.length ? ' (primary)' : ''}`, lines });
  });
  const acts = draft.actions.map((a) => {
    const g = ACTIONS.find((x) => x.id === a.group);
    if (a.group === 'other') return `Other${draft.actionsOther.trim() ? `: ${draft.actionsOther.trim()}` : ''}`;
    const opts = a.options.map((o) => {
      const t = (draft.actionText?.[`${a.group}:${o}`] ?? '').trim();
      return t ? `${o} (${t})` : o;
    });
    return `${g?.label ?? a.group}${opts.length ? ` → ${opts.join(', ')}` : ''}`;
  });
  if (acts.length) out.push({ heading: `${TERMS.cm} actions`, lines: acts });
  if (draft.result) {
    const r = draft.result;
    out.push({
      heading: 'Result',
      lines: [r.value === 'Barrier' && r.barrier ? `Barrier → ${r.barrier === 'Other' ? r.barrierOther || 'Other' : r.barrier}` : r.value],
    });
  }
  const b = draft.barriers;
  if (b.answer) {
    const list = b.list.map((x) => (x === 'Other barrier' && b.other.trim() ? b.other.trim() : x));
    out.push({ heading: 'Barriers', lines: [b.answer === 'Yes' && list.length ? list.join(', ') : b.answer, ...(b.answer === 'Yes' && b.impact.trim() ? [`Impact: ${b.impact.trim()}`] : [])] });
  }
  if (draft.response.length) out.push({ heading: 'Member response', lines: [draft.response.join(', ')] });
  if (draft.noNextStep) out.push({ heading: 'Next steps', lines: ['No next step identified'] });
  else if (draft.steps.length) {
    out.push({
      heading: 'Next steps',
      lines: draft.steps.map((s) => {
        const what = [...(s.thirdWho ? [s.thirdWho] : []), ...s.actions.filter((x) => x !== 'Other'), ...(s.other.trim() ? [s.other.trim()] : [])];
        const t = s.timing === SPECIFIC_DATE ? s.date ?? '' : s.timing ?? '';
        return [NEXT_WHO_LABELS[s.who] ?? s.who, what.join(', '), t].filter(Boolean).join(' · ');
      }),
    });
  } else if (draft.next) {
    const n = draft.next;
    const what = [...(n.thirdWho ? [n.thirdWho] : []), ...n.cm, ...n.consumer, ...n.third].filter((x) => x !== 'Other');
    if (n.other.trim()) what.push(n.other.trim());
    const t = n.timing === SPECIFIC_DATE ? n.date ?? '' : n.timing ?? '';
    const who = nextWho(n).map((w) => NEXT_WHO_LABELS[w] ?? w).join(', ');
    if (who) out.push({ heading: 'Next', lines: [[who, what.join(', '), t].filter(Boolean).join(' · ')] });
  }
  const nc = draft.nextContact;
  if (nc.kind) out.push({ heading: 'Next contact', lines: [nc.kind === 'Specific date' ? nc.date || 'Specific date' : nc.kind === 'Timeframe' ? nc.timeframe || 'Timeframe' : nc.kind] });
  if (draft.freeText.trim()) out.push({ heading: 'Added detail', lines: [draft.freeText.trim()] });
  return out;
}
