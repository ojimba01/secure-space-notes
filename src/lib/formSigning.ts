import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const FORM_TYPES = [
  'Initial Assessment Tool',
  'Level of Need Assessment Tool',
  'Housing Stabilization Plan',
  'Other',
] as const;

export type FormType = (typeof FORM_TYPES)[number];

export const FORM_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Awaiting approval',
  approved: 'Approved',
  changes_requested: 'Changes requested',
};

/** Flatten form fields so the completed values can no longer be edited. */
const flattenSafely = (pdf: PDFDocument) => {
  try {
    pdf.getForm().flatten();
  } catch {
    // Some PDFs use field types pdf-lib cannot flatten; leaving them is acceptable.
  }
};

interface SignOptions {
  /** PNG data URL captured from the signature pad. */
  signatureDataUrl: string;
  signerName: string;
  signerRole?: string;
}

/**
 * Stamps the drawn signature, signer name and UTC timestamp onto the last page
 * of the uploaded PDF, then flattens it. Returns the new PDF bytes.
 */
export async function signPdf(file: File, opts: SignOptions): Promise<Uint8Array> {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  flattenSafely(pdf);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pngBytes = await fetch(opts.signatureDataUrl).then((r) => r.arrayBuffer());
  const png = await pdf.embedPng(pngBytes);

  const page = pdf.getPages()[pdf.getPageCount() - 1];
  const { width } = page.getSize();
  const boxWidth = Math.min(280, width - 80);
  const scale = boxWidth / png.width;
  const imgHeight = png.height * scale;

  const baseY = 54;
  page.drawRectangle({
    x: 36,
    y: baseY - 6,
    width: boxWidth + 16,
    height: imgHeight + 52,
    borderColor: rgb(0.72, 0.72, 0.75),
    borderWidth: 0.75,
  });
  page.drawImage(png, {
    x: 44,
    y: baseY + 34,
    width: boxWidth,
    height: imgHeight,
  });
  const stamp = `${opts.signerName}${opts.signerRole ? ` — ${opts.signerRole}` : ''}`;
  page.drawText(`Signed electronically by ${stamp}`, {
    x: 44,
    y: baseY + 18,
    size: 8,
    font,
    color: rgb(0.2, 0.2, 0.24),
  });
  page.drawText(`${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`, {
    x: 44,
    y: baseY + 6,
    size: 8,
    font,
    color: rgb(0.38, 0.38, 0.42),
  });

  return pdf.save();
}

/** Adds a manager approval line to the last page of an already-signed PDF. */
export async function stampApproval(
  pdfBytes: ArrayBuffer,
  approverName: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  flattenSafely(pdf);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.getPages()[pdf.getPageCount() - 1];
  const { width } = page.getSize();

  page.drawText('APPROVED', {
    x: width - 170,
    y: 76,
    size: 14,
    font,
    color: rgb(0.05, 0.45, 0.2),
  });
  page.drawText(`by ${approverName}`, {
    x: width - 170,
    y: 62,
    size: 8,
    font,
    color: rgb(0.2, 0.2, 0.24),
  });
  page.drawText(`${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`, {
    x: width - 170,
    y: 50,
    size: 8,
    font,
    color: rgb(0.38, 0.38, 0.42),
  });

  return pdf.save();
}
