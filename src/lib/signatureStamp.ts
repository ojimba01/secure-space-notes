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
export async function defaultPlacement(
  pdfBytes: ArrayBuffer | Uint8Array,
  aspect: number,
): Promise<SignaturePlacement> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const pages = doc.getPages();

  try {
    for (const field of doc.getForm().getFields()) {
      if (field.constructor.name !== 'PDFSignature') continue;
      const widget = field.acroField.getWidgets()[0];
      if (!widget) continue;
      const rect = widget.getRectangle();
      if (rect.width < 20 || rect.height < 8) continue;

      // Which page the field is actually on. The LON's signature line is on
      // page 6 of 10, and assuming the last page put the mark six pages past
      // where the form asks for it.
      const pageRef = widget.P();
      const index = pages.findIndex((page) => page.ref === pageRef);
      const pageIndex = index >= 0 ? index : pages.length - 1;
      const { width: pw, height: ph } = pages[pageIndex].getSize();

      // The signature line runs the width of the page; a signature does not.
      // Fit the height and keep the shape, sitting at the left of the line
      // where somebody signing by hand would start.
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
  } catch {
    // No form at all. The fallback below is the answer for those.
  }

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
