// The clinical note builder: "What happened?" click, click, click, note.
//
// One decision at a time. Each step appears once the one before it has an
// answer (or is skipped), each item asks its questions one by one, and an
// answered question collapses into a short chip that can be tapped to change.
// The "Selected" summary and the note sit beside the steps.
//
// The steps keep apart why the contact took place (the activities), the
// member's housing status, the details, what CM did, the result, barriers, the
// member's response and the next steps, so each reads as its own claim.
//
// The note is written only from what is selected here (src/lib/clinicalNotes).
// Nothing is saved until the case manager has reviewed it and ticked the
// confirmation.
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ACTIONS,
  ACTIVITIES,
  BARRIER_ANSWERS,
  BARRIER_LIST,
  EXTRA_SECTIONS,
  HOUSING_CHANGED,
  HOUSING_STATUS,
  NEXT_CM,
  NEXT_CONSUMER,
  NEXT_CONTACT,
  NEXT_CONTACT_TIMEFRAMES,
  NEXT_THIRD,
  RESPONSE_CHOICES,
  RESULTS,
  SPECIFIC_DATE,
  STEP_WHO,
  TERMS,
  THIRD_PARTIES,
  TIMING,
  contactWord,
  topicById,
  type Answers,
  type Question,
} from '@/lib/clinicalNotes/config';
import {
  GENERATOR_VERSION,
  allowedItems,
  asked,
  canGenerate,
  generateNote,
  itemComplete,
  normalizeDraft,
  summarize,
  syncSections,
  type NextStep,
  type NoteDraft,
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

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** One question of an item: chips, several chips, or a few typed words. */
const QuestionChips: React.FC<{
  q: Question;
  value: string | string[] | undefined;
  onAnswer: (v: string | string[] | undefined, done: boolean) => void;
}> = ({ q, value, onAnswer }) => {
  const [typed, setTyped] = useState(typeof value === 'string' ? value : '');
  const [picked, setPicked] = useState<string[]>(Array.isArray(value) ? value : []);
  if (q.text) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={q.label}
          maxLength={200}
          className="h-9 max-w-md flex-1"
          onKeyDown={(e) => e.key === 'Enter' && onAnswer(typed.trim() || undefined, true)}
        />
        <Button size="sm" onClick={() => onAnswer(typed.trim() || undefined, true)}>Done</Button>
      </div>
    );
  }
  if (q.multi) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {q.options.map((o) => (
            <Chip key={o} size="sm" selected={picked.includes(o)} onClick={() => setPicked((p) => toggle(p, o))}>
              {o}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={!picked.length && !q.optional} onClick={() => onAnswer(picked.length ? picked : undefined, true)}>
            Done
          </Button>
          {q.optional && !picked.length && (
            <Button size="sm" variant="ghost" onClick={() => onAnswer(undefined, true)}>Skip</Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {q.options.map((o) => (
        <Chip key={o} size="sm" selected={value === o} onClick={() => onAnswer(o, true)}>
          {o}
        </Chip>
      ))}
      {q.optional && (
        <Button size="sm" variant="ghost" onClick={() => onAnswer(undefined, true)}>Skip</Button>
      )}
    </div>
  );
};

/** A picked item: its answered questions as chips, then the next question. */
const ItemCard: React.FC<{
  topicId: string;
  itemId: string;
  answers: Answers;
  /** Questions already passed, answered or skipped. */
  passed: string[];
  onChange: (answers: Answers, passed: string[]) => void;
  onRemove: () => void;
}> = ({ topicId, itemId, answers, passed, onChange, onRemove }) => {
  const item = topicById(topicId)?.items.find((i) => i.id === itemId);
  if (!item) return null;
  // Questions that do not apply (a "Please specify" without Other) are passed over.
  const nextQ = item.questions.find((q) => !passed.includes(q.key) && asked(q, answers));
  const done = !nextQ && itemComplete(topicId, itemId, answers);
  const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v);
  return (
    <div className={cn('rounded-lg border p-3', done ? 'bg-muted/30' : 'border-primary/40 bg-primary/5')}>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold">{item.label}</span>
        {item.questions
          .filter((q) => passed.includes(q.key) && answers[q.key] && asked(q, answers))
          .map((q) => (
            <button
              key={q.key}
              type="button"
              title="Change"
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-xs ring-1 ring-border hover:ring-primary"
              onClick={() => {
                // Changing an answer reopens it and everything after it.
                const at = item.questions.findIndex((x) => x.key === q.key);
                const keep = item.questions.slice(0, at).map((x) => x.key);
                const next: Answers = {};
                for (const k of keep) next[k] = answers[k];
                onChange(next, keep);
              }}
            >
              <span className="text-muted-foreground">→</span> {show(answers[q.key])}
            </button>
          ))}
        <button type="button" aria-label={`Remove ${item.label}`} onClick={onRemove} className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {nextQ && (
        <div className="mt-2.5 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {nextQ.label}
            {nextQ.optional && ' (optional)'}
            {nextQ.multi && ' Select all that apply.'}
          </p>
          <QuestionChips
            key={`${itemId}-${nextQ.key}`}
            q={nextQ}
            value={answers[nextQ.key]}
            onAnswer={(v) => onChange({ ...answers, [nextQ.key]: v }, [...passed, nextQ.key])}
          />
        </div>
      )}
    </div>
  );
};

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

const emptyStep = (goal: string): NextStep => ({ who: '', actions: [], other: '', goal });

// ---- the composer ---------------------------------------------------------

interface Props {
  /** How the contact happened (client_contacts.modality), for the opening sentence. */
  method?: string | null;
  /** Start from an earlier note (a saved note being finished). */
  initial?: ComposedNote | null;
  /** The main button, after review. */
  useLabel: React.ReactNode;
  onUse: (note: ComposedNote) => void;
  /** Called when the primary topic changes, so a touchpoint type can follow it. */
  onPrimaryTopic?: (topicId: string | null) => void;
  /** Extra buttons beside the main one (Copy, Save note …). They get the reviewed note. */
  extraActions?: (note: ComposedNote | null) => React.ReactNode;
}

type Passed = Record<string, Record<string, string[]>>;

export const NoteComposer: React.FC<Props> = ({ method, initial, useLabel, onUse, onPrimaryTopic, extraActions }) => {
  const [draft, setDraft] = useState<NoteDraft>(() => normalizeDraft(initial?.draft));
  // Which questions of each item have been passed (answered or skipped).
  const [passed, setPassed] = useState<Passed>(() => {
    const p: Passed = {};
    const d = initial?.draft;
    if (d) for (const [t, items] of Object.entries(d.items)) {
      p[t] = {};
      for (const it of items) {
        const item = topicById(t)?.items.find((x) => x.id === it.id);
        p[t][it.id] = item?.questions.map((q) => q.key) ?? [];
      }
    }
    return p;
  });
  const allSkipped = { why: true, housing: true, details: true, actions: true, result: true, barriers: true, response: true, next: true };
  const [skipped, setSkipped] = useState<Record<string, boolean>>(() => (initial ? allSkipped : {}));
  const [note, setNote] = useState(initial?.final ?? '');
  const [generated, setGenerated] = useState(initial?.generated ?? '');
  const [generator, setGenerator] = useState(initial?.generator ?? GENERATOR_VERSION);
  const [generatedFor, setGeneratedFor] = useState<string | null>(initial ? JSON.stringify(normalizeDraft(initial.draft)) : null);
  const [variant, setVariant] = useState(0);
  const [editing, setEditing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [working, setWorking] = useState(false);
  const [aiOn, setAiOn] = useState(false);
  /** "visit" for a phone call, "contact" otherwise. */
  const word = contactWord(method);

  useEffect(() => {
    void aiWordingAvailable().then(setAiOn);
  }, []);

  const primary = draft.topics[0] ?? null;
  useEffect(() => {
    onPrimaryTopic?.(primary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary]);

  const update = (fn: (d: NoteDraft) => NoteDraft) => setDraft((d) => fn(structuredClone(d)));
  const skip = (k: string) => setSkipped((s) => ({ ...s, [k]: true }));
  const stale = !!note && generatedFor !== JSON.stringify(draft);
  // Any change to the selections means the note must be generated and reviewed again.
  useEffect(() => {
    if (stale) setReviewed(false);
  }, [stale]);

  // ---- progress: each step shows once the one before is answered or skipped
  const hasItem = draft.topics.some((t) => (draft.items[t] ?? []).some((p) => itemComplete(t, p.id, p.answers)));
  const h = draft.housing;
  const b = draft.barriers;
  const done = {
    activities: draft.activities.length > 0 || draft.topics.length > 0,
    why: !!skipped.why,
    housing: (!!h.status && !!h.changed && (h.changed !== 'Yes' || !!h.change.trim())) || !!skipped.housing,
    details: hasItem || !!skipped.details,
    actions: draft.actions.some((a) => a.group === 'other' || a.options.length > 0) || !!skipped.actions,
    result: !!draft.result || !!skipped.result,
    barriers: (!!b.answer && (b.answer !== 'Yes' || b.list.length > 0)) || !!skipped.barriers,
    response: draft.response.length > 0 || !!skipped.response,
    next: draft.noNextStep || draft.steps.some((s) => !!s.who) || !!draft.next || !!skipped.next,
  };
  const order = ['activities', 'why', 'housing', 'details', 'actions', 'result', 'barriers', 'response', 'next'] as const;
  /** A step shows once every step before it is done. */
  const shows = (k: (typeof order)[number]) => order.slice(0, order.indexOf(k)).every((x) => done[x]);
  const encourageText = draft.topics.some((t) => topicById(t)?.encourageFreeText);

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

  // ---- detail helpers
  const pickItem = (topicId: string, itemId: string) => {
    update((d) => {
      const list = d.items[topicId] ?? [];
      d.items[topicId] = list.some((x) => x.id === itemId) ? list.filter((x) => x.id !== itemId) : [...list, { id: itemId, answers: {} }];
      return d;
    });
    setPassed((p) => {
      const t = { ...(p[topicId] ?? {}) };
      if (t[itemId]) delete t[itemId];
      else t[itemId] = [];
      return { ...p, [topicId]: t };
    });
  };

  const setStep = (i: number, fn: (s: NextStep) => NextStep) =>
    update((d) => {
      d.steps[i] = fn(d.steps[i]);
      return d;
    });

  const summary = summarize(draft);
  const extrasOffered = EXTRA_SECTIONS.filter((t) => !draft.topics.includes(t) || draft.extraSections.includes(t));

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-3">
        {/* 1. Activities */}
        <Step n={1} title={`What housing support activities took place during this ${word}?`} hint="Select all that apply">
          <div className="flex flex-wrap gap-2">
            {ACTIVITIES.map((a) => (
              <Chip
                key={a.id}
                selected={draft.activities.includes(a.id)}
                onClick={() =>
                  update((d) => {
                    d.activities = toggle(d.activities, a.id);
                    return syncSections(d);
                  })
                }
              >
                {a.label}
              </Chip>
            ))}
          </div>
          {draft.activities.includes('other') && (
            <Ask label="Please specify">
              <Input className="h-9 max-w-md" maxLength={150} value={draft.activityOther} onChange={(e) => update((d) => ({ ...d, activityOther: e.target.value }))} />
            </Ask>
          )}
        </Step>

        {/* 2. Goal and reason */}
        {shows('why') && (
          <Step n={2} title={`What housing goal did this ${word} support?`} onSkip={done.why ? undefined : () => skip('why')}>
            <Ask label="Housing goal" hint="Describe the member’s specific housing goal.">
              <Input className="h-9" maxLength={200} value={draft.goal} onChange={(e) => update((d) => ({ ...d, goal: e.target.value }))} />
            </Ask>
            <Ask label={`What prompted this ${word}?`} hint="Describe the specific need, request, notice, deadline, or change.">
              <Input className="h-9" maxLength={200} value={draft.reason} onChange={(e) => update((d) => ({ ...d, reason: e.target.value }))} />
            </Ask>
            {!done.why && (
              <Button size="sm" onClick={() => skip('why')}>
                Continue
              </Button>
            )}
          </Step>
        )}

        {/* 3. Housing status */}
        {shows('housing') && (
          <Step n={3} title={`What is the ${TERMS.client}’s current housing status?`} hint="Select one" onSkip={done.housing ? undefined : () => skip('housing')}>
            <div className="flex flex-wrap gap-2">
              {Object.keys(HOUSING_STATUS).map((s) => (
                <Chip key={s} selected={h.status === s} onClick={() => update((d) => ({ ...d, housing: { ...d.housing, status: d.housing.status === s ? undefined : s } }))}>
                  {s}
                </Chip>
              ))}
            </div>
            {h.status && (
              <Ask label={`Has the ${TERMS.client}’s housing situation changed since the last contact?`}>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(HOUSING_CHANGED).map((c) => (
                    <Chip key={c} size="sm" selected={h.changed === c} onClick={() => update((d) => ({ ...d, housing: { ...d.housing, changed: d.housing.changed === c ? undefined : c } }))}>
                      {c}
                    </Chip>
                  ))}
                </div>
              </Ask>
            )}
            {h.changed === 'Yes' && (
              <Ask label="What changed?" hint="Include any notice, housing issue, move, or change in risk.">
                <Input className="h-9" maxLength={200} value={h.change} onChange={(e) => update((d) => ({ ...d, housing: { ...d.housing, change: e.target.value } }))} />
              </Ask>
            )}
          </Step>
        )}

        {/* 4. Details for each activity */}
        {shows('details') && (
          <Step n={4} title="What did you discuss?" hint="Choose all that apply" onSkip={hasItem || skipped.details ? undefined : () => skip('details')}>
            <div className="space-y-4">
              {draft.topics.map((topicId) => {
                const topic = topicById(topicId);
                if (!topic) return null;
                const allowed = allowedItems(draft, topicId);
                const items = topic.items.filter((it) => !allowed || allowed.includes(it.id));
                const picked = draft.items[topicId] ?? [];
                const ctxQ = topic.context;
                return (
                  <div key={topicId} className="space-y-2.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{topic.label}</p>
                    {ctxQ && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">
                          {ctxQ.label}
                          {ctxQ.optional && ' (optional)'}
                        </span>
                        {ctxQ.options.map((o) => {
                          const cur = draft.topicContext[topicId]?.[ctxQ.key];
                          return (
                            <Chip
                              key={o}
                              size="sm"
                              selected={cur === o}
                              onClick={() =>
                                update((d) => {
                                  d.topicContext[topicId] = { ...(d.topicContext[topicId] ?? {}), [ctxQ.key]: cur === o ? undefined : o };
                                  return d;
                                })
                              }
                            >
                              {o}
                            </Chip>
                          );
                        })}
                      </div>
                    )}
                    {topic.itemsLabel && <p className="text-xs font-medium text-muted-foreground">{topic.itemsLabel}</p>}
                    <div className="flex flex-wrap gap-2">
                      {items.map((it) => (
                        <Chip key={it.id} selected={picked.some((p) => p.id === it.id)} onClick={() => pickItem(topicId, it.id)}>
                          {it.label}
                        </Chip>
                      ))}
                    </div>
                    {picked.map((p) => (
                      <ItemCard
                        key={p.id}
                        topicId={topicId}
                        itemId={p.id}
                        answers={p.answers}
                        passed={passed[topicId]?.[p.id] ?? []}
                        onRemove={() => pickItem(topicId, p.id)}
                        onChange={(answers, nowPassed) => {
                          update((d) => {
                            d.items[topicId] = (d.items[topicId] ?? []).map((x) => (x.id === p.id ? { ...x, answers } : x));
                            return d;
                          });
                          setPassed((ps) => ({ ...ps, [topicId]: { ...(ps[topicId] ?? {}), [p.id]: nowPassed } }));
                        }}
                      />
                    ))}
                  </div>
                );
              })}
              {draft.activities.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <span className="text-xs font-medium text-muted-foreground">Add a section</span>
                  {extrasOffered.map((t) => (
                    <Chip
                      key={t}
                      size="sm"
                      selected={draft.extraSections.includes(t)}
                      onClick={() =>
                        update((d) => {
                          d.extraSections = toggle(d.extraSections, t);
                          return syncSections(d);
                        })
                      }
                    >
                      {topicById(t)?.label ?? t}
                    </Chip>
                  ))}
                </div>
              )}
            </div>
          </Step>
        )}

        {/* 5. What CM did */}
        {shows('actions') && (
          <Step n={5} title={`What actions did ${TERMS.cm} complete during this ${word}?`} hint="Select all that apply. Choose the specific item under each action." onSkip={done.actions ? undefined : () => skip('actions')}>
            <div className="flex flex-wrap gap-2">
              {[...ACTIONS.map((a) => ({ id: a.id, label: a.label })), { id: 'other', label: 'Other' }].map((a) => (
                <Chip
                  key={a.id}
                  selected={draft.actions.some((x) => x.group === a.id)}
                  onClick={() =>
                    update((d) => {
                      d.actions = d.actions.some((x) => x.group === a.id) ? d.actions.filter((x) => x.group !== a.id) : [...d.actions, { group: a.id, options: [] }];
                      return d;
                    })
                  }
                >
                  {a.label}
                </Chip>
              ))}
            </div>
            {draft.actions.map((a) => {
              if (a.group === 'other') {
                return (
                  <div key="other" className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Please specify what {TERMS.cm} did</p>
                    <Input value={draft.actionsOther} maxLength={200} onChange={(e) => update((d) => ({ ...d, actionsOther: e.target.value }))} className="h-9" />
                  </div>
                );
              }
              const g = ACTIONS.find((x) => x.id === a.group);
              if (!g) return null;
              return (
                <div key={a.group} className={cn('space-y-2 rounded-lg border p-3', a.options.length ? 'bg-muted/30' : 'border-primary/40 bg-primary/5')}>
                  <p className="text-xs font-medium text-muted-foreground">{g.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(g.options).map((o) => (
                      <Chip
                        key={o}
                        size="sm"
                        selected={a.options.includes(o)}
                        onClick={() =>
                          update((d) => {
                            d.actions = d.actions.map((x) => (x.group === a.group ? { ...x, options: toggle(x.options, o) } : x));
                            return d;
                          })
                        }
                      >
                        {o}
                      </Chip>
                    ))}
                  </div>
                  {Object.entries(g.detail ?? {})
                    .filter(([o]) => a.options.includes(o))
                    .map(([o, det]) => (
                      <Ask key={o} label={det.label}>
                        <Input
                          className="h-9 max-w-md"
                          maxLength={150}
                          value={draft.actionText[`${a.group}:${o}`] ?? ''}
                          onChange={(e) => update((d) => ({ ...d, actionText: { ...d.actionText, [`${a.group}:${o}`]: e.target.value } }))}
                        />
                      </Ask>
                    ))}
                </div>
              );
            })}
          </Step>
        )}

        {/* 6. Result */}
        {shows('result') && (
          <Step n={6} title={`What was the result of ${TERMS.cm}’s actions?`} onSkip={done.result ? undefined : () => skip('result')}>
            <div className="flex flex-wrap gap-2">
              {Object.keys(RESULTS).map((r) => (
                <Chip key={r} selected={draft.result?.value === r} onClick={() => update((d) => ({ ...d, result: d.result?.value === r ? null : { value: r } }))}>
                  {r}
                </Chip>
              ))}
            </div>
          </Step>
        )}

        {/* 7. Barriers */}
        {shows('barriers') && (
          <Step n={7} title="Were any barriers identified?" onSkip={done.barriers ? undefined : () => skip('barriers')}>
            <div className="flex flex-wrap gap-2">
              {BARRIER_ANSWERS.map((x) => (
                <Chip key={x} selected={b.answer === x} onClick={() => update((d) => ({ ...d, barriers: { ...d.barriers, answer: d.barriers.answer === x ? undefined : x } }))}>
                  {x}
                </Chip>
              ))}
            </div>
            {b.answer === 'Yes' && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                <Ask label="What barriers affected the housing goal?" hint="Select all that apply.">
                  <div className="flex flex-wrap gap-2">
                    {Object.keys(BARRIER_LIST).map((x) => (
                      <Chip key={x} size="sm" selected={b.list.includes(x)} onClick={() => update((d) => ({ ...d, barriers: { ...d.barriers, list: toggle(d.barriers.list, x) } }))}>
                        {x}
                      </Chip>
                    ))}
                  </div>
                </Ask>
                {b.list.includes('Other barrier') && (
                  <Ask label="Please specify">
                    <Input className="h-9 max-w-md" maxLength={150} value={b.other} onChange={(e) => update((d) => ({ ...d, barriers: { ...d.barriers, other: e.target.value } }))} />
                  </Ask>
                )}
                {b.list.length > 0 && (
                  <Ask label="How did the barrier affect the housing goal?" hint="Briefly describe the impact and any action taken.">
                    <Input className="h-9" maxLength={250} value={b.impact} onChange={(e) => update((d) => ({ ...d, barriers: { ...d.barriers, impact: e.target.value } }))} />
                  </Ask>
                )}
              </div>
            )}
          </Step>
        )}

        {/* 8. Member response (optional) */}
        {shows('response') && (
          <Step n={8} title={`How did the ${TERMS.client} respond?`} hint="Optional. Select all that apply" onSkip={done.response ? undefined : () => skip('response')}>
            <div className="flex flex-wrap gap-2">
              {RESPONSE_CHOICES.map((r) => (
                <Chip key={r} selected={draft.response.includes(r)} onClick={() => update((d) => ({ ...d, response: toggle(d.response, r) }))}>
                  {r}
                </Chip>
              ))}
            </div>
            {draft.response.includes('Other response') && (
              <Ask label="Please specify">
                <Input className="h-9 max-w-md" maxLength={200} value={draft.responseOther} onChange={(e) => update((d) => ({ ...d, responseOther: e.target.value }))} />
              </Ask>
            )}
          </Step>
        )}

        {/* 9. Next steps */}
        {shows('next') && (
          <Step n={9} title="What are the next steps?" hint="Add each step separately" onSkip={done.next ? undefined : () => skip('next')}>
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
                    <div className="flex flex-wrap gap-2">
                      {STEP_WHO.map((w) => (
                        <Chip key={w} size="sm" selected={s.who === w} onClick={() => setStep(i, (x) => ({ ...x, who: x.who === w ? '' : w, actions: [], thirdWho: undefined, other: '' }))}>
                          {w}
                        </Chip>
                      ))}
                    </div>
                  </Ask>
                  {s.who === 'Third party' && (
                    <Ask label="Who are you waiting on?">
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(THIRD_PARTIES).map((t) => (
                          <Chip key={t} size="sm" selected={s.thirdWho === t} onClick={() => setStep(i, (x) => ({ ...x, thirdWho: x.thirdWho === t ? undefined : t }))}>
                            {t}
                          </Chip>
                        ))}
                      </div>
                    </Ask>
                  )}
                  {s.who && (
                    <Ask label="What will they do?">
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(s.who === 'CM' ? NEXT_CM : s.who === 'Member' ? NEXT_CONSUMER : NEXT_THIRD).map((o) => (
                          <Chip key={o} size="sm" selected={s.actions.includes(o)} onClick={() => setStep(i, (x) => ({ ...x, actions: toggle(x.actions, o) }))}>
                            {o}
                          </Chip>
                        ))}
                      </div>
                    </Ask>
                  )}
                  {s.actions.includes('Other') && (
                    <Ask label="Please specify">
                      <Input className="h-9 max-w-md" maxLength={150} value={s.other} onChange={(e) => setStep(i, (x) => ({ ...x, other: e.target.value }))} />
                    </Ask>
                  )}
                  {s.who && (
                    <Ask label="When is it expected?">
                      <div className="flex flex-wrap items-center gap-2">
                        {Object.keys(TIMING).map((t) => (
                          <Chip key={t} size="sm" selected={s.timing === t} onClick={() => setStep(i, (x) => ({ ...x, timing: x.timing === t ? undefined : t }))}>
                            {t}
                          </Chip>
                        ))}
                        {s.timing === SPECIFIC_DATE && (
                          <Input type="date" className="h-8 w-40" value={s.date ?? ''} onChange={(e) => setStep(i, (x) => ({ ...x, date: e.target.value }))} />
                        )}
                      </div>
                    </Ask>
                  )}
                  {s.who && (
                    <Ask label="What housing goal does this step support?">
                      <Input className="h-9" maxLength={200} value={s.goal} onChange={(e) => setStep(i, (x) => ({ ...x, goal: e.target.value }))} />
                    </Ask>
                  )}
                </div>
              ))}
            <div className="flex flex-wrap gap-2">
              {!draft.noNextStep && (
                <Button size="sm" variant="outline" onClick={() => update((d) => ({ ...d, steps: [...d.steps, emptyStep(d.goal.trim())] }))}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {draft.steps.length ? 'Add another step' : 'Add a step'}
                </Button>
              )}
              <Chip size="sm" selected={draft.noNextStep} onClick={() => update((d) => ({ ...d, noNextStep: !d.noNextStep, steps: d.noNextStep ? d.steps : [] }))}>
                No next step identified
              </Chip>
            </div>
            <Ask label="When is the next contact planned?" hint="Optional">
              <div className="flex flex-wrap items-center gap-2">
                {NEXT_CONTACT.map((k) => (
                  <Chip key={k} size="sm" selected={draft.nextContact.kind === k} onClick={() => update((d) => ({ ...d, nextContact: d.nextContact.kind === k ? {} : { kind: k } }))}>
                    {k}
                  </Chip>
                ))}
                {draft.nextContact.kind === 'Specific date' && (
                  <Input type="date" className="h-8 w-40" value={draft.nextContact.date ?? ''} onChange={(e) => update((d) => ({ ...d, nextContact: { ...d.nextContact, date: e.target.value } }))} />
                )}
              </div>
              {draft.nextContact.kind === 'Timeframe' && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {Object.keys(NEXT_CONTACT_TIMEFRAMES).map((t) => (
                    <Chip key={t} size="sm" selected={draft.nextContact.timeframe === t} onClick={() => update((d) => ({ ...d, nextContact: { ...d.nextContact, timeframe: t } }))}>
                      {t}
                    </Chip>
                  ))}
                </div>
              )}
            </Ask>
          </Step>
        )}

        {/* Free text */}
        {done.activities && (done.next || encourageText) && shows('next') && (
          <section className="space-y-2 rounded-xl border bg-white p-4">
            <h3 className="font-semibold">
              Anything important not captured above? <span className="text-xs font-normal text-muted-foreground">Optional</span>
            </h3>
            <p className="text-xs text-muted-foreground">
              {encourageText ? "Add the context the choices can't capture. " : ''}Add up to three sentences. We’ll tidy the wording without changing its meaning.
            </p>
            <Textarea rows={3} maxLength={600} value={draft.freeText} onChange={(e) => update((d) => ({ ...d, freeText: e.target.value }))} />
          </section>
        )}
      </div>

      {/* Summary and note */}
      <aside className="space-y-3 lg:sticky lg:top-2">
        <section className="rounded-xl border bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold">Selected</h3>
          {summary.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet. Start with the activities that took place.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {summary.map((s) => (
                <div key={s.heading}>
                  <p className="font-semibold">{s.heading}</p>
                  <ul className="ml-1 space-y-0.5 text-muted-foreground">
                    {s.lines.map((l) => (
                      <li key={l}>• {l}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
          <Button className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700" disabled={!canGenerate(draft) || working} onClick={generate}>
            {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {note ? (stale ? 'Generate again' : 'Generate note') : 'Generate note'}
          </Button>
        </section>

        {note && (
          <section className="space-y-3 rounded-xl border bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Note</h3>
              <span className="text-[11px] text-muted-foreground">
                {generator.includes('+') ? 'Reworded by AI from your selections' : 'Written from your selections'}
              </span>
            </div>
            {stale && (
              <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
                Your selections changed. Generate the note again before using it.
              </p>
            )}
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
          </section>
        )}
      </aside>
    </div>
  );
};
