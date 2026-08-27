// Deterministic document recognition.
//
// Identifies what an uploaded file IS, in three tiers, strongest first:
//
//   1. AcroForm fingerprint — the set of form-field names in a fillable PDF.
//      Unmistakable, and it also hands us the member's own answers.
//   2. Text-layer markers — the form's printed title on page 1.
//   2b. OCR of the printed page, for scans with neither of the above. Opt-in,
//      since it costs a one-time engine download and a few hundred ms.
//   3. Filename tokens — the agency's `NAME - DOCTYPE - DATE` convention.
//
// No AI anywhere. A file that matches none of these stays unidentified on
// purpose: a wrong auto-file is worse than an honest "needs review".
//
// Fingerprints were taken from the agency's own blank templates. Field COUNT
// is deliberately never used as a key — two unrelated forms in this archive
// both carry 86 fields.
import { PDFDocument } from 'pdf-lib';
import { ocrPdf, ocrSupported } from '@/lib/ocr';

export type Confidence = 'high' | 'medium' | 'low' | 'none';

/** Every document type the agency actually files. */
export const DOCUMENT_TYPES = [
  'Initial Assessment Tool',
  'Level of Need Assessment Tool',
  'Housing Stabilization Plan',
  'MCO Authorization Request',
  'Authorization Approval',
  'Move-In Supports Request',
  'Intake Packet',
  'Referral',
  'Billing',
  'Lease / Occupancy',
  'W-9',
  'ID / Verification',
  'Income / Benefits',
  'Voucher / Subsidy',
  'Correspondence',
  'Progress Note',
  'Signature Page',
  'Other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Which MCO a form belongs to, when the form itself is payer-specific. */
export type FormIssuer = 'State' | 'Aetna' | 'Horizon' | 'UHC' | 'Wellpoint' | null;

interface Fingerprint {
  documentType: DocumentType;
  issuer: FormIssuer;
  /** Field names unique enough that two of them settle it. */
  markers: string[];
  /** Optional page count, used only to separate otherwise-similar forms. */
  pages?: number;
  label: string;
}

/**
 * Registered signatures. A document type may have several — the state forms
 * have been re-issued in multiple builds, and one LoN in circulation was
 * re-authored with snake_case fields.
 */
const FINGERPRINTS: Fingerprint[] = [
  {
    documentType: 'Initial Assessment Tool',
    issuer: 'State',
    label: 'IAT (state template)',
    markers: [
      '1 Name as written on Medicaid ID',
      '5 Medicaid ID',
      '8 Location county',
      'Movein Supports16 onetime transitional expenses',
    ],
  },
  {
    documentType: 'Level of Need Assessment Tool',
    issuer: 'State',
    label: 'LoN (state template)',
    markers: [
      '1 Name not scored',
      'Please add up all the scores and provide the total score below TOTAL SCORE',
      'Name of case manager who completed assessment',
      'Level of Need category',
    ],
  },
  {
    documentType: 'Level of Need Assessment Tool',
    issuer: 'State',
    label: 'LoN (re-authored build)',
    // A variant in circulation with snake_case fields rather than the
    // state's verbose labels. Shares a field count with the Aetna form,
    // which is exactly why counts are not used as keys.
    markers: ['medicaid_id', 'mco_member_id', 'household_num-1', 'dob'],
  },
  {
    documentType: 'Housing Stabilization Plan',
    issuer: 'State',
    label: 'HSP (state template)',
    markers: [
      'Member Name',
      'NJ HMIS ID',
      'Provider Case Manager Name',
      'Housing Supports Provider',
    ],
  },
  {
    documentType: 'Housing Stabilization Plan',
    issuer: 'State',
    label: 'HSP (re-authored build)',
    // Same re-authoring as the alt LoN. `manger_name` is misspelled in the
    // source form; it is matched exactly as it appears there.
    markers: ['hmis_id', 'housing_provider', 'manger_name', 'plan-1'],
  },
  {
    documentType: 'MCO Authorization Request',
    issuer: 'Aetna',
    label: 'Aetna prior authorization request',
    pages: 2,
    markers: ['1 LAST NAME', '2 FIRST NAME', '4 MEMBER ID', '20 NPI'],
  },
  {
    documentType: 'MCO Authorization Request',
    issuer: 'Wellpoint',
    label: 'Wellpoint housing support services request',
    markers: [
      'Wellpoint provider ID',
      'Redetermination Select if request was previously denied',
    ],
  },
  {
    documentType: 'Move-In Supports Request',
    issuer: 'Wellpoint',
    label: 'Wellpoint move-in support request',
    markers: [
      'Member name head of household',
      'Anticipated movein date',
      '1 Recliner chair',
      '1 Alarm clock radio',
    ],
  },
];

/** Printed titles, for flat-but-text PDFs with no form fields left. */
const TEXT_MARKERS: { documentType: DocumentType; issuer: FormIssuer; needles: string[] }[] = [
  {
    documentType: 'Initial Assessment Tool',
    issuer: 'State',
    needles: ['initial assessment tool'],
  },
  {
    documentType: 'Level of Need Assessment Tool',
    issuer: 'State',
    needles: ['level of need assessment tool'],
  },
  {
    documentType: 'Housing Stabilization Plan',
    issuer: 'State',
    needles: ['housing stabilization plan'],
  },
  {
    documentType: 'MCO Authorization Request',
    issuer: 'Aetna',
    needles: ['prior authorization request form'],
  },
  {
    documentType: 'MCO Authorization Request',
    issuer: 'Wellpoint',
    needles: ['housing support services request form'],
  },
  {
    documentType: 'Move-In Supports Request',
    issuer: null,
    needles: ['move-in support service request', 'move-in supports request'],
  },
];

/**
 * Filename tokens, most specific first — the first match wins, so
 * "150-DAY AUTH APPROVAL" is settled before the bare "AUTH" rule sees it.
 */
const FILENAME_RULES: { documentType: DocumentType; pattern: RegExp; period?: 30 | 150 | 180 }[] = [
  { documentType: 'Authorization Approval', pattern: /\b30[\s-]*DAYS?\b[^A-Z]{0,12}(AUTH|APPROV)/i, period: 30 },
  { documentType: 'Authorization Approval', pattern: /\b150[\s-]*DAYS?\b[^A-Z]{0,12}(AUTH|APPROV)/i, period: 150 },
  { documentType: 'Authorization Approval', pattern: /\b180[\s-]*DAYS?\b[^A-Z]{0,12}(AUTH|APPROV)/i, period: 180 },
  { documentType: 'Authorization Approval', pattern: /\bAUTH(ORIZATION)?\s*(APPROVAL|APPROVED|LETTER)\b/i },
  { documentType: 'Move-In Supports Request', pattern: /\bMOVE[\s-]?IN\b|\bSECURITY\s*DEPOSIT\b|\bAPPLICATION\s*FEE\b/i },
  { documentType: 'Initial Assessment Tool', pattern: /\bIAT\b|\bINITIAL\s*ASSESS/i },
  { documentType: 'Level of Need Assessment Tool', pattern: /\bLON\b|\bLEVEL\s*OF\s*NEED\b/i },
  { documentType: 'Housing Stabilization Plan', pattern: /\bHSP\b|\bSTABILI[SZ]ATION\b/i },
  { documentType: 'MCO Authorization Request', pattern: /\bAUTH\s*FORM\b|\bSUPPORT\s*SERVICES\s*REQUEST\b|\bEXT\s*FORM\b/i },
  { documentType: 'Billing', pattern: /\bBILLING\b|\bBREAK\s?DOWN\b|\bINVOICE\b|\bBC\b/i },
  { documentType: 'Intake Packet', pattern: /\bINTAKE\b|\bINITIAL\s*FORM\b/i },
  { documentType: 'Referral', pattern: /\bREFERRAL\b|\bREFF?\b/i },
  { documentType: 'W-9', pattern: /\bW-?9\b/i },
  { documentType: 'Lease / Occupancy', pattern: /\bLEASE\b|\bOCCUPANCY\b|\bTENANT\b|\bRENTAL\s*AGREEMENT\b/i },
  { documentType: 'Voucher / Subsidy', pattern: /\bVOUCHER\b|\bAWARD\s*LETTER\b|\bSECTION\s*8\b|\bINSPECTION\s*LETTER\b|\bDCA\b/i },
  { documentType: 'ID / Verification', pattern: /\bID\s*DOCUMENT\b|\bDRIVER'?S?\s*LICENSE\b|\bSS\s*CARD\b|\bSOCIAL\s*SECURITY\b|\bBIRTH\s*CERT/i },
  { documentType: 'ID / Verification', pattern: /\bFACE\s*SHEET\b|\bBENEFIT\s*VERIFICATION\b/i },
  { documentType: 'Income / Benefits', pattern: /\bBANK\s*STATEMENT\b|\bUTILITY\s*BILL\b|\bPSE&?G\b|\bSSI\b|\bINCOME\b|\bPAY\s*STUB\b/i },
  { documentType: 'Progress Note', pattern: /\bPROGRESS\s*NOTE\b|\bTOUCH\s?POINT\b|\bCASE\s*NOTE\b/i },
  // Looser catches, deliberately after every specific rule above so that
  // "BREAK DOWN FOR 150 DAYS" is billing and "AUTH FORM" is a request.
  { documentType: 'MCO Authorization Request', pattern: /\bAUTH(ORIZATION)?\b/i },
  // Staff routinely name approvals with the period alone: "30 DAYS", "150 .pdf".
  { documentType: 'Authorization Approval', pattern: /\b30\s*DAYS?\b|(?<![\d.])30(?=\s*\.\w+$)/i, period: 30 },
  { documentType: 'Authorization Approval', pattern: /\b150\s*DAYS?\b|(?<![\d.])150(?=\s*\.\w+$)/i, period: 150 },
  { documentType: 'Authorization Approval', pattern: /\b180\s*DAYS?\b|(?<![\d.])180(?=\s*\.\w+$)/i, period: 180 },
  { documentType: 'Correspondence', pattern: /\bLETTER\b|\bFAX\b|\bTERMINATION\b|\bDENIED\b|\bAVAI?LITY\b|\bSCREENSHOT\b/i },
  // Last: a signature page names no document type of its own. OCR of the
  // printed footer is what actually resolves these.
  { documentType: 'Signature Page', pattern: /\bSI[GD]N?[ED]{0,2}\b.*\bFORM\b|\bSIGNED\b/i },
];

export interface RecognitionResult {
  documentType: DocumentType | null;
  issuer: FormIssuer;
  confidence: Confidence;
  /** How it was identified, for showing the user why. */
  basis: string;
  /** Authorization period a filename implied, when it named one. */
  authorizationPeriod?: 30 | 150 | 180;
  /** Every AcroForm value the file still carries, when it is fillable. */
  fields: Record<string, string>;
  fieldNames: string[];
  pageCount: number | null;
  /** True when the PDF has no fields and no text — only OCR could read it. */
  needsOcr: boolean;
}

const loadPdf = async (bytes: ArrayBuffer | Uint8Array) => {
  try {
    return await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    return null;
  }
};

/** Page-1 text via pdfjs, which the app already ships for the PDF viewer. */
async function firstPageText(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  try {
    const { pdfjs } = await import('react-pdf');
    await import('@/lib/pdfWorker');
    const copy = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes.slice(0));
    const doc = await pdfjs.getDocument({ data: copy }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const text = content.items
      .map((i: any) => (typeof i?.str === 'string' ? i.str : ''))
      .join(' ');
    await doc.destroy();
    return text;
  } catch {
    return '';
  }
}

/** Classify by filename alone. Used for images and unreadable scans. */
export function classifyFilename(filename: string): {
  documentType: DocumentType | null;
  authorizationPeriod?: 30 | 150 | 180;
} {
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(filename)) {
      return { documentType: rule.documentType, authorizationPeriod: rule.period };
    }
  }
  return { documentType: null };
}

