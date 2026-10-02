// The clinical note builder: "What happened?" click, click, click, note.
//
// One decision at a time. Each step appears once the one before it has an
// answer (or is skipped), each item asks its questions one by one, and an
// answered question collapses into a short chip that can be tapped to change.
// The "Selected" summary and the note sit beside the steps.
//
// The note is written only from what is selected here (src/lib/clinicalNotes).
// Nothing is saved until the case manager has reviewed it and ticked the
// confirmation.
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Pencil, RefreshCw, Sparkles, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import {
  ACTIONS,
  BARRIERS,
  NEXT_CM,
  NEXT_CONSUMER,
  NEXT_THIRD,
  NEXT_WHO,
  NEXT_WHO_LABELS,
  RESPONSES,
  RESULTS,
  SPECIFIC_DATE,
  TERMS,
  THIRD_PARTIES,
  TIMING,
  TOPICS,
  topicById,
  type Answers,
  type Question,
} from '@/lib/clinicalNotes/config';
import {
  GENERATOR_VERSION,
  canGenerate,
  emptyDraft,
  generateNote,
  itemComplete,
  nextWho,
  summarize,
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
  const nextQ = item.questions.find((q) => !passed.includes(q.key));
  const done = !nextQ && itemComplete(topicId, itemId, answers);
  const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join(', ') : v);
  return (
    <div className={cn('rounded-lg border p-3', done ? 'bg-muted/30' : 'border-primary/40 bg-primary/5')}>
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        <span className="font-semibold">{item.label}</span>
        {item.questions
          .filter((q) => passed.includes(q.key) && answers[q.key])
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

// ---- the composer ---------------------------------------------------------

interface Props {
  /** How the contact happened (client_contacts.modality), for the opening sentence. */
  method?: string | null;
  /** Start from an earlier note (a draft being finished). */
  initial?: ComposedNote | null;
  /** The main button, after review. */
  useLabel: React.ReactNode;
  onUse: (note: ComposedNote) => void;
  /** Called when the primary topic changes, so a touchpoint type can follow it. */
  onPrimaryTopic?: (topicId: string | null) => void;
  /** Extra buttons beside the main one (Copy, Save draft …). They get the reviewed note. */
  extraActions?: (note: ComposedNote | null) => React.ReactNode;
}

type Passed = Record<string, Record<string, string[]>>;

export const NoteComposer: React.FC<Props> = ({ method, initial, useLabel, onUse, onPrimaryTopic, extraActions }) => {
  const [draft, setDraft] = useState<NoteDraft>(() => initial?.draft ?? emptyDraft());
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
  const [skipped, setSkipped] = useState<Record<string, boolean>>(() => (initial ? { details: true, actions: true, result: true, response: true, next: true } : {}));
  const [note, setNote] = useState(initial?.final ?? '');
  const [generated, setGenerated] = useState(initial?.generated ?? '');
  const [generator, setGenerator] = useState(initial?.generator ?? GENERATOR_VERSION);
  const [generatedFor, setGeneratedFor] = useState<string | null>(initial ? JSON.stringify(initial.draft) : null);
  const [variant, setVariant] = useState(0);
  const [editing, setEditing] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [working, setWorking] = useState(false);
  const [aiOn, setAiOn] = useState(false);

  useEffect(() => {
    void aiWordingAvailable().then(setAiOn);
  }, []);

  const primary = draft.topics[0] ?? null;
  useEffect(() => {
    onPrimaryTopic?.(primary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary]);

  const update = (fn: (d: NoteDraft) => NoteDraft) => setDraft((d) => fn(structuredClone(d)));
  const stale = !!note && generatedFor !== JSON.stringify(draft);
  // Any change to the selections means the note must be generated and reviewed again.
  useEffect(() => {
    if (stale) setReviewed(false);
  }, [stale]);

  // ---- progress: each step shows once the one before is answered or skipped
  const hasItem = draft.topics.some((t) => (draft.items[t] ?? []).some((p) => itemComplete(t, p.id, p.answers)));
  const stepDone = {
    topic: draft.topics.length > 0,
    details: hasItem || !!skipped.details,
    actions: draft.actions.some((a) => a.group === 'other' || a.options.length > 0) || !!skipped.actions,
    result: (!!draft.result && (draft.result.value !== 'Barrier' || !!draft.result.barrier)) || !!skipped.result,
    response: draft.response.length > 0 || !!skipped.response,
    next: (!!draft.next && (nextWho(draft.next).includes('None') || !!draft.next.timing || [...draft.next.cm, ...draft.next.consumer, ...draft.next.third].length > 0 || !!draft.next.thirdWho)) || !!skipped.next,
  };
  const who = nextWho(draft.next);
  // With several topics, steps 3 to 6 are for the whole contact, not one topic.
  const acrossTopics = draft.topics.length > 1 ? 'Covers all topics' : '';
  const hint = (...parts: string[]) => parts.filter(Boolean).join('. ') || undefined;
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

  // ---- step 2 helpers
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

  const summary = summarize(draft);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-3">
        {/* 1. Topic */}
        <Step n={1} title="What was this visit about?" hint={draft.topics.length > 1 ? '★ marks the main focus' : 'Choose one or more'}>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((t) => {
              const on = draft.topics.includes(t.id);
              const isPrimary = draft.topics[0] === t.id;
              return (
                <div key={t.id} className="relative">
                  <Chip
                    selected={on}
                    className={on && draft.topics.length > 1 ? 'pr-8' : undefined}
                    onClick={() =>
                      update((d) => {
                        d.topics = toggle(d.topics, t.id);
                        if (!d.topics.includes(t.id)) delete d.items[t.id];
                        return d;
                      })
                    }
                  >
                    {t.label}
                  </Chip>
                  {on && draft.topics.length > 1 && (
                    <button
                      type="button"
                      title={isPrimary ? 'Primary topic' : 'Make primary'}
                      aria-label={isPrimary ? `${t.label} is the primary topic` : `Make ${t.label} the primary topic`}
                      onClick={() => update((d) => ({ ...d, topics: [t.id, ...d.topics.filter((x) => x !== t.id)] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-foreground"
                    >
                      <Star className={cn('h-4 w-4', isPrimary ? 'fill-current' : 'opacity-60')} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Step>

        {/* 2. Details per topic */}
        {stepDone.topic && (
          <Step n={2} title="What topics did you discuss?" hint="Choose all that apply" onSkip={hasItem || skipped.details ? undefined : () => setSkipped((s) => ({ ...s, details: true }))}>
            <div className="space-y-4">
              {draft.topics.map((topicId) => {
                const topic = topicById(topicId);
                if (!topic) return null;
                const picked = draft.items[topicId] ?? [];
                const ctxQ = topic.context;
                return (
                  <div key={topicId} className="space-y-2.5">
                    {draft.topics.length > 1 && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{topic.label}</p>}
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
                      {topic.items.map((it) => (
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
            </div>
          </Step>
        )}

        {/* 3. What CM did */}
        {stepDone.topic && stepDone.details && (
          <Step n={3} title={`What did ${TERMS.cm} do?`} hint={hint(acrossTopics, 'Select all that apply')} onSkip={stepDone.actions ? undefined : () => setSkipped((s) => ({ ...s, actions: true }))}>
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
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">What else did {TERMS.cm} do?</p>
                    <Input value={draft.actionsOther} maxLength={200} onChange={(e) => update((d) => ({ ...d, actionsOther: e.target.value }))} className="h-9" />
                  </div>
                );
              }
              const g = ACTIONS.find((x) => x.id === a.group);
              if (!g) return null;
              return (
                <div key={a.group} className={cn('rounded-lg border p-3', a.options.length ? 'bg-muted/30' : 'border-primary/40 bg-primary/5')}>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">{g.label}</p>
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
                </div>
              );
            })}
          </Step>
        )}

        {/* 4. Result */}
        {stepDone.topic && stepDone.details && stepDone.actions && (
          <Step n={4} title="What was the result?" hint={hint(acrossTopics)} onSkip={stepDone.result ? undefined : () => setSkipped((s) => ({ ...s, result: true }))}>
            <div className="flex flex-wrap gap-2">
              {Object.keys(RESULTS).map((r) => (
                <Chip
                  key={r}
                  selected={draft.result?.value === r}
                  onClick={() => update((d) => ({ ...d, result: d.result?.value === r ? null : { value: r } }))}
                >
                  {r}
                </Chip>
              ))}
            </div>
            {draft.result?.value === 'Barrier' && (
              <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">What was the barrier?</p>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(BARRIERS).map((b) => (
                    <Chip key={b} size="sm" selected={draft.result?.barrier === b} onClick={() => update((d) => ({ ...d, result: { value: 'Barrier', barrier: b, barrierOther: d.result?.barrierOther } }))}>
                      {b}
                    </Chip>
                  ))}
                </div>
                {draft.result.barrier === 'Other' && (
                  <Input
                    className="mt-2 h-9"
                    placeholder="Briefly, what barrier?"
                    maxLength={150}
                    value={draft.result.barrierOther ?? ''}
                    onChange={(e) => update((d) => ({ ...d, result: { ...(d.result as NonNullable<NoteDraft['result']>), barrierOther: e.target.value } }))}
                  />
                )}
              </div>
            )}
          </Step>
        )}

        {/* 5. Consumer response (optional) */}
        {stepDone.topic && stepDone.details && stepDone.actions && stepDone.result && (
          <Step n={5} title="How did the client respond?" hint={hint(acrossTopics, 'Optional')} onSkip={stepDone.response ? undefined : () => setSkipped((s) => ({ ...s, response: true }))}>
            <div className="flex flex-wrap gap-2">
              {Object.keys(RESPONSES).map((r) => (
                <Chip key={r} selected={draft.response.includes(r)} onClick={() => update((d) => ({ ...d, response: toggle(d.response, r) }))}>
                  {r}
                </Chip>
              ))}
            </div>
            {draft.response.includes('Other') && (
              <Input className="h-9" placeholder="Briefly, the client's response" maxLength={200} value={draft.responseOther} onChange={(e) => update((d) => ({ ...d, responseOther: e.target.value }))} />
            )}
          </Step>
        )}

        {/* 6. Next step */}
        {stepDone.topic && stepDone.details && stepDone.actions && stepDone.result && stepDone.response && (
          <Step
            n={6}
            title="Who is responsible for the next step?"
            hint={hint(acrossTopics, 'Select all that apply')}
            onSkip={stepDone.next ? undefined : () => setSkipped((s) => ({ ...s, next: true }))}
          >
            <div className="flex flex-wrap gap-2">
              {NEXT_WHO.map((w) => (
                <Chip
                  key={w}
                  selected={who.includes(w)}
                  onClick={() =>
                    update((d) => {
                      const cur = nextWho(d.next);
                      // "No next step" stands alone; picking anyone else clears it.
                      const list = cur.includes(w) ? cur.filter((x) => x !== w) : w === 'None' ? ['None'] : [...cur.filter((x) => x !== 'None'), w];
                      if (!list.length) return { ...d, next: null };
                      const prev: NonNullable<NoteDraft['next']> = d.next ?? { who: [], cm: [], consumer: [], third: [], other: '' };
                      return {
                        ...d,
                        next: {
                          ...prev,
                          who: list,
                          // Answers for someone no longer responsible are dropped.
                          cm: list.includes('CM') ? prev.cm : [],
                          consumer: list.includes('Consumer') ? prev.consumer : [],
                          third: list.includes('Third party') ? prev.third : [],
                          thirdWho: list.includes('Third party') ? prev.thirdWho : undefined,
                          timing: list.includes('None') ? undefined : prev.timing,
                          date: list.includes('None') ? undefined : prev.date,
                        },
                      };
                    })
                  }
                >
                  {NEXT_WHO_LABELS[w]}
                </Chip>
              ))}
            </div>
            {draft.next && who.length > 0 && !who.includes('None') && (
              <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
                {who.includes('CM') && (
                  <NextChoices label={`What will ${TERMS.cm} do?`} options={NEXT_CM} value={draft.next.cm} onChange={(cm) => update((d) => ({ ...d, next: { ...d.next!, cm } }))} />
                )}
                {who.includes('Consumer') && (
                  <NextChoices label="What will the client do?" options={NEXT_CONSUMER} value={draft.next.consumer} onChange={(consumer) => update((d) => ({ ...d, next: { ...d.next!, consumer } }))} />
                )}
                {who.includes('Third party') && (
                  <>
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Who are you waiting on?</p>
                      <div className="flex flex-wrap gap-2">
                        {Object.keys(THIRD_PARTIES).map((t) => (
                          <Chip key={t} size="sm" selected={draft.next?.thirdWho === t} onClick={() => update((d) => ({ ...d, next: { ...d.next!, thirdWho: d.next?.thirdWho === t ? undefined : t } }))}>
                            {t}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <NextChoices label="What are you waiting for them to do?" options={NEXT_THIRD} value={draft.next.third} onChange={(third) => update((d) => ({ ...d, next: { ...d.next!, third } }))} />
                  </>
                )}
                {[...draft.next.cm, ...draft.next.consumer, ...draft.next.third].includes('Other') && (
                  <Input className="h-9" placeholder="Briefly, what is next?" maxLength={150} value={draft.next.other} onChange={(e) => update((d) => ({ ...d, next: { ...d.next!, other: e.target.value } }))} />
                )}
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">When should it happen?</p>
                  <div className="flex flex-wrap items-center gap-2">
                    {Object.keys(TIMING).map((t) => (
                      <Chip key={t} size="sm" selected={draft.next?.timing === t} onClick={() => update((d) => ({ ...d, next: { ...d.next!, timing: d.next?.timing === t ? undefined : t } }))}>
                        {t}
                      </Chip>
                    ))}
                    {draft.next.timing === SPECIFIC_DATE && (
                      <Input type="date" className="h-8 w-40" value={draft.next.date ?? ''} onChange={(e) => update((d) => ({ ...d, next: { ...d.next!, date: e.target.value } }))} />
                    )}
                  </div>
                </div>
              </div>
            )}
          </Step>
        )}

        {/* Free text */}
        {stepDone.topic && (stepDone.next || encourageText) && (
          <section className="space-y-2 rounded-xl border bg-white p-4">
            <h3 className="font-semibold">Anything important we haven't captured?</h3>
            <p className="text-xs text-muted-foreground">
              {encourageText ? "Add the context the choices can't capture. " : 'Optional. '}Add 1–3 sentences. We'll tidy the wording without changing what you mean.
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
            <p className="text-sm text-muted-foreground">Nothing yet. Start by choosing what the contact was about.</p>
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

const NextChoices: React.FC<{
  label: string;
  options: Record<string, unknown>;
  value: string[];
  onChange: (v: string[]) => void;
}> = ({ label, options, value, onChange }) => (
  <div>
    <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>
    <div className="flex flex-wrap gap-2">
      {Object.keys(options).map((o) => (
        <Chip key={o} size="sm" selected={value.includes(o)} onClick={() => onChange(toggle(value, o))}>
          {o}
        </Chip>
      ))}
    </div>
  </div>
);
