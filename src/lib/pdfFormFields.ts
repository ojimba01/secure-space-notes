// Making the big answer boxes behave like big answer boxes.
//
// The Client Intake template was generated with `/MaxLen 100` on every one of
// its text fields. On a name or a phone number that is invisible; on the tall
// boxes — "List all medical diagnoses", "What is your schedule with your
// therapist", "List all mental health diagnoses" — 100 characters is roughly
// one line across, so typing simply stopped a third of the way down a box with
// five lines of room in it.
//
// The same fields carry a fixed 10pt font, which is the second half of the
// problem: pdf.js writes the appearance stream when the form is saved, and at a
// fixed size everything past the bottom of the box is cut out of the printed
// page. With an auto-sized font (`0 Tf`) it measures the answer and shrinks it
// towards fitting instead. Not quite exactly — pdf.js sizes its lines by the
// font size and then draws them a third further apart, so the last line of a
// very long answer still lands just below the box — but the answer itself is
// never truncated: the field keeps every character, and it is the field that
// the client record is read back out of.
//
// So: every multi-line field loses its length cap and gets an auto-sized font.
// Single-line fields keep theirs — a date of birth that runs past its box is a
// mistake, not a long answer.
import { PDFDocument, PDFFont, PDFTextField, StandardFonts } from 'pdf-lib';

/**
 * The size in a field's default appearance, which reads like `/Helv 10 Tf 0 g`.
 * 0 means size-to-fit; undefined means the field has no default appearance of
 * its own and inherits the form's, which we leave alone.
 */
function defaultFontSize(field: PDFTextField): number | undefined {
  const da = field.acroField.getDefaultAppearance();
  const size = da?.match(/(\d+(?:\.\d+)?)\s+Tf/)?.[1];
  return size === undefined ? undefined : Number(size);
}

/**
 * pdf-lib redraws any field it considers dirty when it saves, and its idea of
 * an auto-sized font is the size that fills the box — which for an empty box is
 * enormous, and it writes that size back into the field as a fixed one, undoing
 * the half of this fix that matters most. Nothing here needs new appearances:
 * the answers are unchanged, and pdf.js draws its own when the form is saved
 * from the viewer.
 */
const SAVE_OPTIONS = { updateFieldAppearances: false } as const;

/**
 * Lift the length cap and the fixed font size off every multi-line text field.
 * Mutates `doc` in place and returns how many fields it changed.
 */
export function relaxMultilineFields(doc: PDFDocument): number {
  let changed = 0;
  let fields: ReturnType<ReturnType<PDFDocument['getForm']>['getFields']>;
  try {
    fields = doc.getForm().getFields();
  } catch {
    // No AcroForm at all — a scan, or a flattened copy. Nothing to relax.
    return 0;
  }

  for (const field of fields) {
    if (!(field instanceof PDFTextField) || !field.isMultiline()) continue;
    // A combed field spaces its characters into MaxLen cells, so its cap is
    // the layout rather than a limit. Leave those exactly as they are.
    if (field.isCombed()) continue;

    let touched = false;
    if (field.getMaxLength() !== undefined) {
      field.setMaxLength(undefined);
      touched = true;
    }
    if ((defaultFontSize(field) ?? 0) > 0) {
      // 0 means "size it to fit" in an AcroForm default appearance.
      field.setFontSize(0);
      touched = true;
    }
    if (touched) changed += 1;
  }
  return changed;
}

/**
 * The same, over raw PDF bytes. Every form the fill dialog opens goes through
 * here, not just the blank template: drafts saved before this fix, and any
 * replacement template an admin uploaded to the registry, carry the old caps
 * too. A PDF that cannot be parsed comes back untouched — it is still a form
 * somebody needs to open.
 */
export async function relaxPdfFormFields(
  bytes: ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  const original = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    if (!relaxMultilineFields(doc)) return original;
    return await doc.save(SAVE_OPTIONS);
  } catch {
    return original;
  }
}

// ---------------------------------------------------------------------------
// Making the printed page carry the whole answer
// ---------------------------------------------------------------------------

/**
 * The largest type a printed answer uses. The form was drawn at 10pt and the
 * rest of it still is, so a two-word answer in a six-line box should not come
 * out in headline type just because there is room for it.
 */
const MAX_PRINTED_FONT_SIZE = 10;

/**
 * pdf.js sizes a multi-line answer by asking whether the lines, measured at the
 * font size, fit the box — and then draws them a third further apart than it
 * measured. So it settles on a size about one line too large, and that last
 * line is drawn just below the box, where nothing shows it. The answer is all
 * there in the field, and the client record reads it back in full, but a copy
 * printed or handed to an MCO is short a line.
 *
 * pdf-lib measures and draws to the same line height, so it does fit. After the
 * viewer has saved the form, every multi-line answer is drawn again through it,
 * capped at the form's own 10pt so short answers still look like the rest of
 * the page. The field's own value and its size-to-fit default appearance are
 * put back afterwards, so the next person to open the form is editing exactly
 * what was typed.
 */
export async function fitMultilineText(
  bytes: ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  const original = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    const answered = form
      .getFields()
      .filter(
        (f): f is PDFTextField =>
          f instanceof PDFTextField && f.isMultiline() && !f.isCombed() && !!f.getText(),
      );
    if (!answered.length) return original;

    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const undo: Array<() => void> = [];

    for (const field of answered) {
      const text = field.getText() ?? '';
      const appearance = field.acroField.getDefaultAppearance();
      const drawable = drawableText(text, helvetica);
      // Setting the text is also what marks the field for redrawing.
      field.setText(drawable);
      undo.push(() => {
        if (drawable !== text) field.setText(text);
        if (appearance !== undefined) field.acroField.setDefaultAppearance(appearance);
      });
    }
    form.updateFieldAppearances(helvetica);

    // Sizing to fit is a floor, not a target: where the answer is short enough
    // to be drawn larger than the form's own type, bring it back down.
    const oversized = answered.filter(
      (f) => (defaultFontSize(f) ?? 0) > MAX_PRINTED_FONT_SIZE,
    );
    for (const field of oversized) field.setFontSize(MAX_PRINTED_FONT_SIZE);
    if (oversized.length) form.updateFieldAppearances(helvetica);

    for (const restore of undo) restore();
    return await doc.save(SAVE_OPTIONS);
  } catch {
    // Never stand between a case manager and a submitted form. The viewer's
    // own rendering is what gets filed, exactly as it was before this step.
    return original;
  }
}

/**
 * The answer as the form's font can draw it. Helvetica's encoding covers Latin
 * text and ordinary punctuation, curly quotes and dashes included, but not
 * everything someone can type: "Nguyễn" would throw rather than print. Accents
 * it does not know are stripped to their base letter and anything still
 * unknown becomes a question mark, so the page shows an answer rather than
 * nothing at all. Only what is drawn is changed — the field keeps every
 * character exactly as it was typed, and that is what the client record and
 * every later edit read.
 */
function drawableText(text: string, font: PDFFont): string {
  const encodable = (s: string) => {
    try {
      font.encodeText(s);
      return true;
    } catch {
      return false;
    }
  };
  if (encodable(text)) return text;

  // Combining marks come off first: "ễ" is an "e" the font does know.
  const stripped = text.normalize('NFD').replace(/\p{M}+/gu, '').normalize('NFC');
  if (encodable(stripped)) return stripped;
  return [...stripped].map((c) => (encodable(c) ? c : '?')).join('');
}
