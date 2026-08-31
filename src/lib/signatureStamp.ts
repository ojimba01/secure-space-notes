import { PDFDocument } from 'pdf-lib';

/**
 * Draw a signature onto a filled form.
 *
 * The signature block is at the end of every one of these forms, so the mark
 * goes on the last page above the footer. A PDF signature widget is used when
 * the template carries one, because that is where the form itself expects it.
 *
 * The image is transparent apart from the ink, so it sits over a printed
 * signature line rather than covering it with a white box.
 */
export async function stampSignature(
  pdfBytes: ArrayBuffer | Uint8Array,
  pngBytes: ArrayBuffer,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const png = await doc.embedPng(pngBytes);
  const pages = doc.getPages();
  const page = pages[pages.length - 1];

  // Where the template says the signature goes, if it says.
  let box: { x: number; y: number; width: number; height: number } | null = null;
  try {
    for (const field of doc.getForm().getFields()) {
      if (field.constructor.name !== 'PDFSignature') continue;
      const widget = field.acroField.getWidgets()[0];
      if (!widget) continue;
      const r = widget.getRectangle();
      if (r.width > 20 && r.height > 8) box = r;
      break;
    }
  } catch {
    // A template with no form at all. The fallback below still works.
  }

  const { width: pageWidth } = page.getSize();
  const target = box ?? { x: 60, y: 90, width: Math.min(220, pageWidth - 120), height: 48 };

  // Fit inside the box without stretching it out of shape.
  const scale = Math.min(target.width / png.width, target.height / png.height);
  const width = png.width * scale;
  const height = png.height * scale;

  page.drawImage(png, {
    x: target.x + (target.width - width) / 2,
    y: target.y + (target.height - height) / 2,
    width,
    height,
  });

  return doc.save();
}