/**
 * Identify a file. `bytes` may be omitted for non-PDFs, in which case only
 * the filename is consulted.
 */
export async function recognizeDocument(
  filename: string,
  bytes?: ArrayBuffer | Uint8Array,
  options: { useOcr?: boolean } = {},
): Promise<RecognitionResult> {
  const byName = classifyFilename(filename);
  const base: RecognitionResult = {
    documentType: null,
    issuer: null,
    confidence: 'none',
    basis: 'No recognisable signal',
    authorizationPeriod: byName.authorizationPeriod,
    fields: {},
    fieldNames: [],
    pageCount: null,
    needsOcr: false,
  };

  const isPdf = /\.pdf$/i.test(filename);
  if (!bytes || !isPdf) {
    return byName.documentType
      ? { ...base, documentType: byName.documentType, confidence: 'low', basis: 'Filename' }
      : base;
  }

  const doc = await loadPdf(bytes);
  if (!doc) {
    return byName.documentType
      ? { ...base, documentType: byName.documentType, confidence: 'low', basis: 'Filename (PDF unreadable)' }
      : { ...base, basis: 'PDF could not be opened' };
  }

  const pageCount = doc.getPageCount();
  let fieldNames: string[] = [];
  try {
    fieldNames = doc.getForm().getFields().map((f) => f.getName());
  } catch {
    fieldNames = [];
  }

  // Tier 1 — AcroForm fingerprint.
  if (fieldNames.length) {
    const present = new Set(fieldNames);
    let best: { fp: Fingerprint; hits: number } | null = null;
    for (const fp of FINGERPRINTS) {
      if (fp.pages && fp.pages !== pageCount) continue;
      const hits = fp.markers.filter((m) => present.has(m)).length;
      if (hits >= 2 && (!best || hits > best.hits)) best = { fp, hits };
    }
    if (best) {
      return {
        ...base,
        documentType: best.fp.documentType,
        issuer: best.fp.issuer,
        confidence: 'high',
        basis: `Form fields match ${best.fp.label}`,
        fields: readFieldValues(doc),
        fieldNames,
        pageCount,
      };
    }
  }

  // Tier 2 — printed title in the text layer.
  const text = (await firstPageText(bytes)).toLowerCase();
  if (text.trim()) {
    for (const marker of TEXT_MARKERS) {
      if (marker.needles.some((n) => text.includes(n))) {
        return {
          ...base,
          documentType: marker.documentType,
          issuer: marker.issuer,
          confidence: 'medium',
          basis: 'Form title found in the document text',
          fields: fieldNames.length ? readFieldValues(doc) : {},
          fieldNames,
          pageCount,
        };
      }
    }
  }

  // Tier 2b — a scan has no fields and no text layer, so the only way to read
  // it is to look at the pixels. Opt-in, because it costs a few hundred
  // milliseconds and a one-time engine download.
  const isScan = !fieldNames.length && !text.trim();
  if (isScan && options.useOcr && ocrSupported()) {
    try {
      const { text: scanned } = await ocrPdf(bytes);
      const low = scanned.toLowerCase();
      for (const marker of TEXT_MARKERS) {
        if (marker.needles.some((n) => low.includes(n))) {
          return {
            ...base,
            documentType: marker.documentType,
            issuer: marker.issuer,
            // A read of the printed title is as trustworthy as reading it
            // from the text layer; it just took more work to get at.
            confidence: 'medium',
            basis: 'Form title read from the scanned page',
            fieldNames,
            pageCount,
          };
        }
      }
    } catch {
      // Recognition falls through to the filename, as it would have anyway.
    }
  }

  // Tier 3 — filename.
  if (byName.documentType) {
    return {
      ...base,
      documentType: byName.documentType,
      confidence: 'low',
      basis: 'Filename',
      fields: fieldNames.length ? readFieldValues(doc) : {},
      fieldNames,
      pageCount,
      needsOcr: !fieldNames.length && !text.trim(),
    };
  }

  return {
    ...base,
    fields: fieldNames.length ? readFieldValues(doc) : {},
    fieldNames,
    pageCount,
    needsOcr: !fieldNames.length && !text.trim(),
    basis: !fieldNames.length && !text.trim()
      ? 'Scanned image — no fields or text to read'
      : 'No recognisable signal',
  };
}

