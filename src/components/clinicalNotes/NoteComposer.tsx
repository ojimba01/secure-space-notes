// The clinical note builder: buttons only, one question opening the next.
//
// The categories at the top organize the screen and write nothing. Picking one
// opens its specific answers; each answer writes one definite statement and
// may open the next question (an application status after an application,
// a status for each document). Goal, prompt, housing status, what CM did, the
// result, the member's response, barriers and next steps follow, each a row of
// buttons. Generate note sits at the bottom, once everything is answered.
//
// The note is written only from what is selected here (src/lib/clinicalNotes).
// Nothing is saved until the case manager has reviewed it and ticked the
// confirmation.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, Pencil, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ACTIONS, TERMS, contactWord, joinList } from '@/lib/clinicalNotes/config';
import {
  BARRIER,
  BARRIER_ALONE,
  CATEGORIES,
  GOALS,
  HOUSING,
  HOUSING_CHANGE,
  NEXT_CONTACT,
  NOT_LISTED,
  OWNER,
  PROMPTS,
  RESPONSE,
  RESULT,
  STEP_TIMING,
  UNABLE_BECAUSE,
  actionsFor,
  answerKey,
  askedFor,
  categoryById,
  categoryComplete,
  TOUCHPOINT_TYPE,
  type Category,
  type TreeQuestion,
} from '@/lib/clinicalNotes/tree';
import {
  GENERATOR_VERSION,
  activityLabel,
  canGenerate,
  emptyPart,
  generateNote,
  isSplit,
  normalizeDraft,
  partFor,
  summarize,
  type ActivityPart,
  type NextStep,
  type NoteDraft,
  type SplitStep,
} from '@/lib/clinicalNotes/generate';
import { aiWordingAvailable, rewordWithAi } from '@/lib/clinicalNotes/ai';

export interface ComposedNote {
  draft: NoteDraft;
  /** The note as generated, before any edits. */
  generated: string;
  /** The note as reviewed, with any edits. */
  final: string;
  /** Which writer produced `generated`. */
  generator: string;
  reviewedAt: string;
}

// ---- small pieces ---------------------------------------------------------

export const Chip: React.FC<{
  selected?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  size?: 'md' | 'sm';
  className?: string;
}> = ({ selected, onClick, children, size = 'md', className }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={!!selected}
    className={cn(
      'rounded-full border font-medium transition-colors',
      size === 'md' ? 'px-4 py-2 text-sm' : 'px-3 py-1 text-xs',
      selected
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-white text-foreground hover:border-primary/60 hover:bg-primary/5',
      className,
    )}
  >
    {children}
  </button>
);

const Step: React.FC<{
  n: number;
  title: string;
  hint?: string;
  onSkip?: () => void;
  children: React.ReactNode;
}> = ({ n, title, hint, onSkip, children }) => (
  <section className="space-y-3 rounded-xl border bg-white p-4">
    <div className="flex items-center gap-2.5">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{n}</span>
      <h3 className="font-semibold">{title}</h3>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      {onSkip && (
        <button type="button" onClick={onSkip} className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline">
          Skip
        </button>
      )}
    </div>
    {children}
  </section>
);

/** A labelled question inside a step. */
const Ask: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <p className="text-sm font-medium">
      {label}
      {hint && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span>}
    </p>
    {children}
  </div>
);

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** A row of buttons: one answer, or several. Picking the chosen single answer again clears it. */
const Choices: React.FC<{
  options: string[];
  value: string | string[] | undefined;
  multi?: boolean;
  size?: 'md' | 'sm';
  onChange: (v: string | string[] | undefined) => void;
}> = ({ options, value, multi, size = 'sm', onChange }) => (
  <div className="flex flex-wrap gap-2">
    {options.map((o) => (
      <Chip
        key={o}
        size={size}
        selected={asList(value).includes(o)}
        onClick={() => (multi ? onChange(toggle(asList(value), o)) : onChange(value === o ? undefined : o))}
      >
        {o}
      </Chip>
    ))}
  </div>
);

const emptyStep = (): NextStep => ({ who: '', actions: [] });

// ---- the composer ---------------------------------------------------------

