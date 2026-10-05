// Turns a case manager's selections into a progress note.
//
// Only what was selected goes in, in the usual order: how the contact
// happened, what prompted it and the housing goal, the member's housing
// status, what happened in each category, what CM did, the result, the
// member's response, barriers, the next steps and the next contact. A section
// with nothing selected is left out rather than padded.
//
// Categories organize the screen and write nothing; only the answers beneath
// them do. What CM did, the result and barriers can be answered once for the
// whole contact or separately for each category.
//
// `variant` picks among equivalent wordings, so "Regenerate wording" reads
// differently while saying exactly the same thing.
import { ACTIONS, METHOD_PHRASES, TERMS, choose, joinList } from './config';
import {
  BARRIER,
  GOALS,
  HOUSING,
  HOUSING_CHANGE,
  NEXT_CONTACT,
  OWNER,
  PROMPTS,
  RESPONSE,
  RESULT,
  STEP_TIMING,
  UNABLE_BECAUSE,
  actionsFor,
  categoryById,
  categorySentences,
  emptyTree,
  type TreeState,
} from './tree';

export const GENERATOR_VERSION = 'clinical-notes-template-v2';

/** One next step: who, what and when. */
export interface NextStep {
  who: string;
  actions: string[];
  timing?: string;
}

/** The steps that can be answered once for every category, or separately for each. */
export const SPLIT_STEPS = ['actions', 'result', 'barriers'] as const;
export type SplitStep = (typeof SPLIT_STEPS)[number];

/** What CM did, the result and barriers: for the whole contact, or for one category. */
export interface ActivityPart {
  actions: { group: string; options: string[] }[];
  result: { value: string; reason?: string } | null;
  barriers: { list: string[] };
}

export const emptyPart = (): ActivityPart => ({ actions: [], result: null, barriers: { list: [] } });

export interface NoteDraft extends ActivityPart {
  /** 3 for the button-only answer tree. Notes from older builders have none and start over. */
  v: 3;
  /** The categories picked, the items picked in each, and their answers. */
  tree: TreeState;
  goals: string[];
  prompts: string[];
  /** The categories, for answering a step per category. Mirrors `tree.categories`. */
  activities: string[];
  housing: { status?: string; changed?: string };
  /** Steps answered separately for each category (only with more than one). */
  split: Partial<Record<SplitStep, boolean>>;
  /** Per category: its own actions, result and barriers, for the split steps. */
  byActivity: Record<string, ActivityPart>;
  response: string[];
  steps: NextStep[];
  noNextStep: boolean;
  nextContact: { kind?: string };
}

export const emptyDraft = (): NoteDraft => ({
  v: 3,
  tree: emptyTree(),
  goals: [],
  prompts: [],
  activities: [],
  housing: {},
  actions: [],
  result: null,
  barriers: { list: [] },
  split: {},
  byActivity: {},
  response: [],
  steps: [],
  noNextStep: false,
  nextContact: {},
});

/** A draft with every field present. Drafts from older builders start over. */
export function normalizeDraft(d: Partial<NoteDraft> | null | undefined): NoteDraft {
  const e = emptyDraft();
  if (d?.v !== 3) return e;
  const x: NoteDraft = { ...e, ...d, v: 3 };
  x.tree = { ...emptyTree(), ...(d.tree ?? {}) };
  x.activities = [...x.tree.categories];
  x.housing = { ...(d.housing ?? {}) };
  x.barriers = { list: [...(d.barriers?.list ?? [])] };
  x.nextContact = { ...(d.nextContact ?? {}) };
  x.split = { ...(d.split ?? {}) };
  x.byActivity = Object.fromEntries(
    Object.entries(d.byActivity ?? {}).map(([k, p]) => [k, { ...emptyPart(), ...p, barriers: { list: [...(p?.barriers?.list ?? [])] } }]),
  );
  return x;
}

/** Whether a step is answered separately for each category. Needs two or more. */
export const isSplit = (d: NoteDraft, step: SplitStep) => d.activities.length > 1 && !!d.split[step];

/** One category's part (empty until something is picked). */
export const partFor = (d: NoteDraft, id: string): ActivityPart => d.byActivity[id] ?? emptyPart();

