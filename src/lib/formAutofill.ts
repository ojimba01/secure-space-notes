// Field-mapping layer for the official NJ Housing Supports PDFs.
//
// The blank templates in /public/form-templates are real fillable AcroForm
// PDFs, so auto-population writes into their actual form fields (via pdf-lib)
// and never rebuilds the layout. The same field names are used in reverse to
// read authoritative values back out of completed forms, and to recognise
// which official template an arbitrary uploaded PDF is.
//
// Field names below were extracted from the February 2026 program PDFs with
// pdf-lib; see docs/form-field-reference.md for the human-readable reference.
import { PDFDocument, PDFTextField, PDFCheckBox, PDFDropdown, PDFRadioGroup } from 'pdf-lib';

export interface AutofillClient {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
  member_id?: string | null;
  insurance?: string | null; // MCO
  county?: string | null;
  njhmis_id?: string | null;
}

export interface AutofillCaseManager {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  organization?: string | null;
}

const mmddyyyy = (iso?: string | null): string => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${m}/${d}/${y}` : '';
};

const fullName = (c: AutofillClient) => `${c.first_name} ${c.last_name}`.trim();

/**
 * Values to place into each template, keyed by the PDF's real field names.
 * Only identity/administrative fields the client record actually knows are
 * mapped — assessment answers always come from the conversation, never the app.
 */
export function templateFieldValues(
  formType: string,
  client: AutofillClient,
  cm?: AutofillCaseManager | null,
): Record<string, string> {
  switch (formType) {
    case 'Initial Assessment (IAT)':
      return prune({
        '1 Name as written on Medicaid ID': fullName(client),
        '2 Date of birth MMDDYYYY': mmddyyyy(client.date_of_birth),
        '3 Phone Number if applicable': client.phone ?? '',
        '4 Email address if applicable': client.email ?? '',
        '5 Medicaid ID': client.member_id ?? '',
        '6 Managed Care Organization MCO': client.insurance ?? '',
        '8 Location county': client.county ?? '',
      });
    case 'Level of Need (LON)':
      return prune({
        '1 Name not scored': fullName(client),
        '2 Date of Birth 1 point if age is less than 18 or more than 60': mmddyyyy(client.date_of_birth),
        '3 Medicaid ID not scored but Medicaid and MCO enrollment required for eligibility':
          client.member_id ?? '',
        'Name of case manager who completed assessment': cm?.name ?? '',
        'Provider organization name': cm?.organization ?? '',
      });
    case 'Housing Stabilization Plan (HSP)':
      return prune({
        'Member Name': fullName(client),
        'Medicaid ID': client.member_id ?? '',
        'NJ HMIS ID': client.njhmis_id ?? '',
        'Housing Supports Provider': cm?.organization ?? '',
        'Provider Case Manager Name': cm?.name ?? '',
        'Provider Case Manager Phone': cm?.phone ?? '',
        'Provider Case Manager Email': cm?.email ?? '',
      });
    // Both MCO request forms share a document type, and prefillTemplate skips
    // any field a given PDF does not have, so one mapping serves both. The
    // Wellpoint template already carries the agency's own provider block, so
    // nothing here writes over it.
    case 'Prior Authorization Request':
      return prune({
        // Aetna prior authorization
        '1 LAST NAME': client.last_name ?? '',
        '2 FIRST NAME': client.first_name ?? '',
        '4 MEMBER ID': client.member_id ?? '',
        '5 DATE OF BIRTH MMDDYYYY': mmddyyyy(client.date_of_birth),
        // Wellpoint support services request
        'Name': fullName(client),
        'Member ID': client.member_id ?? '',
        'DOB': mmddyyyy(client.date_of_birth),
        'Phone': client.phone ?? '',
        'Email if applicable': client.email ?? '',
        'NJ HMIS ID': client.njhmis_id ?? '',
      });
    default:
      return {};
  }
}

const prune = (values: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ''));

/**
 * Fill the known identity fields of an official template. Returns new PDF
 * bytes with the same pages, structure, and remaining blank fields — the
 * user keeps editing everything in the viewer as before.
 */
export async function prefillTemplate(
  templateBytes: ArrayBuffer | Uint8Array,
  formType: string,
  client: AutofillClient,
  cm?: AutofillCaseManager | null,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const values = templateFieldValues(formType, client, cm);

  for (const [name, value] of Object.entries(values)) {
    try {
      const field = form.getField(name);
      if (field instanceof PDFTextField) {
        field.setText(value);
      }
    } catch {
      // A template revision may rename fields; skipping is always safe.
    }
  }

  return doc.save();
}

// ---------------------------------------------------------------------------
// Reading values back out of completed forms
// ---------------------------------------------------------------------------

export interface ExtractedFormValues {
  /** Raw field name → value for every non-empty field. */
  raw: Record<string, string>;
  memberName?: string;
  memberId?: string;
  dateOfBirth?: string;
  mco?: string;
  njhmisId?: string;
  lonScore?: number;
  lonCategory?: string;
  completionDate?: string;
}

/** Read every AcroForm value a PDF still carries. Empty for flattened scans. */
export async function extractPdfFieldValues(
  bytes: ArrayBuffer | Uint8Array,
): Promise<Record<string, string>> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const out: Record<string, string> = {};
  let fields;
  try {
    fields = doc.getForm().getFields();
  } catch {
    return out;
  }
  for (const field of fields) {
    try {
      const name = field.getName();
      if (field instanceof PDFTextField) {
        const v = field.getText();
        if (v) out[name] = v;
      } else if (field instanceof PDFCheckBox) {
        if (field.isChecked()) out[name] = 'Yes';
      } else if (field instanceof PDFDropdown) {
        const v = field.getSelected();
        if (v?.length) out[name] = v.join(', ');
      } else if (field instanceof PDFRadioGroup) {
        const v = field.getSelected();
        if (v) out[name] = v;
      }
    } catch {
      // Individual damaged fields never abort the whole extraction.
    }
  }
  return out;
}

/** Map raw field values to the structured values the workflow cares about. */
export function interpretFormValues(formType: string, raw: Record<string, string>): ExtractedFormValues {
  const out: ExtractedFormValues = { raw };
  const num = (s?: string) => {
    const n = parseInt((s ?? '').replace(/[^\d-]/g, ''), 10);
    return Number.isFinite(n) ? n : undefined;
  };

  if (formType === 'Initial Assessment (IAT)') {
    out.memberName = raw['1 Name as written on Medicaid ID'];
    out.dateOfBirth = raw['2 Date of birth MMDDYYYY'];
    out.memberId = raw['5 Medicaid ID'];
    out.mco = raw['6 Managed Care Organization MCO'];
  } else if (formType === 'Level of Need (LON)') {
    out.memberName = raw['1 Name not scored'];
    out.dateOfBirth = raw['2 Date of Birth 1 point if age is less than 18 or more than 60'];
    out.memberId = raw['3 Medicaid ID not scored but Medicaid and MCO enrollment required for eligibility'];
    out.lonScore = num(raw['Please add up all the scores and provide the total score below TOTAL SCORE']);
    out.lonCategory = raw['Level of Need category'];
    out.completionDate = raw['Date of completion'];
    if (!out.lonCategory && out.lonScore !== undefined) {
      out.lonCategory = out.lonScore >= 18 ? 'High' : 'Low';
    }
  } else if (formType === 'Housing Stabilization Plan (HSP)') {
    out.memberName = raw['Member Name'];
    out.memberId = raw['Medicaid ID'];
    out.njhmisId = raw['NJ HMIS ID'];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Template recognition — identify which official form an arbitrary PDF is by
// its field-name fingerprint. Far more reliable than guessing from filenames.
// ---------------------------------------------------------------------------

const TEMPLATE_FINGERPRINTS: { formType: string; markers: string[] }[] = [
  {
    formType: 'Initial Assessment (IAT)',
    markers: ['1 Name as written on Medicaid ID', '5 Medicaid ID', '8 Location county'],
  },
  {
    formType: 'Level of Need (LON)',
    markers: [
      '1 Name not scored',
      'Please add up all the scores and provide the total score below TOTAL SCORE',
      'Name of case manager who completed assessment',
    ],
  },
  {
    formType: 'Housing Stabilization Plan (HSP)',
    markers: ['Member Name', 'NJ HMIS ID', 'Provider Case Manager Name'],
  },
];

/**
 * Recognise an official template from a PDF's field names. Needs at least two
 * marker fields so a single coincidental name never misidentifies a document.
 */
export async function recognizeFormType(
  bytes: ArrayBuffer | Uint8Array,
): Promise<{ formType: string | null; fieldNames: string[] }> {
  let fieldNames: string[] = [];
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    fieldNames = doc.getForm().getFields().map((f) => f.getName());
  } catch {
    return { formType: null, fieldNames: [] };
  }
  const nameSet = new Set(fieldNames);
  for (const { formType, markers } of TEMPLATE_FINGERPRINTS) {
    const hits = markers.filter((m) => nameSet.has(m)).length;
    if (hits >= 2) return { formType, fieldNames };
  }
  return { formType: null, fieldNames };
}

/** `LastName_FirstName_IAT_2026-08-26.pdf`-style download name. */
export function formDownloadName(
  firstName: string | undefined,
  lastName: string | undefined,
  formType: string,
  dateIso?: string | null,
): string {
  const abbrev: Record<string, string> = {
    'Initial Assessment (IAT)': 'IAT',
    'Level of Need (LON)': 'LON',
    'Housing Stabilization Plan (HSP)': 'HSP',
  };
  const clean = (s?: string) => (s ?? '').replace(/[^\w-]+/g, '');
  const date = (dateIso ?? new Date().toISOString()).slice(0, 10);
  const parts = [clean(lastName), clean(firstName), abbrev[formType] ?? (clean(formType) || 'Form'), date]
    .filter(Boolean);
  return `${parts.join('_')}.pdf`;
}
