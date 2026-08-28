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

/**
 * Every document type the agency actually files.
 *
 * These are the agency's own names, taken verbatim from the DOCUMENT TYPES tab
 * of `_MANIFEST - all documents.xlsx`, which classifies all 2,033 archived
 * documents. Nothing here is a paraphrase, so the manifest converter is a
 * straight pass-through and an imported document keeps the type a person gave
 * it.
 *
 * An earlier, coarser list of nineteen collapsed distinctions the agency draws:
 * the Aetna and Wellpoint requests became one "MCO Authorization Request", the
 * four kinds of signature page became one, and "Billing Schedule" and "Claim
 * Confirmation" both became "Billing". That collapse — not any failure to read
 * the documents — was why bulk-imported types came out wrong.
 *
 * `Client Intake` is the one name here that is not in the agency's archive
 * taxonomy. The intake questionnaire is a form this app introduced, so no
 * archived document carries the type; it is listed because staff fill it in.
 *
 * Ordered as a menu — the forms staff work with, then signature pages, then
 * billing, then supporting documents — not by how many of each exist.
 */
export const DOCUMENT_TYPES = [
  // The forms staff fill in and the MCO's answer to them.
  'Initial Assessment (IAT)',
  'Level of Need (LON)',
  'Housing Stabilization Plan (HSP)',
  'Client Intake',
  'Prior Authorization Request',
  'Approval Letter',
  'Denial Letter',
  'Move-In Supports Request',
  'Referral',

  // Signature pages, kept apart by the form they belong to. 43 of them name no
  // form at all, which is a fact about the scan rather than a gap to guess at.
  'Signature Page (IAT)',
  'Signature Page (LON)',
  'Signature Page (HSP)',
  'Signature Page (form not stated)',

  // Billing. A schedule is what the agency plans to claim; a confirmation is
  // Availity's receipt for a claim already filed. They are not one type.
  'Billing Schedule',
  'Claim Confirmation',

  // Eligibility and identity.
  'Medicaid Eligibility',
  'Benefit Award Letter',
  'Social Security Card',
  'Birth Certificate',
  'Photo ID or Licence',
  'Face Sheet',

  // Housing.
  'Lease or Housing Document',
  'Eviction Notice',
  'Rent Receipt or Payment Record',
  'Move-In List',

  // Everything else the file legitimately holds.
  'W-9',
  'Statement of Truth',
  'Release of Information',
  'Medical Letter or Doctor Note',
  'Case Note or Narrative',
  'Blank Form or Template',

  // What the classifier assigns when it cannot tell. Never a human's choice —
  // see STAFF_SELECTABLE_TYPES.
  'Unsorted',
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
    documentType: 'Initial Assessment (IAT)',
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
    documentType: 'Level of Need (LON)',
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
    documentType: 'Level of Need (LON)',
    issuer: 'State',
    label: 'LoN (re-authored build)',
    // A variant in circulation with snake_case fields rather than the
    // state's verbose labels. Shares a field count with the Aetna form,
    // which is exactly why counts are not used as keys.
    markers: ['medicaid_id', 'mco_member_id', 'household_num-1', 'dob'],
  },
  {
    documentType: 'Housing Stabilization Plan (HSP)',
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
    documentType: 'Housing Stabilization Plan (HSP)',
    issuer: 'State',
    label: 'HSP (re-authored build)',
    // Same re-authoring as the alt LoN. `manger_name` is misspelled in the
    // source form; it is matched exactly as it appears there.
    markers: ['hmis_id', 'housing_provider', 'manger_name', 'plan-1'],
  },
  {
    documentType: 'Prior Authorization Request',
    issuer: 'Aetna',
    label: 'Aetna prior authorization request',
    pages: 2,
    markers: ['1 LAST NAME', '2 FIRST NAME', '4 MEMBER ID', '20 NPI'],
  },
  {
    documentType: 'Prior Authorization Request',
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

/**
 * Words printed in the document, for flat-but-text PDFs with no form fields
 * left. Read in order, first hit wins — an approval letter also contains the
 * word "authorization", so the exact printed titles have to be tried before
 * any looser phrase.
 *
 * Needles are matched on **word boundaries**, never as bare substrings.
 * Matching on substrings is what tagged every file belonging to a client named
 * LEOPOLD as superseded, because "LEOP-OLD" contains "OLD"; here it would make
 * "please" a lease and "clinical" a clinic.
 */
const TEXT_MARKERS: { documentType: DocumentType; issuer: FormIssuer; needles: string[] }[] = [
  // --- Exact printed titles. These also settle which payer the form is for,
  //     which no looser phrase below can do.
  {
    documentType: 'Initial Assessment (IAT)',
    issuer: 'State',
    needles: ['initial assessment tool'],
  },
  {
    documentType: 'Level of Need (LON)',
    issuer: 'State',
    needles: ['level of need assessment tool'],
  },
  {
    documentType: 'Housing Stabilization Plan (HSP)',
    issuer: 'State',
    needles: ['housing stabilization plan'],
  },
  {
    documentType: 'Prior Authorization Request',
    issuer: 'Aetna',
    needles: ['prior authorization request form'],
  },
  {
    documentType: 'Prior Authorization Request',
    issuer: 'Wellpoint',
    needles: ['housing support services request form'],
  },
  {
    documentType: 'Move-In Supports Request',
    issuer: null,
    needles: ['move-in support service request', 'move-in supports request'],
  },

  // --- The agency's own reading order, from the document-ingest brief. Every
  //     one of these is looser than the titles above, so they come after.
  { documentType: 'Level of Need (LON)', issuer: null, needles: ['level of need'] },
  {
    documentType: 'Initial Assessment (IAT)',
    issuer: null,
    needles: ['initial assessment', 'assessment tool', 'social risk criteria'],
  },
  {
    documentType: 'Claim Confirmation',
    issuer: null,
    needles: ['claim submitted', 'date of service', 'dates of service', 'date(s) of service'],
  },
  {
    documentType: 'Approval Letter',
    issuer: null,
    needles: ['has been approved', 'is approved', 'provider notification'],
  },
  {
    documentType: 'Denial Letter',
    issuer: null,
    needles: ['denial', 'not approved', 'adverse determination'],
  },
  {
    documentType: 'Prior Authorization Request',
    issuer: null,
    needles: ['prior authorization request', 'prior auth'],
  },
  {
    documentType: 'Release of Information',
    issuer: null,
    needles: ['release of information', 'authorization to release'],
  },
  { documentType: 'Statement of Truth', issuer: null, needles: ['statement of truth'] },
  { documentType: 'W-9', issuer: null, needles: ['request for taxpayer', 'w-9'] },
  {
    documentType: 'Medicaid Eligibility',
    issuer: null,
    needles: ['nj familycare', 'eligibility determination', 'medicaid'],
  },
  {
    documentType: 'Benefit Award Letter',
    issuer: null,
    needles: ['award letter', 'supplemental security income', 'liheap'],
  },
  {
    documentType: 'Medical Letter or Doctor Note',
    issuer: null,
    // "diagnos" deliberately has no trailing boundary so it covers diagnosis,
    // diagnosed and diagnostic in one needle.
    needles: ['health center', 'physician', 'diagnos', 'clinic', 'mrn'],
  },
  {
    documentType: 'Case Note or Narrative',
    issuer: null,
    needles: ['cm spoke with', 'face-to-face', 'is currently experiencing'],
  },
  {
    documentType: 'Lease or Housing Document',
    issuer: null,
    needles: ['lease', 'landlord', 'tenancy', 'rental agreement'],
  },
  {
    documentType: 'Eviction Notice',
    issuer: null,
    needles: ['eviction', 'notice to quit', 'warrant of removal'],
  },
  { documentType: 'Move-In Supports Request', issuer: null, needles: ['move-in supports'] },
  { documentType: 'Referral', issuer: null, needles: ['referral'] },
  {
    documentType: 'Birth Certificate',
    issuer: null,
    needles: ['certificate of live birth', 'birth certificate'],
  },
  {
    documentType: 'Social Security Card',
    issuer: null,
    needles: ['social security administration'],
  },
  {
    documentType: 'Photo ID or Licence',
    issuer: null,
    needles: ["driver's license", 'drivers license', 'motor vehicle commission'],
  },
  {
    documentType: 'Rent Receipt or Payment Record',
    issuer: null,
    needles: ['money order', 'rent receipt', 'amount paid'],
  },
];

/** `\b` is no use against a needle ending in a non-word character, so the
 *  boundary is only asserted where the needle's own edge is a word character. */
const needleRegex = (needle: string): RegExp => {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const open = /^\w/.test(needle) ? '\\b' : '';
  const close = /\w$/.test(needle) ? '\\b' : '';
  return new RegExp(`${open}${escaped}${close}`, 'i');
};

/** Cached so a marker's regex is compiled once, not once per document. */
const NEEDLE_CACHE = new Map<string, RegExp>();
const matchesNeedle = (text: string, needle: string): boolean => {
  let re = NEEDLE_CACHE.get(needle);
  if (!re) {
    re = needleRegex(needle);
    NEEDLE_CACHE.set(needle, re);
  }
  return re.test(text);
};

/**
 * Filename tokens, most specific first — the first match wins, so
 * "150-DAY AUTH APPROVAL" is settled before the bare "AUTH" rule sees it.
 */
const FILENAME_RULES: { documentType: DocumentType; pattern: RegExp; period?: 30 | 150 | 180 }[] = [
  { documentType: 'Approval Letter', pattern: /\b30[\s-]*DAYS?\b[^A-Z]{0,12}(AUTH|APPROV)/i, period: 30 },
  { documentType: 'Approval Letter', pattern: /\b150[\s-]*DAYS?\b[^A-Z]{0,12}(AUTH|APPROV)/i, period: 150 },
  { documentType: 'Approval Letter', pattern: /\b180[\s-]*DAYS?\b[^A-Z]{0,12}(AUTH|APPROV)/i, period: 180 },
  { documentType: 'Approval Letter', pattern: /\bAUTH(ORIZATION)?\s*(APPROVAL|APPROVED|LETTER)\b/i },
  { documentType: 'Move-In Supports Request', pattern: /\bMOVE[\s-]?IN\b|\bSECURITY\s*DEPOSIT\b|\bAPPLICATION\s*FEE\b/i },
  { documentType: 'Initial Assessment (IAT)', pattern: /\bIAT\b|\bINITIAL\s*ASSESS/i },
  { documentType: 'Level of Need (LON)', pattern: /\bLON\b|\bLEVEL\s*OF\s*NEED\b/i },
  { documentType: 'Housing Stabilization Plan (HSP)', pattern: /\bHSP\b|\bSTABILI[SZ]ATION\b/i },
  { documentType: 'Prior Authorization Request', pattern: /\bAUTH\s*FORM\b|\bSUPPORT\s*SERVICES\s*REQUEST\b|\bEXT\s*FORM\b/i },
  { documentType: 'Billing Schedule', pattern: /\bBILLING\b|\bBREAK\s?DOWN\b|\bINVOICE\b|\bBC\b/i },
  { documentType: 'Claim Confirmation', pattern: /\bCLAIM\b|\bCONFIRMATION\b|\bSUBMITTED\b|\bEOB\b/i },
  { documentType: 'Referral', pattern: /\bREFERRAL\b|\bREFF?\b/i },
  { documentType: 'W-9', pattern: /\bW-?9\b/i },
  { documentType: 'Statement of Truth', pattern: /\bSTATEMENT\s*OF\s*TRUTH\b/i },
  { documentType: 'Release of Information', pattern: /\bRELEASE\s*OF\s*INFO/i },
  { documentType: 'Eviction Notice', pattern: /\bEVICTION\b|\bNOTICE\s*TO\s*QUIT\b|\bWARRANT\s*OF\s*REMOVAL\b/i },
  { documentType: 'Rent Receipt or Payment Record', pattern: /\bRENT\s*RECEIPT\b|\bMONEY\s*ORDER\b|\bRECEIPT\b/i },
  { documentType: 'Lease or Housing Document', pattern: /\bLEASE\b|\bOCCUPANCY\b|\bTENANT\b|\bRENTAL\s*AGREEMENT\b/i },
  { documentType: 'Move-In List', pattern: /\bMOVE[\s-]?IN\s*LIST\b/i },
  { documentType: 'Medicaid Eligibility', pattern: /\bMEDICAID\b|\bFAMILY\s*CARE\b|\bELIGIBILITY\b/i },
  // A voucher, a DCA award and an SSI letter are all the same thing to this
  // archive: a letter awarding the member a benefit.
  { documentType: 'Benefit Award Letter', pattern: /\bVOUCHER\b|\bAWARD\s*LETTER\b|\bSECTION\s*8\b|\bINSPECTION\s*LETTER\b|\bDCA\b|\bLIHEAP\b/i },
  { documentType: 'Benefit Award Letter', pattern: /\bBANK\s*STATEMENT\b|\bUTILITY\s*BILL\b|\bPSE&?G\b|\bSSI\b|\bINCOME\b|\bPAY\s*STUB\b/i },
  // Identity documents are three separate types to the agency, so the one
  // former "ID / Verification" rule is split rather than left to guess.
  { documentType: 'Photo ID or Licence', pattern: /\bID\s*DOCUMENT\b|\bDRIVER'?S?\s*LICEN[SC]E\b|\bPHOTO\s*ID\b|\bMVC\b/i },
  { documentType: 'Social Security Card', pattern: /\bSS\s*CARD\b|\bSOCIAL\s*SECURITY\s*CARD\b|\bSOCIAL\s*SECURITY\b/i },
  { documentType: 'Birth Certificate', pattern: /\bBIRTH\s*CERT/i },
  { documentType: 'Face Sheet', pattern: /\bFACE\s*SHEET\b|\bBENEFIT\s*VERIFICATION\b/i },
  { documentType: 'Medical Letter or Doctor Note', pattern: /\bDOCTOR\b|\bPHYSICIAN\b|\bCLINIC\b|\bHEALTH\s*CENTER\b|\bMEDICAL\s*LETTER\b/i },
  { documentType: 'Case Note or Narrative', pattern: /\bPROGRESS\s*NOTE\b|\bTOUCH\s?POINT\b|\bCASE\s*NOTE\b|\bNARRATIVE\b/i },
  { documentType: 'Blank Form or Template', pattern: /\bBLANK\b|\bTEMPLATE\b|\bSAMPLE\b/i },
  // Looser catches, deliberately after every specific rule above so that
  // "BREAK DOWN FOR 150 DAYS" is billing and "AUTH FORM" is a request.
  { documentType: 'Prior Authorization Request', pattern: /\bAUTH(ORIZATION)?\b/i },
  // Staff routinely name approvals with the period alone: "30 DAYS", "150 .pdf".
  { documentType: 'Approval Letter', pattern: /\b30\s*DAYS?\b|(?<![\d.])30(?=\s*\.\w+$)/i, period: 30 },
  { documentType: 'Approval Letter', pattern: /\b150\s*DAYS?\b|(?<![\d.])150(?=\s*\.\w+$)/i, period: 150 },
  { documentType: 'Approval Letter', pattern: /\b180\s*DAYS?\b|(?<![\d.])180(?=\s*\.\w+$)/i, period: 180 },
  { documentType: 'Denial Letter', pattern: /\bDENIAL\b|\bDENIED\b|\bNOT\s*APPROVED\b|\bADVERSE\s*DETERMINATION\b|\bTERMINATION\b/i },
  // A signature page belonging to a named form is a different type from one
  // that names no form, so the named ones are tried first.
  { documentType: 'Signature Page (IAT)', pattern: /\bSIGN(ATURE|ED)\b[^A-Z]{0,12}\bIAT\b|\bIAT\b[^A-Z]{0,12}\bSIGN/i },
  { documentType: 'Signature Page (LON)', pattern: /\bSIGN(ATURE|ED)\b[^A-Z]{0,12}\bLON\b|\bLON\b[^A-Z]{0,12}\bSIGN/i },
  { documentType: 'Signature Page (HSP)', pattern: /\bSIGN(ATURE|ED)\b[^A-Z]{0,12}\bHSP\b|\bHSP\b[^A-Z]{0,12}\bSIGN/i },
  // Last: a signature page that names no form. 43 in the archive are exactly
  // this — the scan carries no form title, which is a fact to record rather
  // than a gap to guess at. OCR of the printed footer is what resolves them.
  { documentType: 'Signature Page (form not stated)', pattern: /\bSI[GD]N?[ED]{0,2}\b.*\bFORM\b|\bSIGNED\b/i },
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
      if (marker.needles.some((n) => matchesNeedle(text, n))) {
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
        if (marker.needles.some((n) => matchesNeedle(low, n))) {
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
    case 'Initial Assessment (IAT)':
      return {
        memberName: pick('1 Name as written on Medicaid ID'),
        dateOfBirth: pick('2 Date of birth MMDDYYYY'),
        memberId: pick('5 Medicaid ID'),
        mco: pick('6 Managed Care Organization MCO'),
      };
    case 'Level of Need (LON)':
      return {
        memberName: pick('1 Name not scored', 'name'),
        dateOfBirth: pick('2 Date of Birth 1 point if age is less than 18 or more than 60', 'dob'),
        memberId: pick(
          '3 Medicaid ID not scored but Medicaid and MCO enrollment required for eligibility',
          'medicaid_id',
        ),
      };
    case 'Housing Stabilization Plan (HSP)':
      return {
        memberName: pick('Member Name', 'member_name'),
        memberId: pick('Medicaid ID', 'medicaid_id'),
        njhmisId: pick('NJ HMIS ID', 'hmis_id'),
      };
    case 'Prior Authorization Request': {
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

/**
 * The values a fillable PDF's own form fields hold, keyed by field name.
 *
 * Exported for the field extractor: on the state's forms the printed page
 * carries only the questions, and every answer lives here. Returns an empty
 * object for a PDF with no form, which is the normal case for a letter.
 */
export async function readFormValues(
  bytes: ArrayBuffer | Uint8Array,
): Promise<Record<string, string>> {
  try {
    const doc = await loadPdf(bytes);
    return readFieldValues(doc);
  } catch {
    return {};
  }
}
