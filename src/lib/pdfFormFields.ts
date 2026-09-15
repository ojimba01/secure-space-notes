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
import { PDFDocument, PDFTextField } from 'pdf-lib';

/**
 * Whether this field pins its text to one size. The default appearance reads
 * like `/Helv 10 Tf 0 g`; a 0 there already means auto-size, and a field with
 * no default appearance at all inherits the form's, which we leave alone.
 */
function fixedFontSize(field: PDFTextField): boolean {
  const da = field.acroField.getDefaultAppearance();
  const size = da?.match(/(\d+(?:\.\d+)?)\s+Tf/)?.[1];
  return size !== undefined && Number(size) > 0;
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
    if (fixedFontSize(field)) {
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
