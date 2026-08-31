// Lift the handful of facts worth having out of a document's text.
//
// This runs straight after the words come out of the file, on the same text,
// so nothing is read twice. What it produces is a record of WHAT THE DOCUMENT
// SAYS. That is deliberately not the same as what is true: the caller fills a
// blank on the client record from it and reports a disagreement, but never
// overwrites a person's entry with a regex. A document is evidence.
//
// Patterns come from the agency's own ingest brief, which drew them from the
// forms actually in the archive. Every one of them is anchored on a printed
// label rather than on shape alone — "a number of 6 to 14 digits" describes an
// authorization number, a member ID, a Medicaid ID and a fax number equally
// well, and picking the wrong one is worse than picking none.

export interface DocumentFields {
  authorizationNumber: string | null;
  serviceStart: string | null;
  serviceEnd: string | null;
  totalCharges: number | null;
  memberName: string | null;
  memberId: string | null;
  medicaidId: string | null;
  memberDob: string | null;
  icd10Code: string | null;
  noticeDate: string | null;
  submissionDate: string | null;
  /**
   * Four more the IAT asks for in its own form fields. They were being read
   * past: the form holds a phone number, an email, the MCO and the county, and
   * somebody was typing all four back in beside the document that had them.
   */
  phone: string | null;
  email: string | null;
  mco: string | null;
  county: string | null;
  /** The LON's own total, and the level that total decides. */
  lonScore: string | null;
  levelOfNeed: string | null;
}

export const NO_FIELDS: DocumentFields = {
  authorizationNumber: null,
  serviceStart: null,
  serviceEnd: null,
  totalCharges: null,
  memberName: null,
  memberId: null,
  medicaidId: null,
  memberDob: null,
  icd10Code: null,
  noticeDate: null,
  submissionDate: null,
  phone: null,
  email: null,
  mco: null,
  county: null,
  lonScore: null,
  levelOfNeed: null,
};

/** The earliest and latest a date on one of these documents could sensibly be. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * `MM/DD/YYYY` and friends to ISO, or null.
 *
 * American order throughout — every form in this archive is a New Jersey
 * Medicaid document — so 03/04/2026 is 4 March, never 3 April. Two-digit years
 * are read as 2000s, which is right for a programme that began in 2024 and
 * wrong only for a date nobody here would write.
 */
export function toIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validDate(+iso[1], +iso[2], +iso[3]);

  const us = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (us) {
    const year = us[3].length === 2 ? 2000 + +us[3] : +us[3];
    return validDate(year, +us[1], +us[2]);
  }

  const named = s.match(
    /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/,
  );
  if (named) {
    const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
    const idx = months.indexOf(named[1].slice(0, 3).toLowerCase());
    if (idx >= 0) return validDate(+named[3], idx + 1, +named[2]);
  }
  return null;
}

/** Rejects 02/31 and anything outside a plausible year, rather than rolling over. */
function validDate(year: number, month: number, day: number): string | null {
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** First capture of the first pattern that matches, trimmed. */
function first(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const v = m[1].trim();
      if (v) return v;
    }
  }
  return null;
}

const DATE = String.raw`(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})`;

/** Identifiers in this system are digits, as they are everywhere else in the app. */
const digitsOnly = (s: string | null): string | null => {
  if (!s) return null;
  const d = s.replace(/\D/g, '');
  return d || null;
};