/** Non-empty AcroForm values, keyed by field name. */
function readFieldValues(doc: PDFDocument): Record<string, string> {
  const out: Record<string, string> = {};
  let fields;
  try {
    fields = doc.getForm().getFields();
  } catch {
    return out;
  }
  for (const field of fields) {
    try {
      const anyField = field as unknown as {
        getText?: () => string | undefined;
        isChecked?: () => boolean;
        getSelected?: () => string | string[] | undefined;
      };
      const name = field.getName();
      if (typeof anyField.getText === 'function') {
        const v = anyField.getText();
        if (v) out[name] = v;
      } else if (typeof anyField.isChecked === 'function') {
        if (anyField.isChecked()) out[name] = 'Yes';
      } else if (typeof anyField.getSelected === 'function') {
        const v = anyField.getSelected();
        if (Array.isArray(v) ? v.length : v) out[name] = Array.isArray(v) ? v.join(', ') : String(v);
      }
    } catch {
      // A damaged field never aborts the rest.
    }
  }
  return out;
}

/**
 * Who the document is about, pulled from whichever fields the recognised
 * form uses. Only the identity fields — assessment answers stay in the PDF.
 */
export function identityFromFields(
  documentType: DocumentType | null,
  fields: Record<string, string>,
): { memberName?: string; memberId?: string; dateOfBirth?: string; njhmisId?: string; mco?: string } {
  const pick = (...keys: string[]) => {
    for (const k of keys) if (fields[k]) return fields[k];
    return undefined;
  };

  switch (documentType) {
    case 'Initial Assessment Tool':
      return {
        memberName: pick('1 Name as written on Medicaid ID'),
        dateOfBirth: pick('2 Date of birth MMDDYYYY'),
        memberId: pick('5 Medicaid ID'),
        mco: pick('6 Managed Care Organization MCO'),
      };
    case 'Level of Need Assessment Tool':
      return {
        memberName: pick('1 Name not scored', 'name'),
        dateOfBirth: pick('2 Date of Birth 1 point if age is less than 18 or more than 60', 'dob'),
        memberId: pick(
          '3 Medicaid ID not scored but Medicaid and MCO enrollment required for eligibility',
          'medicaid_id',
        ),
      };
    case 'Housing Stabilization Plan':
      return {
        memberName: pick('Member Name', 'member_name'),
        memberId: pick('Medicaid ID', 'medicaid_id'),
        njhmisId: pick('NJ HMIS ID', 'hmis_id'),
      };
    case 'MCO Authorization Request': {
      const last = pick('1 LAST NAME');
      const first = pick('2 FIRST NAME');
      return {
        memberName: last || first ? `${first ?? ''} ${last ?? ''}`.trim() : undefined,
        memberId: pick('4 MEMBER ID', 'Medicaid ID'),
        njhmisId: pick('NJ HMIS ID'),
      };
    }
    case 'Move-In Supports Request':
      return { memberName: pick('Member name head of household') };
    default:
      return {};
  }
}
