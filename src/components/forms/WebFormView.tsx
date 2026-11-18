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
}> = ({ doc, schema, onChange, afterChange }) => {
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
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
          <div className="grid gap-x-4 gap-y-4 p-4 sm:grid-cols-2">
            {section.items.filter(shown).map((item, i) => {
              if (item.kind === 'heading') {
                return (
                  <p key={`h${i}`} className="pt-1 text-sm font-semibold sm:col-span-2">
                    {item.label}
                  </p>
                );
              }
              if (item.kind === 'text') {
                const id = `wf-${item.field}`;
                return (
                  <div key={item.field} className={`space-y-1.5 ${item.wide || item.multiline ? 'sm:col-span-2' : ''}`}>
                    <label htmlFor={id} className="text-sm font-medium">
                      {item.label}
                    </label>
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
                  </div>
                );
              }
              if (item.kind === 'select') {
                const options = fields[item.field]?.[0]?.items ?? [];
                return (
                  <div key={item.field} className="space-y-1.5">
                    <label htmlFor={`wf-${item.field}`} className="text-sm font-medium">
                      {item.label}
                    </label>
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
                  </div>
                );
              }
              if (item.kind === 'choice') {
                return (
                  <div key={item.field} className="space-y-1.5 sm:col-span-2">
                    <p className="text-sm font-medium">{item.label}</p>
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
                  </div>
                );
              }
              return (
                <div key={`c${i}`} className="space-y-1.5 sm:col-span-2">
                  <p className="text-sm font-medium">{item.label}</p>
                  <div className="flex flex-wrap gap-x-5 gap-y-2">
                    {item.options.map((o) => (
                      <label key={o.field} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={values[o.field] === true} onCheckedChange={(c) => setCheck(o.field, c === true)} />
                        {o.label}
                      </label>
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
