import { PDFDocument } from 'pdf-lib';

/**
 * Where a signature sits on a form.
 *
 * Fractions of the page rather than points, so the same placement means the
 * same thing on the screen preview and in the saved PDF, whatever size either
 * is being drawn at.
 *
 * `y` is measured from the top, like the screen. PDF measures from the bottom;
 * the conversion happens once, here, rather than in every caller.
 */
export interface SignaturePlacement {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the form itself expects the signature.
 *
 * The template's own signature field if it declares one, and otherwise above
 * the footer of the last page, which is where the signature block is on every
 * one of these forms.
 */
/**
 * The box each form wants the case manager's signature in.
 *
 * Read off the templates rather than guessed. Taking the first signature field
 * on a form is wrong on two of them: the HSP's first is the member's, and both
 * of the IAT's belong to the member and their parent or guardian.
 *
 * | Form           | Field                    | Page   |
 * |----------------|--------------------------|--------|
 * | Client Intake  | cert_staff_signature     | 7 of 7 |
 * | LON            | Signature2               | 6 of 10|
 * | HSP            | Case Manager Signature   | 6 of 6 |
 * | Wellpoint      | Signature                | 3 of 3 |
 * | IAT            | none - the member signs it        |
 * | Aetna          | none - the form has no signature line |
 *
 * The Client Intake's is a text box rather than a signature field, so the
 * lookup takes any field by name and does not care which kind it is.
 */
export const SIGNATURE_FIELD: Record<string, string> = {
  'Client Intake': 'cert_staff_signature',
  'Level of Need (LON)': 'Signature2',
  'Housing Stabilization Plan (HSP)': 'Case Manager Signature',
  'Prior Authorization Request': 'Signature',
};

/** Where the form wants the signature, and which page that is on. */
export async function defaultPlacement(
  pdfBytes: ArrayBuffer | Uint8Array,
  aspect: number,
  formType?: string,
): Promise<SignaturePlacement> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  const wanted = formType ? SIGNATURE_FIELD[formType] : undefined;

  try {
    const fields = doc.getForm().getFields();
    // The named box for this form.
    let field = wanted ? fields.find((f) => f.getName() === wanted) : undefined;

    // A template the state or an MCO reissues can rename its fields, and an
    // administrator can put that new file in without a code change. Rather
    // than dropping the mark at the foot of the last page, take a signature
    // box the form does have — but only on a form we know signs a case
    // manager, and never one the member or a guardian signs.
    if (wanted && !field) {
      field = fields.find((f) => {
        const name = f.getName().toLowerCase();
        if (/member|client|patient|parent|guardian|witness|physician|provider rep/.test(name)) {
          return false;
        }
        return /signature|signed|sign\b/.test(name);
      });
    }

    // Nothing is guessed on a form with no case manager's line of its own.
    // The first signature field on the IAT is the member's, and putting the
    // case manager's mark there is a filing error rather than a misplaced
    // picture. Those get the neutral spot below, to be dragged from.

    const widget = field?.acroField.getWidgets()[0];
    if (widget) {
      const rect = widget.getRectangle();
      if (rect.width >= 20 && rect.height >= 8) {
        const widgetRefs = field!.acroField
          .getWidgets()
          .map((w) => w.dict?.context?.getObjectRef?.(w.dict)?.toString())
          .filter(Boolean) as string[];
        const pageRef = widget.P()?.toString();

        let pageIndex = -1;
        for (let i = 0; i < pages.length; i += 1) {
          if (pageRef && pages[i].ref.toString() === pageRef) {
            pageIndex = i;
            break;
          }
          const annots = pages[i].node.Annots();
          if (!annots || widgetRefs.length === 0) continue;
          for (let a = 0; a < annots.size(); a += 1) {
            if (widgetRefs.includes(annots.get(a)?.toString() ?? '')) {
              pageIndex = i;
              break;
            }
          }
          if (pageIndex >= 0) break;
        }
        if (pageIndex < 0) pageIndex = pages.length - 1;

        const { width: pw, height: ph } = pages[pageIndex].getSize();
        // The line runs the width of the page; a signature does not. Fit the
        // height, keep the shape, sit at the left where a hand would start.
        let width = rect.height * aspect;
        if (width > rect.width) width = rect.width;
        const height = width / aspect;

        return {
          pageIndex,
          x: rect.x / pw,
          y: (ph - rect.y - rect.height + (rect.height - height) / 2) / ph,
          width: width / pw,
          height: height / ph,
        };
      }
    }
  } catch {
    // No form, or a field that cannot be measured. The fallback answers both.
  }

  // The IAT and the Aetna request have no line for a case manager, so the mark
  // lands above the footer of the last page and is dragged from there.
  const lastIndex = pages.length - 1;
  const { width: pw, height: ph } = pages[lastIndex].getSize();
  const width = Math.min(220, pw * 0.32);
  return {
    pageIndex: lastIndex,
    x: 60 / pw,
    y: (ph - 140) / ph,
    width: width / pw,
    height: width / aspect / ph,
  };
}

/**
 * Draw the signature where it has been placed and hand back the new bytes.
 *
 * The image is transparent apart from the ink, so it sits over a printed
 * signature line rather than covering it with a white box.
 */
export async function stampSignature(
  pdfBytes: ArrayBuffer | Uint8Array,
  pngBytes: ArrayBuffer,
  placement: SignaturePlacement,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const png = await doc.embedPng(pngBytes);
  const pages = doc.getPages();
  const page = pages[Math.min(placement.pageIndex, pages.length - 1)];
  const { width: pw, height: ph } = page.getSize();

  const width = placement.width * pw;
  const height = placement.height * ph;

  page.drawImage(png, {
    x: placement.x * pw,
    // Screen measures down from the top; the page measures up from the bottom.
    y: ph - placement.y * ph - height,
    width,
    height,
  });

  return doc.save();
}