export function extractDocumentFields(rawText: string): DocumentFields {
  if (!rawText) return { ...NO_FIELDS };
  // Collapse whitespace so a label and its value separated by a line break in
  // the PDF read the same as one separated by a space.
  const text = rawText.replace(/\s+/g, ' ');

  // "Authorization" also appears on approval letters as part of a sentence, so
  // the number is only taken where it directly follows the label.
  const authorizationNumber = digitsOnly(
    first(text, [
      /Authorization\s*(?:Number|No\.?|#)\s*[:#\-]?\s*([0-9][0-9\s-]{5,17})/i,
      /Reference\s*(?:Number|No\.?|#)\s*[:#\-]?\s*([0-9][0-9\s-]{5,17})/i,
      /\bAuth\s*(?:Number|No\.?|#)\s*[:#\-]?\s*([0-9][0-9\s-]{5,17})/i,
    ]),
  );

  // Both wordings the archive uses for a service period, plus the bare
  // "from X to Y" that Availity's claim page prints.
  const range =
    text.match(
      new RegExp(
        String.raw`(?:Requested\s+)?Dates?\s*\(?s?\)?\s*(?:Of|of)\s+Service\s*[:#\-]?\s*${DATE}\s*(?:to|through|thru|-|–|—)\s*${DATE}`,
        'i',
      ),
    ) ??
    text.match(
      new RegExp(String.raw`Service\s+Period\s*[:#\-]?\s*${DATE}\s*(?:to|through|-|–|—)\s*${DATE}`, 'i'),
    );

  const serviceStart = toIso(range?.[1] ?? null);
  const serviceEnd = toIso(range?.[2] ?? null);

  const memberDob = toIso(
    first(text, [
      new RegExp(String.raw`Member\s*DOB\s*[:#\-]?\s*${DATE}`, 'i'),
      new RegExp(String.raw`Date\s*of\s*Birth\s*[:#\-]?\s*${DATE}`, 'i'),
      new RegExp(String.raw`\bDOB\s*[:#\-]?\s*${DATE}`, 'i'),
    ]),
  );

  const memberId = digitsOnly(
    first(text, [
      /Member\s*(?:ID|Number|No\.?|#)\s*[:#\-]?\s*([0-9][0-9\s-]{5,17})/i,
      /Subscriber\s*(?:ID|Number|No\.?|#)\s*[:#\-]?\s*([0-9][0-9\s-]{5,17})/i,
      /Patient\s*ID\s*[:#\-]?\s*([0-9][0-9\s-]{5,17})/i,
    ]),
  );

  const medicaidId = digitsOnly(
    first(text, [
      /Medicaid\s*(?:ID|Number|No\.?|#)\s*[:#\-]?\s*([0-9][0-9\s-]{5,19})/i,
      /NJ\s*FamilyCare\s*(?:ID|Number|No\.?|#)\s*[:#\-]?\s*([0-9][0-9\s-]{5,19})/i,
    ]),
  );

  // Housing-related Z-codes. The dot is optional because OCR loses it, and
  // the code is normalised back to the written form.
  const icdRaw = first(text, [/\b(Z\s?59\.?\s?\d{1,3})\b/i]);
  const icdDigits = icdRaw ? icdRaw.replace(/[^0-9]/g, '') : null;
  const icd10Code =
    icdDigits && icdDigits.length >= 4
      ? `Z${icdDigits.slice(0, 2)}.${icdDigits.slice(2)}`
      : null;

  const chargesRaw = first(text, [
    /Total\s*Charges?\s*[:#\-]?\s*\$?\s*([\d,]+\.\d{2})/i,
    /Total\s*(?:Billed|Amount)\s*[:#\-]?\s*\$?\s*([\d,]+\.\d{2})/i,
  ]);
  const chargesNumber = chargesRaw ? Number(chargesRaw.replace(/,/g, '')) : NaN;
  const totalCharges = Number.isFinite(chargesNumber) ? chargesNumber : null;

  const noticeDate = toIso(
    first(text, [
      new RegExp(String.raw`Notice\s*Date\s*[:#\-]?\s*${DATE}`, 'i'),
      new RegExp(String.raw`Date\s*of\s*Notice\s*[:#\-]?\s*${DATE}`, 'i'),
      new RegExp(String.raw`Letter\s*Date\s*[:#\-]?\s*${DATE}`, 'i'),
    ]),
  );

  const submissionDate = toIso(
    first(text, [
      new RegExp(String.raw`Submission\s*Date\s*[:#\-]?\s*${DATE}`, 'i'),
      new RegExp(String.raw`Date\s*Submitted\s*[:#\-]?\s*${DATE}`, 'i'),
      new RegExp(String.raw`Claim\s*Submitted\s*(?:on)?\s*[:#\-]?\s*${DATE}`, 'i'),
    ]),
  );

  // Stops at the next printed label, so "Member Name: JANE DOE Member ID:"
  // does not swallow the rest of the line.
  const memberName = first(text, [
    /Member\s*Name\s*[:#\-]?\s*([A-Za-z][A-Za-z'’\-. ]{1,60}?)(?=\s{2,}|\s*(?:Member|Medicaid|Subscriber|Patient|DOB|Date|ID|Address|Phone|Case|Provider|Authorization|NJ)\b|$)/i,
    /Patient\s*Name\s*[:#\-]?\s*([A-Za-z][A-Za-z'’\-. ]{1,60}?)(?=\s{2,}|\s*(?:Member|Medicaid|Subscriber|Patient|DOB|Date|ID|Address|Phone|Case|Provider|Authorization|NJ)\b|$)/i,
    /(?:Client|Consumer)\s*Name\s*[:#\-]?\s*([A-Za-z][A-Za-z'’\-. ]{1,60}?)(?=\s{2,}|\s*(?:Member|Medicaid|Subscriber|Patient|DOB|Date|ID|Address|Phone|Case|Provider|Authorization|NJ)\b|$)/i,
  ]);

  return {
    authorizationNumber,
    serviceStart,
    serviceEnd,
    totalCharges,
    memberName: memberName ? memberName.replace(/\s+/g, ' ').trim() : null,
    memberId,
    medicaidId,
    memberDob,
    icd10Code,
    noticeDate,
    submissionDate,
    // Printed text is not a source for these. They come off the IAT's own
    // form fields, where the answer is the value rather than a heading.
    phone: null,
    email: null,
    mco: null,
    county: null,
    lonScore: null,
    levelOfNeed: null,
  };
}

/** Names for comparison: case, punctuation and middle initials all removed. */
function nameKey(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 1);
}

/**
 * Whether the name printed on a document looks like the client it is filed
 * under. Null when no name could be read, so "not checked" and "does not
 * match" are never confused.
 *
 * Deliberately generous. Documents write names in every order — "DOE, Jane",
 * "Jane M Doe", "JANE DOE" — so this asks whether the first and last names
 * both appear, in any order, rather than whether the strings are equal. It is
 * there to catch a document on the wrong person's record, not to police
 * spelling, and a false alarm costs someone a pointless look.
 */
export function nameMatchesClient(
  documentName: string | null,
  firstName: string | null,
  lastName: string | null,
): boolean | null {
  if (!documentName) return null;
  const docParts = new Set(nameKey(documentName));
  if (docParts.size === 0) return null;

  const wanted = [firstName, lastName]
    .filter((n): n is string => !!n)
    .flatMap((n) => nameKey(n));
  if (wanted.length === 0) return null;

  return wanted.every((part) => docParts.has(part));
}

// ---------------------------------------------------------------------------
// Fillable forms
// ---------------------------------------------------------------------------
//
// The regexes above read letters — an approval notice, a claim receipt — where
// the words are printed on the page. They are close to useless on the state's
// fillable forms, and measuring that on the agency's own archive is what
// showed why:
//
//   Claim Confirmation          100% of 103 documents gave up their total
//   Approval Letter              74% of 196 gave up an authorization number
//   Initial Assessment (IAT)      1% of 280
//   Level of Need (LON)           1% of 230
//
// The labels are printed on those forms — "Date of Birth" appears on 197 of
// the IATs — but the *answers* are not. They live in the PDF's form fields.
// Every one of 25 sampled IATs and 25 sampled LONs had filled fields, so the
// answer is to read the fields rather than to write cleverer regexes.
//
// Field names are matched on a normalised form, because the state writes them
// as long printed questions and one word of a question is liable to change
// between template revisions.

/** Lowercase, punctuation to spaces, runs collapsed. */
const normField = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type FieldKey = keyof Pick<
  DocumentFields,
  | 'memberName'
  | 'memberId'
  | 'medicaidId'
  | 'memberDob'
  | 'authorizationNumber'
  | 'icd10Code'
  | 'phone'
  | 'email'
  | 'mco'
  | 'county'
  | 'lonScore'
  | 'levelOfNeed'
>;

/**
 * Which form field holds which fact, in priority order.
 *
 * The order matters more than it looks. On the IAT, `1 Name as written on
 * Medicaid ID` is the member, while a plain `1 Name` sitting beside
 * `2 Relation to Member` is the *authorised representative* — a different
 * person, often a parent. Taking that one would file the form under the wrong
 * name, so only the specific label is ever read.
 *
 * `Last name1`…`Last name7` on the IAT and `First nameRow1`… on the LON are
 * household members, and are deliberately absent for the same reason.
 */
const FORM_FIELD_RULES: { key: FieldKey; match: RegExp }[] = [
  // Member name
  { key: 'memberName', match: /^1 name as written on medicaid id/ },
  { key: 'memberName', match: /^1 name not scored/ },
  { key: 'memberName', match: /^member name$/ },

  // Medicaid ID
  { key: 'medicaidId', match: /^5 medicaid id$/ },
  { key: 'medicaidId', match: /^3 medicaid id not scored/ },
  { key: 'medicaidId', match: /^medicaid id$/ },

  // MCO member ID
  { key: 'memberId', match: /^7 mco member id/ },
  { key: 'memberId', match: /^mco member id$/ },
  { key: 'memberId', match: /^4 member id$/ },   // Aetna request
  { key: 'memberId', match: /^member id$/ },     // Wellpoint request

  // Date of birth
  { key: 'memberDob', match: /^2 date of birth/ },      // LON
  { key: 'memberDob', match: /^5 date of birth/ },      // Aetna request
  { key: 'memberDob', match: /^date of birth/ },
  { key: 'memberDob', match: /^dob$/ },                 // Wellpoint request

  // Diagnosis. The Aetna request repeats the same printed question on rows 32
  // to 36, so the first row that was actually filled in is the one taken.
  { key: 'icd10Code', match: /^3[2-6] icd10/ },
  { key: 'icd10Code', match: /^icd ?10/ },
  { key: 'icd10Code', match: /^diagnosis code$/ },

  // Authorization number, where a form carries one
  { key: 'authorizationNumber', match: /^authorization number$/ },
  { key: 'authorizationNumber', match: /^prior auth(orization)? number$/ },

  // The IAT asks for these and nothing was reading them.
  { key: 'phone', match: /^3 phone number/ },
  { key: 'phone', match: /^5 phone number/ },
  { key: 'phone', match: /^phone$/ },
  { key: 'email', match: /^4 email address/ },
  { key: 'email', match: /^6 email address/ },
  { key: 'email', match: /^email( if applicable)?$/ },
  { key: 'mco', match: /^6 managed care organization/ },
  { key: 'mco', match: /^managed care organization/ },
  { key: 'county', match: /^8 location county/ },
  { key: 'county', match: /^county$/ },

  // The LON carries its own total and the level that total decides. No need to
  // add up the grid: the form asks the assessor to write the total in.
  { key: 'lonScore', match: /total score/ },
  { key: 'levelOfNeed', match: /^level of need category$/ },
];

// The Wellpoint request labels its people `Name` and `Name_2`, with a separate
// `Referral name print full name`. Which of those is the member and which is
// the referrer cannot be told from the field names, and filing a document
// under the wrong person is the exact fault this is meant to prevent — so
// none of them is read. Wellpoint requests give up their member ID and date of
// birth, and their name is left for a person.

/** The Aetna request splits the name across two fields. */
const AETNA_LAST = /^1 last name$/;
const AETNA_FIRST = /^2 first name$/;

/**
 * Read what a fillable form's own fields say.
 *
 * Takes the field values the app already extracts for document recognition,
 * so a form is never opened twice. Returns only what it actually found; the
 * caller merges this over the text-derived fields.
 */
export function fieldsFromFormValues(values: Record<string, string>): Partial<DocumentFields> {
  const byNorm = new Map<string, string>();
  for (const [name, value] of Object.entries(values)) {
    const v = (value ?? '').trim();
    if (v) byNorm.set(normField(name), v);
  }
  if (byNorm.size === 0) return {};

  const out: Partial<DocumentFields> = {};
  for (const rule of FORM_FIELD_RULES) {
    if (out[rule.key]) continue;
    for (const [norm, value] of byNorm) {
      if (!rule.match.test(norm)) continue;
      if (rule.key === 'memberDob') {
        const iso = toIso(value);
        if (iso) out.memberDob = iso;
      } else if (rule.key === 'medicaidId' || rule.key === 'memberId' || rule.key === 'authorizationNumber') {
        const digits = digitsOnly(value);
        if (digits) out[rule.key] = digits;
      } else if (rule.key === 'lonScore') {
        // A number, and only a plausible one. The grid runs to the low 30s.
        const n = Number(digitsOnly(value));
        if (Number.isFinite(n) && n > 0 && n <= 60) out.lonScore = String(n);
      } else if (rule.key === 'levelOfNeed') {
        // The form says "Low level of need"; the app says "Low Level".
        const low = /low/i.test(value);
        const high = /high/i.test(value);
        if (low || high) out.levelOfNeed = high ? 'High Level' : 'Low Level';
      } else if (rule.key === 'icd10Code') {
        // Only the housing Z-codes; a form may hold any diagnosis, and the
        // rest are not this app's business.
        const m = value.match(/Z\s?59\.?\s?(\d{1,3})/i);
        if (m) out.icd10Code = `Z59.${m[1]}`;
      } else {
        out[rule.key] = value.replace(/\s+/g, ' ').trim();
      }
      if (out[rule.key]) break;
    }
  }

  if (!out.memberName) {
    let last: string | undefined;
    let firstName: string | undefined;
    for (const [norm, value] of byNorm) {
      if (AETNA_LAST.test(norm)) last = value;
      if (AETNA_FIRST.test(norm)) firstName = value;
    }
    const joined = `${firstName ?? ''} ${last ?? ''}`.replace(/\s+/g, ' ').trim();
    if (joined) out.memberName = joined;
  }

  return out;
}

/**
 * Everything a document says, from its form fields and its printed text.
 *
 * Form fields win. They are what a person typed into the form; the printed
 * text around them is the blank question it answers.
 */
export function mergeDocumentFields(
  fromText: DocumentFields,
  fromForm: Partial<DocumentFields>,
): DocumentFields {
  const out = { ...fromText };
  for (const [k, v] of Object.entries(fromForm) as [keyof DocumentFields, never][]) {
    if (v !== null && v !== undefined && v !== '') out[k] = v;
  }
  return out;
}
