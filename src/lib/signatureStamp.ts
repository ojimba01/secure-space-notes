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
  const lastIndex = pages.length - 1;
  const { width: pw, height: ph } = pages[lastIndex].getSize();

  try {
    for (const field of doc.getForm().getFields()) {
      if (field.constructor.name !== 'PDFSignature') continue;
      const widget = field.acroField.getWidgets()[0];
      if (!widget) continue;
      const r = widget.getRectangle();
      if (r.width < 20 || r.height < 8) continue;
      for (let i = 0; i < pages.length; i += 1) {
        const size = pages[i].getSize();
        return {
          pageIndex: i === lastIndex ? lastIndex : lastIndex,
          x: r.x / size.width,
          y: 1 - (r.y + r.height) / size.height,
          width: r.width / size.width,
          height: r.height / size.height,
        };
      }
    }
  } catch {
    // No form at all. The fallback below is the answer for those.
  }

  const width = Math.min(0.32, 240 / pw);
  return {
    pageIndex: lastIndex,
    x: 0.1,
    y: 1 - 140 / ph,
    width,
    height: width * (pw / ph) / aspect,
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