interface Props {
  /** How the contact happened (client_contacts.modality), for the opening sentence. */
  method?: string | null;
  /** Start from an earlier note (a saved note being finished). */
  initial?: ComposedNote | null;
  /** The main button, after review. */
  useLabel: React.ReactNode;
  onUse: (note: ComposedNote) => void;
  /** Called when the main category changes, with the touchpoint type it records as. */
  onTouchpointType?: (type: string | null) => void;
  /** Extra buttons beside the main one (Copy, Save note …). They get the reviewed note. */
  extraActions?: (note: ComposedNote | null) => React.ReactNode;
}

export const NoteComposer: React.FC<Props> = ({ method, initial, useLabel, onUse, onTouchpointType, extraActions }) => {
  // Notes saved by an older builder keep their text; their choices start over here.
  const start = normalizeDraft(initial?.draft);
  const [draft, setDraft] = useState<NoteDraft>(start);
  const allSkipped = { details: true, goals: true, prompts: true, housing: true, actions: true, result: true, response: true, barriers: true, next: true };
  const [skipped, setSkipped] = useState<Record<string, boolean>>(() => (initial ? allSkipped : {}));
  const [note, setNote] = useState(initial?.final ?? '');
  const [generated, setGenerated] = useState(initial?.generated ?? '');
  const [generator, setGenerator] = useState(initial?.generator ?? GENERATOR_VERSION);
  const [generatedFor, setGeneratedFor] = useState<string | null>(initial ? JSON.stringify(start) : null);
  const [variant, setVariant] = useState(0);
  const [editing, setEditing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [working, setWorking] = useState(false);
  const [aiOn, setAiOn] = useState(false);
  /** "visit" when it was in person, "contact" otherwise. */
  const word = contactWord(method);
  const tree = draft.tree;

  useEffect(() => {
    void aiWordingAvailable().then(setAiOn);
  }, []);

  const touchpointType = tree.categories[0] ? TOUCHPOINT_TYPE[tree.categories[0]] ?? null : null;
  useEffect(() => {
    onTouchpointType?.(touchpointType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touchpointType]);

  const update = (fn: (d: NoteDraft) => NoteDraft) => setDraft((d) => fn(structuredClone(d)));
  const skip = (k: string) => setSkipped((s) => ({ ...s, [k]: true }));
  const stale = !!note && generatedFor !== JSON.stringify(draft);
  // Any change to the selections means the note must be generated and reviewed again.
  useEffect(() => {
    if (stale) setReviewed(false);
  }, [stale]);

  // ---- the tree
  const setTree = (fn: (t: NoteDraft['tree']) => void) =>
    update((d) => {
      const t = d.tree;
      fn(t);
      // Answering per category follows the categories picked.
      d.activities = [...t.categories];
      for (const a of Object.keys(d.byActivity)) if (!t.categories.includes(a)) delete d.byActivity[a];
      return d;
    });

  /** Drop answers to a category's questions that are no longer asked. */
  const prune = (c: Category, t: NoteDraft['tree']) => {
    const picks = t.picks[c.id] ?? [];
    for (const q of c.questions) {
      const asked = askedFor(c, q, picks, t.answers);
      for (const k of Object.keys(t.answers)) {
        const [cat, qid, per] = k.split('.');
        if (cat !== c.id || qid !== q.id) continue;
        if (!asked.length || (per !== undefined && !asked.includes(per))) delete t.answers[k];
      }
    }
  };

  const toggleCategory = (id: string) =>
    setTree((t) => {
      if (t.categories.includes(id)) {
        t.categories = t.categories.filter((c) => c !== id);
        delete t.picks[id];
        for (const k of Object.keys(t.answers)) if (k.startsWith(`${id}.`)) delete t.answers[k];
      } else t.categories = [...t.categories, id];
    });

  const togglePick = (c: Category, item: string) =>
    setTree((t) => {
      t.picks[c.id] = toggle(t.picks[c.id] ?? [], item);
      prune(c, t);
    });

  const answer = (c: Category, q: TreeQuestion, per: string | undefined, v: string | string[] | undefined) =>
    setTree((t) => {
      const k = answerKey(c.id, q.id, per);
      if (v === undefined || (Array.isArray(v) && !v.length)) delete t.answers[k];
      else t.answers[k] = v;
      // A gating answer changed: clear what it no longer opens.
      prune(c, t);
    });

  // ---- progress: each step shows once the one before is answered or skipped
  const partsOf = (step: SplitStep): ActivityPart[] => (isSplit(draft, step) ? draft.activities.map((id) => partFor(draft, id)) : [draft]);
  const h = draft.housing;
  const done = {
    categories: tree.categories.length > 0,
    details: (tree.categories.length > 0 && tree.categories.every((c) => categoryComplete(tree, c))) || !!skipped.details,
    goals: draft.goals.length > 0 || !!skipped.goals,
    prompts: draft.prompts.length > 0 || !!skipped.prompts,
    housing: (!!h.status && !!h.changed) || !!skipped.housing,
    actions: partsOf('actions').every((p) => p.actions.some((a) => a.options.length > 0)) || !!skipped.actions,
    result: partsOf('result').every((p) => !!p.result && (p.result.value !== 'Unable to complete' || !!p.result.reason)) || !!skipped.result,
    response: draft.response.length > 0 || !!skipped.response,
    barriers: partsOf('barriers').every((p) => p.barriers.list.length > 0) || !!skipped.barriers,
    next: draft.noNextStep || draft.steps.some((s) => s.who && s.actions.length) || !!skipped.next,
  };
  const order = ['categories', 'details', 'goals', 'prompts', 'housing', 'actions', 'result', 'response', 'barriers', 'next'] as const;
  /** A step shows once every step before it is done. */
  const shows = (k: (typeof order)[number]) => order.slice(0, order.indexOf(k)).every((x) => done[x]);

  // ---- generating
  const facts = useMemo(() => summarize(draft).flatMap((s) => s.lines.map((l) => `${s.heading}: ${l}`)), [draft]);

  const write = async (v: number, previous?: string) => {
    const base = generateNote(draft, { method }, v);
    setWorking(true);
    let text = base;
    let by = GENERATOR_VERSION;
    if (aiOn) {
      const ai = await rewordWithAi(base, facts, previous);
      if (ai) {
        text = ai.note;
        by = `${GENERATOR_VERSION}+${ai.model}`;
      }
    }
    setWorking(false);
    setGenerated(text);
    setNote(text);
    setGenerator(by);
    setGeneratedFor(JSON.stringify(draft));
    setEditing(false);
    setReviewed(false);
  };

  const generate = () => {
    setVariant(0);
    void write(0);
  };
  const regenerate = () => {
    const v = variant + 1;
    setVariant(v);
    void write(v, note);
  };

  const composed: ComposedNote | null =
    note && !stale && reviewed
      ? { draft, generated, final: note.trim(), generator: note.trim() === generated.trim() ? generator : `${generator} (edited)`, reviewedAt: new Date().toISOString() }
      : null;

  // ---- answered once, or once per category
  const setPart = (catId: string | null, fn: (p: ActivityPart) => ActivityPart) =>
    update((d) => {
      if (!catId) return { ...d, ...fn(d) };
      d.byActivity[catId] = fn(d.byActivity[catId] ?? emptyPart());
      return d;
    });

  /** "Does this apply to all of them?" — shown with two or more categories. */
  const splitChoice = (step: SplitStep) =>
    draft.activities.length > 1 && (
      <div className="space-y-1.5 rounded-lg bg-muted/30 p-2.5">
        <p className="text-xs font-medium text-muted-foreground">Does this apply to all {draft.activities.length}?</p>
        <div className="flex flex-wrap gap-2">
          <Chip size="sm" selected={!isSplit(draft, step)} onClick={() => update((d) => ({ ...d, split: { ...d.split, [step]: false } }))}>
            Applies to all: {joinList(draft.activities.map((id) => activityLabel(id)))}
          </Chip>
          <Chip size="sm" selected={isSplit(draft, step)} onClick={() => update((d) => ({ ...d, split: { ...d.split, [step]: true } }))}>
            Different for each
          </Chip>
        </div>
      </div>
    );

  const eachPart = (step: SplitStep, body: (p: ActivityPart, set: (fn: (p: ActivityPart) => ActivityPart) => void, key: string) => React.ReactNode) =>
    isSplit(draft, step)
      ? draft.activities.map((id) => (
          <div key={id} className="space-y-2 rounded-lg border p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">For {activityLabel(id)}</p>
            {body(partFor(draft, id), (fn) => setPart(id, fn), id)}
          </div>
        ))
      : body(draft, (fn) => setPart(null, fn), 'all');

  const actionsBody = (p: ActivityPart, set: (fn: (p: ActivityPart) => ActivityPart) => void, key: string) => (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <Chip
            key={a.id}
            selected={p.actions.some((x) => x.group === a.id)}
            onClick={() =>
              set((x) => ({
                ...x,
                actions: x.actions.some((y) => y.group === a.id) ? x.actions.filter((y) => y.group !== a.id) : [...x.actions, { group: a.id, options: [] }],
              }))
            }
          >
            {a.label}
          </Chip>
        ))}
      </div>
      {p.actions.map((a) => {
        const g = ACTIONS.find((x) => x.id === a.group);
        if (!g) return null;
        return (
          <div key={`${key}-${a.group}`} className={cn('space-y-2 rounded-lg border p-3', a.options.length ? 'bg-muted/30' : 'border-primary/40 bg-primary/5')}>
            <p className="text-xs font-medium text-muted-foreground">{g.label}</p>
            <Choices
              options={Object.keys(g.options)}
              value={a.options}
              multi
              onChange={(v) => set((x) => ({ ...x, actions: x.actions.map((y) => (y.group === a.group ? { ...y, options: asList(v) } : y)) }))}
            />
          </div>
        );
      })}
    </div>
  );

  const resultBody = (p: ActivityPart, set: (fn: (p: ActivityPart) => ActivityPart) => void) => (
    <div className="space-y-3">
      <Choices options={Object.keys(RESULT)} size="md" value={p.result?.value} onChange={(v) => set((x) => ({ ...x, result: v ? { value: v as string } : null }))} />
      {p.result?.value === 'Unable to complete' && (
        <Ask label="Why was it unable to be completed?">
          <Choices
            options={Object.keys(UNABLE_BECAUSE)}
            value={p.result.reason}
            onChange={(v) => set((x) => ({ ...x, result: { value: 'Unable to complete', reason: v as string | undefined } }))}
          />
        </Ask>
      )}
    </div>
  );

  const barriersBody = (p: ActivityPart, set: (fn: (p: ActivityPart) => ActivityPart) => void) => (
    <Choices
      options={Object.keys(BARRIER)}
      size="md"
      value={p.barriers.list}
      multi
      onChange={(v) =>
        set((x) => {
          const list = asList(v);
          const added = list.find((b) => !x.barriers.list.includes(b));
          // "No barrier identified" and "Barrier not assessed" stand alone.
          const next = added && BARRIER_ALONE.includes(added) ? [added] : added ? list.filter((b) => !BARRIER_ALONE.includes(b)) : list;
          return { ...x, barriers: { ...x.barriers, list: next } };
        })
      }
    />
  );

  const setStep = (i: number, fn: (s: NextStep) => NextStep) =>
    update((d) => {
      d.steps[i] = fn(d.steps[i]);
      return d;
    });

  const summary = summarize(draft);
  const notListed = tree.categories.includes('other_service') && (tree.picks.other_service ?? []).includes(NOT_LISTED);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-3">
        {/* 1. Categories: they organize, they write nothing */}
        <Step n={1} title={`What did this ${word} cover?`} hint="Select all that apply">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip key={c.id} selected={tree.categories.includes(c.id)} onClick={() => toggleCategory(c.id)}>
                {c.label}
              </Chip>
            ))}
          </div>
        </Step>

        {/* 2. What specifically happened, under each category */}
        {shows('details') && (
          <Step n={2} title="What specifically happened?" onSkip={done.details ? undefined : () => skip('details')}>
            <div className="space-y-4">
              {tree.categories.map((id) => {
                const c = categoryById(id);
                if (!c) return null;
                const picks = tree.picks[id] ?? [];
                return (
                  <div key={id} className="space-y-3 rounded-lg border p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{c.label}</p>
                    <Ask label={c.ask} hint="Select all that apply">
                      <div className="flex flex-wrap gap-2">
                        {c.items.map((i) => (
                          <Chip key={i.id} size="sm" selected={picks.includes(i.id)} onClick={() => togglePick(c, i.id)}>
                            {i.label}
                          </Chip>
                        ))}
                      </div>
                    </Ask>
                    {id === 'other_service' && picks.includes(NOT_LISTED) && (
                      <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        This activity cannot be described with the current choices.
                      </p>
                    )}
                    {c.questions.map((q) =>
                      askedFor(c, q, picks, tree.answers).map((per) => (
                        <Ask
                          key={`${q.id}-${per ?? ''}`}
                          label={per ? `${c.items.find((i) => i.id === per)?.label ?? per}: ${q.ask}` : q.ask}
                          hint={[q.multi ? 'Select all that apply' : '', q.optional ? 'Optional' : ''].filter(Boolean).join('. ') || undefined}
                        >
                          <Choices
                            options={Object.keys(q.says ?? q.phrases ?? {})}
                            value={tree.answers[answerKey(c.id, q.id, per)]}
                            multi={q.multi}
                            onChange={(v) => answer(c, q, per, v)}
                          />
                        </Ask>
                      )),
                    )}
                  </div>
                );
              })}
            </div>
          </Step>
        )}

        {/* 3. Housing goal */}
        {shows('goals') && (
          <Step n={3} title={`What housing goal did this ${word} support?`} hint="Select all that apply" onSkip={done.goals ? undefined : () => skip('goals')}>
            <Choices options={Object.keys(GOALS)} size="md" value={draft.goals} multi onChange={(v) => update((d) => ({ ...d, goals: asList(v) }))} />
          </Step>
        )}

        {/* 4. What prompted it */}
        {shows('prompts') && (
          <Step n={4} title={`What prompted this ${word}?`} hint="Select all that apply" onSkip={done.prompts ? undefined : () => skip('prompts')}>
            <Choices options={Object.keys(PROMPTS)} size="md" value={draft.prompts} multi onChange={(v) => update((d) => ({ ...d, prompts: asList(v) }))} />
          </Step>
        )}

        {/* 5. Housing status */}
        {shows('housing') && (
          <Step n={5} title={`What is the ${TERMS.client}’s housing status?`} hint="Select one" onSkip={done.housing ? undefined : () => skip('housing')}>
            <Choices options={Object.keys(HOUSING)} size="md" value={h.status} onChange={(v) => update((d) => ({ ...d, housing: { ...d.housing, status: v as string | undefined } }))} />
            {h.status && (
              <Ask label="Has this changed since the last contact?">
                <Choices options={Object.keys(HOUSING_CHANGE)} value={h.changed} onChange={(v) => update((d) => ({ ...d, housing: { ...d.housing, changed: v as string | undefined } }))} />
              </Ask>
            )}
          </Step>
        )}

        {/* 6. What CM did */}
        {shows('actions') && (
          <Step n={6} title={`What did ${TERMS.cm} do?`} hint="Select all that apply" onSkip={done.actions ? undefined : () => skip('actions')}>
            {splitChoice('actions')}
            {eachPart('actions', actionsBody)}
          </Step>
        )}

        {/* 7. Result */}
        {shows('result') && (
          <Step n={7} title="What was the overall result?" hint="Select one" onSkip={done.result ? undefined : () => skip('result')}>
            {splitChoice('result')}
            {eachPart('result', resultBody)}
          </Step>
        )}

        {/* 8. Member response */}
        {shows('response') && (
          <Step n={8} title={`How did the ${TERMS.client} respond?`} hint="Select all that apply" onSkip={done.response ? undefined : () => skip('response')}>
            <Choices options={Object.keys(RESPONSE)} size="md" value={draft.response} multi onChange={(v) => update((d) => ({ ...d, response: asList(v) }))} />
          </Step>
        )}

        {/* 9. Barriers */}
        {shows('barriers') && (
          <Step n={9} title="What barriers were identified?" hint="Select all that apply" onSkip={done.barriers ? undefined : () => skip('barriers')}>
            {splitChoice('barriers')}
            {eachPart('barriers', barriersBody)}
          </Step>
        )}

        {/* 10. Next steps */}
        {shows('next') && (
          <Step n={10} title="What happens next?" onSkip={done.next ? undefined : () => skip('next')}>
            {!draft.noNextStep &&
              draft.steps.map((s, i) => (
                <div key={i} className="space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Step {i + 1}</p>
                    <button
                      type="button"
                      aria-label={`Remove step ${i + 1}`}
                      onClick={() => update((d) => ({ ...d, steps: d.steps.filter((_, j) => j !== i) }))}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <Ask label="Who is responsible?">
                    <Choices options={Object.keys(OWNER)} value={s.who} onChange={(v) => setStep(i, (x) => ({ ...x, who: (v as string) ?? '', actions: [] }))} />
                  </Ask>
                  {s.who && (
                    <Ask label="What will they do?" hint="Select all that apply">
                      <Choices options={Object.keys(actionsFor(s.who))} value={s.actions} multi onChange={(v) => setStep(i, (x) => ({ ...x, actions: asList(v) }))} />
                    </Ask>
                  )}
                  {s.who && (
                    <Ask label="When is the next step expected?">
                      <Choices options={Object.keys(STEP_TIMING)} value={s.timing} onChange={(v) => setStep(i, (x) => ({ ...x, timing: v as string | undefined }))} />
                    </Ask>
                  )}
                </div>
              ))}
            <div className="flex flex-wrap gap-2">
              {!draft.noNextStep && (
                <Button size="sm" variant="outline" onClick={() => update((d) => ({ ...d, steps: [...d.steps, emptyStep()] }))}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {draft.steps.length ? 'Add another step' : 'Add a next step'}
                </Button>
              )}
              <Chip size="sm" selected={draft.noNextStep} onClick={() => update((d) => ({ ...d, noNextStep: !d.noNextStep, steps: d.noNextStep ? d.steps : [] }))}>
                No next step identified
              </Chip>
            </div>
            <Ask label="When is the next contact planned?">
              <Choices options={Object.keys(NEXT_CONTACT)} value={draft.nextContact.kind} onChange={(v) => update((d) => ({ ...d, nextContact: v ? { kind: v as string } : {} }))} />
            </Ask>
          </Step>
        )}

        {/* Generate, at the end */}
        {done.categories && (
          <section className="space-y-3 rounded-xl border bg-white p-4">
            {notListed && <p className="text-xs text-amber-900">“Service not listed” is not written into the note.</p>}
            <Button className="w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={!canGenerate(draft) || working} onClick={generate}>
              {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {note && stale ? 'Generate again' : 'Generate note'}
            </Button>

            {note && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">Note</h3>
                  <span className="text-[11px] text-muted-foreground">
                    {generator.includes('+') ? 'Reworded by AI from your selections' : 'Written from your selections'}
                  </span>
                </div>
                {stale && <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">Your selections changed. Generate the note again before using it.</p>}
                {editing ? (
                  <Textarea rows={8} value={note} onChange={(e) => { setNote(e.target.value); setReviewed(false); }} className="text-sm" />
                ) : (
                  <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm leading-relaxed">{note}</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={regenerate} disabled={working || stale}>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Regenerate wording
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing((e) => !e)} disabled={stale}>
                    {editing ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Pencil className="mr-1.5 h-3.5 w-3.5" />}
                    {editing ? 'Done editing' : 'Edit note'}
                  </Button>
                </div>
                <label className="flex items-start gap-2 rounded-md border p-2.5 text-sm">
                  <Checkbox checked={reviewed} disabled={stale} onCheckedChange={(c) => setReviewed(c === true)} className="mt-0.5" />
                  <span>I reviewed this note and confirm that it accurately reflects the contact.</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!composed} onClick={() => composed && onUse(composed)}>
                    {useLabel}
                  </Button>
                  {extraActions?.(composed)}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* What is selected so far */}
      <aside className="space-y-3 lg:sticky lg:top-2">
        <section className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">Selected</h3>
          {summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {summary.map((s) => (
                <div key={s.heading}>
                  <p className="font-semibold">{s.heading}</p>
                  <ul className="ml-1 space-y-0.5 text-muted-foreground">
                    {s.lines.map((l, i) => (
                      <li key={`${l}-${i}`}>• {l}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </aside>
    </div>
  );
};
