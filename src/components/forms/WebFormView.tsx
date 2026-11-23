// A PDF form drawn as a web form (src/lib/webForms). The PDF stays loaded
// behind it: every answer here is written straight into the matching box of
// the PDF, so saving, autosave, signatures and Download copy work on the very
// same document the PDF view shows.
import React, { useEffect, useMemo, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import type { WebFormItem, WebFormSchema } from '@/lib/webForms/types';
import type { FormComment, TrackedChange } from '@/lib/formComments';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FieldObject {
  id: string;
  type: string;
  value?: unknown;
  exportValues?: string;
  /** A dropdown's options. */
  items?: { exportValue: string; displayValue: string }[];
}

type Storage = {
  getValue: (id: string, fallback: { value: unknown }) => { value: unknown };
  setValue: (id: string, value: { value: unknown; formattedValue?: string }) => void;
};

/** Export values are spelt differently by different tools ("4+_Bedrooms", "4__Bedrooms"). */
const same = (a: unknown, b: unknown) =>
  String(a ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase() === String(b ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase();

const isChecked = (storage: Storage, o: FieldObject) =>
  storage.getValue(o.id, { value: o.value !== undefined && o.value !== 'Off' && same(o.value, o.exportValues) }).value === true;

export const WebFormView: React.FC<{
  doc: PDFDocumentProxy;
  schema: WebFormSchema;
  /** Any answer changed. */
  onChange: () => void;
  /** Runs after a change, before the answers are read back (the LON's total). */
  afterChange?: () => Promise<void>;
  /** Shown under a question: its comments, and a way to add one. */
  renderExtras?: (field: string, label: string) => React.ReactNode;
  /** On the whole page: as wide as the screen, up to three questions across. */
  wide?: boolean;
  /** In the margin beside a question's label: a supervisor's comment icon. */
  renderMargin?: (field: string, label: string) => React.ReactNode;
  /**
   * The person who filled the form reading a supervisor's review, as in Word:
   * every answer, the changes made (old struck through, new underlined) and
   * the comments in the right margin. Nothing can be edited here.
   */
  review?: ReviewMarks;
}> = ({ doc, schema, onChange, afterChange, renderExtras, wide = false, renderMargin, review }) => {
  /** Across the whole row: every column on a wide page. */
  const full = wide ? 'sm:col-span-2 xl:col-span-3' : 'sm:col-span-2';
  const storage = (doc as unknown as { annotationStorage: Storage }).annotationStorage;
  const [fields, setFields] = useState<Record<string, FieldObject[]> | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});

  /** Every answer, as the PDF holds it now. */
  const readAll = (all: Record<string, FieldObject[]>) => {
      const read: Record<string, string | boolean> = {};
      for (const [name, list] of Object.entries(all)) {
        const first = list[0];
        if (!first) continue;
        if (first.type === 'radiobutton') {
          read[name] = list.find((o) => isChecked(storage, o))?.exportValues ?? '';
        } else if (first.type === 'checkbox') {
          read[name] = isChecked(storage, first);
        } else if (first.type === 'combobox' || first.type === 'listbox') {
          const v = storage.getValue(first.id, { value: first.value ?? '' }).value;
          read[name] = String((Array.isArray(v) ? v[0] : v) ?? '').trim();
        } else {
          read[name] = String(storage.getValue(first.id, { value: first.value ?? '' }).value ?? '');
        }
      }
      return read;
  };

  useEffect(() => {
    let cancelled = false;
    void doc.getFieldObjects().then((objs) => {
      if (cancelled) return;
      const all = (objs ?? {}) as Record<string, FieldObject[]>;
      // A box can be listed with an empty entry first: its container in the
      // PDF, with no type and no choices (the LON's Score_14). Keep only the
      // boxes themselves, so that box's choices show and its answer is read.
      for (const [name, list] of Object.entries(all)) {
        const boxes = list.filter((o) => o.type);
        if (boxes.length && boxes.length < list.length) all[name] = boxes;
      }
      setFields(all);
      setValues(readAll(all));
    });
    return () => {
      cancelled = true;
    };
  }, [doc, storage]);

  const setText = (name: string, value: string) => {
    // The shown text too: pdf.js otherwise keeps drawing a pre-filled box's
    // old text in the PDF view, though the new answer is what gets saved.
    for (const o of fields?.[name] ?? []) storage.setValue(o.id, { value, formattedValue: value });
    setValues((v) => ({ ...v, [name]: value }));
    onChange();
  };

  const setChoice = (name: string, option: string) => {
    const list = fields?.[name] ?? [];
    // Selecting the chosen answer again clears it.
    const clearing = same(values[name], option);
    for (const o of list) storage.setValue(o.id, { value: !clearing && same(o.exportValues, option) });
    setValues((v) => ({ ...v, [name]: clearing ? '' : list.find((o) => same(o.exportValues, option))?.exportValues ?? option }));
    onChange();
  };

  /** After any change: let the form work out what follows from it, then show it. */
  const settle = () => {
    if (!afterChange || !fields) return;
    void afterChange().then(() => setValues(readAll(fields)));
  };

  const setSelect = (name: string, option: string) => {
    for (const o of fields?.[name] ?? []) storage.setValue(o.id, { value: option });
    setValues((v) => ({ ...v, [name]: option }));
    onChange();
    settle();
  };

  const setCheck = (name: string, checked: boolean) => {
    for (const o of fields?.[name] ?? []) storage.setValue(o.id, { value: checked });
    setValues((v) => ({ ...v, [name]: checked }));
    onChange();
  };

  const shown = (item: WebFormItem) => {
    if (!item.showIf) return true;
    const current = values[item.showIf.field];
    if (item.showIf.value === '*') return current === true || (typeof current === 'string' && current.trim() !== '');
    return typeof item.showIf.value === 'boolean' ? current === item.showIf.value : same(current, item.showIf.value);
  };

  const missing = useMemo(() => {
    if (!fields) return [];
    return schema.flatMap((s) =>
      s.items.flatMap((i) =>
        i.kind === 'text' || i.kind === 'choice' || i.kind === 'select'
          ? fields[i.field] ? [] : [i.field]
          : i.kind === 'checks'
            ? i.options.filter((o) => !fields[o.field]).map((o) => o.field)
            : [],
      ),
    );
  }, [fields, schema]);

  if (!fields) return <p className="p-8 text-center text-sm text-muted-foreground">Loading form...</p>;

  if (review) return <ReviewDocument schema={schema} values={values} review={review} shown={shown} wide={wide} />;

  return (
    <div className={wide ? 'mx-auto max-w-[1600px] space-y-4' : 'mx-auto max-w-3xl space-y-4'}>
      {missing.length > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Some questions are not on this copy of the form: {missing.join(', ')}. Select PDF to fill it in directly.
        </p>
      )}
      {schema.map((section) => (
        <section key={section.title} className="rounded-lg border bg-background">
          <h3 className="rounded-t-lg bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground">
            {section.title}
          </h3>
          <div className={`grid gap-x-4 gap-y-4 p-4 sm:grid-cols-2 ${wide ? 'xl:grid-cols-3' : ''}`}>
            {section.items.filter(shown).map((item, i) => {
              if (item.kind === 'heading') {
                return (
                  <p key={`h${i}`} className={`pt-1 text-sm font-semibold ${full}`}>
                    {item.label}
                  </p>
                );
              }
              if (item.kind === 'text') {
                const id = `wf-${item.field}`;
                return (
                  <div key={item.field} className={`space-y-1.5 ${item.multiline ? full : item.wide ? 'sm:col-span-2' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <label htmlFor={id} className="text-sm font-medium">
                        {item.label}
                      </label>
                      {renderMargin?.(item.field, item.label)}
                    </div>
                    {item.multiline ? (
                      <Textarea
                        id={id}
                        rows={3}
                        value={String(values[item.field] ?? '')}
                        onChange={(e) => setText(item.field, e.target.value)}
                      />
                    ) : (
                      <Input id={id} value={String(values[item.field] ?? '')} onChange={(e) => setText(item.field, e.target.value)} />
                    )}
                    {renderExtras?.(item.field, item.label)}
                  </div>
                );
              }
              if (item.kind === 'select') {
                const options = fields[item.field]?.[0]?.items ?? [];
                return (
                  <div key={item.field} className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <label htmlFor={`wf-${item.field}`} className="text-sm font-medium">
                        {item.label}
                      </label>
                      {renderMargin?.(item.field, item.label)}
                    </div>
                    <select
                      id={`wf-${item.field}`}
                      value={String(values[item.field] ?? '')}
                      onChange={(e) => setSelect(item.field, e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Select</option>
                      {options.map((o) => (
                        <option key={o.exportValue} value={o.exportValue}>
                          {o.displayValue}
                        </option>
                      ))}
                    </select>
                    {renderExtras?.(item.field, item.label)}
                  </div>
                );
              }
              if (item.kind === 'choice') {
                return (
                  <div key={item.field} className={`space-y-1.5 ${full}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      {renderMargin?.(item.field, item.label)}
                    </div>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={item.label}>
                      {item.options.map((o) => {
                        const on = same(values[item.field], o.value);
                        return (
                          <button
                            key={o.value}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => setChoice(item.field, o.value)}
                            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                              on ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                    {renderExtras?.(item.field, item.label)}
                  </div>
                );
              }
              return (
                <div key={`c${i}`} className={`space-y-1.5 ${full}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{item.label}</p>
                    {renderMargin?.(item.options[0]?.field ?? item.label, item.label)}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {item.options.map((o) => (
                      <label key={o.field} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={values[o.field] === true} onCheckedChange={(c) => setCheck(o.field, c === true)} />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  {renderExtras?.(item.options[0]?.field ?? item.label, item.label)}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export interface ReviewMarks {
  /** The latest change to each answer, by the PDF box's name. */
  changes: Map<string, TrackedChange>;
  /** Comments on the form, on a question (field) or on the whole form. */
  comments: FormComment[];
  authorName: (id: string | null) => string;
  /** Marks a comment done; absent when the reader cannot. */
  onResolve?: (id: string) => void;
}

const yes = (v: unknown) => v === true || /^(yes|on|true)$/i.test(String(v ?? ''));

/** An answer as written: deleted text struck through in red, inserted text underlined in green. */
const Tracked: React.FC<{ before: string; after: string }> = ({ before, after }) => (
  <span className="space-x-1.5">
    {before && <del className="rounded-sm bg-red-50 px-0.5 text-red-700 decoration-red-600">{before}</del>}
    {after && <ins className="rounded-sm bg-green-50 px-0.5 text-green-800 underline decoration-green-600 underline-offset-2">{after}</ins>}
  </span>
);

/** One comment, as a Word margin balloon. */
const Balloon: React.FC<{ c: FormComment; authorName: (id: string | null) => string; onResolve?: (id: string) => void }> = ({ c, authorName, onResolve }) => (
  <div className={`rounded-md border-l-4 p-2.5 text-sm shadow-sm ${c.resolved_at ? 'border-l-muted bg-muted/40 text-muted-foreground' : 'border-l-amber-500 bg-amber-50'}`}>
    <p className="text-xs font-semibold">{authorName(c.author_id)}</p>
    {c.quote && (
      <p className="mt-0.5 text-xs">
        On <mark className="rounded-sm bg-yellow-200 px-0.5">{c.quote}</mark>
      </p>
    )}
    <p className="mt-0.5">{c.body}</p>
    {!c.resolved_at && onResolve && (
      <Button size="sm" variant="outline" className="mt-1.5 h-7 bg-white" onClick={() => onResolve(c.id)}>
        <Check className="mr-1 h-3.5 w-3.5" />
        Done
      </Button>
    )}
  </div>
);

const ReviewDocument: React.FC<{
  schema: WebFormSchema;
  values: Record<string, string | boolean>;
  review: ReviewMarks;
  shown: (item: WebFormItem) => boolean;
  wide: boolean;
}> = ({ schema, values, review, shown, wide }) => {
  const { changes, comments, authorName, onResolve } = review;
  const formComments = comments.filter((c) => !c.field);
  const commentsFor = (fields: string[]) => comments.filter((c) => c.field && fields.includes(c.field));
  const blank = <span className="text-muted-foreground">Blank</span>;

  const answer = (item: WebFormItem): React.ReactNode => {
    if (item.kind === 'heading') return null;
    if (item.kind === 'checks') {
      const ticked = item.options.filter((o) => yes(values[o.field]) || changes.has(o.field));
      if (!ticked.length) return blank;
      return (
        <span className="flex flex-wrap gap-x-4 gap-y-1">
          {ticked.map((o) => {
            const ch = changes.get(o.field);
            if (!ch) return <span key={o.field}>☑ {o.label}</span>;
            return yes(ch.after) ? (
              <Tracked key={o.field} before="" after={`☑ ${o.label}`} />
            ) : (
              <Tracked key={o.field} before={`☑ ${o.label}`} after="" />
            );
          })}
        </span>
      );
    }
    const label = (v: string) =>
      item.kind === 'choice' ? item.options.find((o) => o.value.replace(/[^a-z0-9]/gi, '').toLowerCase() === v.replace(/[^a-z0-9]/gi, '').toLowerCase())?.label ?? v : v;
    const ch = changes.get(item.field);
    if (ch) return <Tracked before={label(ch.before)} after={label(ch.after)} />;
    const now = String(values[item.field] ?? '').trim();
    return now ? label(now) : blank;
  };

  return (
    <div className={wide ? 'mx-auto max-w-[1600px] space-y-4' : 'mx-auto max-w-4xl space-y-4'}>
      <div className="flex flex-wrap items-center gap-4 rounded-md border bg-background px-4 py-2 text-sm">
        <span>
          <span className="font-semibold">{changes.size}</span> {changes.size === 1 ? 'change' : 'changes'}
        </span>
        <span>
          <span className="font-semibold">{comments.filter((c) => !c.resolved_at).length}</span> open comments
        </span>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <del className="text-red-700">Removed</del>
          <ins className="text-green-800 underline">Added</ins>
          <mark className="bg-yellow-200 px-0.5">Commented</mark>
        </span>
      </div>
      {formComments.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {formComments.map((c) => (
            <Balloon key={c.id} c={c} authorName={authorName} onResolve={onResolve} />
          ))}
        </div>
      )}
      {schema.map((section) => (
        <section key={section.title} className="rounded-lg border bg-background">
          <h3 className="rounded-t-lg bg-primary px-4 py-2 text-sm font-semibold uppercase tracking-wide text-primary-foreground">
            {section.title}
          </h3>
          <div className="divide-y">
            {section.items.filter(shown).map((item, i) => {
              if (item.kind === 'heading') {
                return (
                  <p key={`h${i}`} className="px-4 pb-1 pt-3 text-sm font-semibold">
                    {item.label}
                  </p>
                );
              }
              const fields = item.kind === 'checks' ? item.options.map((o) => o.field) : [item.field];
              const balloons = commentsFor(fields);
              const changed = fields.some((f) => changes.has(f));
              return (
                <div key={fields[0] ?? i} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_280px]">
                  <div className={`min-w-0 ${changed ? 'border-l-2 border-l-red-500 pl-3' : ''}`}>
                    <p className="text-sm text-muted-foreground">{item.label}</p>
                    <div className="mt-0.5 text-sm [overflow-wrap:anywhere]">{answer(item)}</div>
                  </div>
                  <div className="space-y-2">
                    {balloons.map((c) => (
                      <Balloon key={c.id} c={c} authorName={authorName} onResolve={onResolve} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