/** How a category is named on screen. */
export const activityLabel = (id: string) => categoryById(id)?.label ?? id;

export interface ContactFacts {
  /** client_contacts.modality, when known. */
  method?: string | null;
}

// ---- the note ---------------------------------------------------------------

function cmActions(p: ActivityPart, v: number): string[] {
  const out: string[] = [];
  for (const [i, a] of p.actions.entries()) {
    const group = ACTIONS.find((g) => g.id === a.group);
    const phrases = a.options.map((o) => group?.options[o]).filter((x): x is string => !!x);
    if (group && phrases.length) out.push(group.say(phrases, v + i));
  }
  return out;
}

/** "Regarding housing assistance, CM reviewed the lease." The first sentence carries the category. */
function regarding(phrase: string, sentences: string[]): string[] {
  if (!sentences.length || !phrase) return sentences;
  const [first, ...rest] = sentences;
  const lead = first.startsWith(`${TERMS.cm} `) ? first : first[0].toLowerCase() + first.slice(1);
  return [`Regarding ${phrase}, ${lead}`, ...rest];
}

function resultSentences(p: ActivityPart): string[] {
  const r = p.result;
  if (!r) return [];
  if (r.value === 'Unable to complete' && r.reason && UNABLE_BECAUSE[r.reason]) return [`The activity could not be completed because ${UNABLE_BECAUSE[r.reason]}.`];
  return RESULT[r.value] ? [RESULT[r.value]] : [];
}

function barrierSentences(p: ActivityPart): string[] {
  const list = p.barriers.list;
  if (list.includes('No barrier identified')) return ['No barriers were identified.'];
  if (list.includes('Barrier not assessed')) return ['Barriers were not assessed.'];
  const ph = list.map((b) => BARRIER[b]).filter(Boolean);
  return ph.length ? [`Barriers identified: ${joinList(ph)}.`] : [];
}

function stepSentences(s: NextStep): string[] {
  const owner = OWNER[s.who];
  if (!owner) return [];
  const map = actionsFor(s.who);
  const acts = s.actions.map((a) => map[a]).filter(Boolean);
  if (!acts.length) return [];
  const out = [`${owner} will ${joinList(acts)}${STEP_TIMING[s.timing ?? ''] ?? ''}.`];
  if (s.timing === 'Timing not confirmed') out.push('Timing has not been confirmed.');
  return out;
}

/** Sentences in order, each written once (two answers can say the same thing). */
const once = (list: string[]) => [...new Set(list.filter(Boolean))];

function writeNote(draft: NoteDraft, contact: ContactFacts, v: number): string {
  const t = draft.tree;
  const method = contact.method ?? 'other';
  const out: string[] = [`${TERMS.cm} ${choose(v, METHOD_PHRASES[method] ?? METHOD_PHRASES.other)}.`];
  const prompts = draft.prompts.map((p) => PROMPTS[p]).filter(Boolean);
  if (prompts.length) out.push(`The contact was prompted by ${joinList(prompts)}.`);
  const goals = draft.goals.map((g) => GOALS[g]).filter(Boolean);
  if (goals.length) out.push(`This contact supported the member's ${goals.length === 1 ? 'goal' : 'goals'} to ${joinList(goals)}.`);
  if (HOUSING[draft.housing.status ?? '']) out.push(HOUSING[draft.housing.status!]);
  if (HOUSING_CHANGE[draft.housing.changed ?? '']) out.push(HOUSING_CHANGE[draft.housing.changed!]);
  // Categories write nothing themselves; the answers beneath them do.
  for (const c of t.categories) out.push(...categorySentences(t, c));
  // A step answered once covers the whole contact; one answered per category reads under it.
  if (!isSplit(draft, 'actions')) out.push(...cmActions(draft, v));
  const split = SPLIT_STEPS.filter((st) => isSplit(draft, st));
  if (split.length) {
    for (const [i, id] of draft.activities.entries()) {
      const part = partFor(draft, id);
      const group = [
        ...(split.includes('actions') ? cmActions(part, v + i) : []),
        ...(split.includes('result') ? resultSentences(part) : []),
        ...(split.includes('barriers') ? barrierSentences(part) : []),
      ];
      out.push(...regarding((categoryById(id)?.label ?? '').toLowerCase(), group));
    }
  }
  if (!isSplit(draft, 'result')) out.push(...resultSentences(draft));
  out.push(...draft.response.map((r) => RESPONSE[r]).filter(Boolean));
  if (!isSplit(draft, 'barriers')) out.push(...barrierSentences(draft));
  if (draft.noNextStep) out.push('No next step was identified.');
  else out.push(...draft.steps.flatMap(stepSentences));
  if (NEXT_CONTACT[draft.nextContact.kind ?? '']) out.push(NEXT_CONTACT[draft.nextContact.kind!]);
  return once(out).join(' ');
}

