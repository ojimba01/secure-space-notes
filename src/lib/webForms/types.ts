// A PDF form drawn as a web form. Each item fills one box of the PDF, by the
// box's name; the PDF stays the saved record.

/** Show an item only while another answer is the given one. */
export interface ShowIf {
  field: string;
  /** A choice's value, or true for a ticked box. */
  value: string | boolean;
}

export type WebFormItem =
  | { kind: 'heading'; label: string; showIf?: ShowIf }
  | { kind: 'text'; field: string; label: string; wide?: boolean; multiline?: boolean; showIf?: ShowIf }
  | { kind: 'choice'; field: string; label: string; options: { value: string; label: string }[]; showIf?: ShowIf }
  | { kind: 'checks'; label: string; options: { field: string; label: string }[]; showIf?: ShowIf };

export interface WebFormSection {
  title: string;
  items: WebFormItem[];
}

export type WebFormSchema = WebFormSection[];

/** Every PDF box a schema fills, for checking it against the template. */
export function schemaFields(schema: WebFormSchema): string[] {
  return schema.flatMap((s) =>
    s.items.flatMap((i) =>
      i.kind === 'text' || i.kind === 'choice' ? [i.field] : i.kind === 'checks' ? i.options.map((o) => o.field) : [],
    ),
  );
}