/** The note for a draft, in wording `variant`. */
export function generateNote(input: NoteDraft, contact: ContactFacts, variant = 0): string {
  return writeNote(normalizeDraft(input), contact, variant);
}

/** True when there is enough to write a note: a specific answer beneath a category, not a category alone. */
export function canGenerate(input: NoteDraft): boolean {
  const t = normalizeDraft(input).tree;
  return t.categories.some((c) => categorySentences(t, c).length > 0);
}

// ---- the short "Selected" summary -----------------------------------------

export interface SummaryLine {
  heading: string;
  lines: string[];
}

export function summarize(input: NoteDraft): SummaryLine[] {
  const draft = normalizeDraft(input);
  const out: SummaryLine[] = [];
  const t = draft.tree;
  for (const id of t.categories) {
    const c = categoryById(id);
    if (!c) continue;
    const lines = (t.picks[id] ?? []).map((p) => c.items.find((i) => i.id === p)?.label ?? p).filter((l) => l);
    const answered = Object.entries(t.answers)
      .filter(([k, a]) => k.startsWith(`${id}.`) && (Array.isArray(a) ? a.length : a))
      .map(([, a]) => (Array.isArray(a) ? a.join(', ') : a!));
    if (lines.length) out.push({ heading: c.label, lines: [...lines, ...answered.map((a) => `→ ${a}`)] });
  }
  if (draft.goals.length) out.push({ heading: 'Housing goal', lines: draft.goals });
  if (draft.prompts.length) out.push({ heading: 'Prompted by', lines: draft.prompts });
  const hs = [draft.housing.status, draft.housing.changed].filter(Boolean) as string[];
  if (hs.length) out.push({ heading: 'Housing status', lines: hs });
  const partLines = (p: ActivityPart, step: SplitStep): string[] => {
    if (step === 'actions')
      return p.actions.map((a) => {
        const g = ACTIONS.find((x) => x.id === a.group);
        return `${g?.label ?? a.group}${a.options.length ? ` → ${a.options.join(', ')}` : ''}`;
      });
    if (step === 'result') return p.result ? [p.result.reason ? `${p.result.value} → ${p.result.reason}` : p.result.value] : [];
    return p.barriers.list;
  };
  const HEAD: Record<SplitStep, string> = { actions: `${TERMS.cm} actions`, result: 'Result', barriers: 'Barriers' };
  for (const step of SPLIT_STEPS) {
    if (isSplit(draft, step)) {
      for (const id of draft.activities) {
        const lines = partLines(partFor(draft, id), step);
        if (lines.length) out.push({ heading: `${HEAD[step]}: ${activityLabel(id)}`, lines });
      }
    } else {
      const lines = partLines(draft, step);
      if (lines.length) out.push({ heading: HEAD[step], lines });
    }
  }
  if (draft.response.length) out.push({ heading: 'Member response', lines: [draft.response.join(', ')] });
  if (draft.noNextStep) out.push({ heading: 'Next steps', lines: ['No next step identified'] });
  else if (draft.steps.length) out.push({ heading: 'Next steps', lines: draft.steps.map((s) => [s.who, s.actions.join(', '), s.timing].filter(Boolean).join(' · ')) });
  if (draft.nextContact.kind) out.push({ heading: 'Next contact', lines: [draft.nextContact.kind] });
  return out;
}
