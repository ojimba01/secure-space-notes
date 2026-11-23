// Reading a referral, to start a new client from it on the Intake calls page.
//
// Referrals reach the agency as Word documents and PDFs, in several layouts:
//   - Horizon's "NJ FamilyCare Housing Supports Referrals" form (.docx):
//     First Name, Last Name, DOB, Member Medicaid ID#, Member Primary Phone
//     Number, Member Primary Address.
//   - Wellpoint's note (.doc): Name, Wellpoint Member ID, Medicaid ID, Date of
//     Birth (DOB), Current Living Address, Contact Number.
//   - Availity's authorization printout (PDF): "Patient Name JONES, ANGELA",
//     Payer AETNA.
//   - An emailed note: "Member Name: ... Member ID: ... Member Phone: ...".
// What the intake call needs is read off any of them: the name, the phone and
// the insurance, plus the IDs, date of birth and address when they are there.
// The person adding the client checks every box before saving.
import { MCO_OPTIONS } from '@/lib/billing';

export interface ReferralDetails {
  first_name: string;
  last_name: string;
  phone: string;
  insurance: string;
  /** The MCO's member ID. */
  member_id: string;
  /** The state Medicaid number (12 digits). */
  medicaid_id: string;
  /** MM/DD/YYYY. */
  date_of_birth: string;
  address: string;
}

const EMPTY: ReferralDetails = {
  first_name: '',
  last_name: '',
  phone: '',
  insurance: '',
  member_id: '',
  medicaid_id: '',
  date_of_birth: '',
  address: '',
};

/** The labels referrals print, where one answer ends and the next begins. */
const NEXT_LABEL = String.raw`(?=\s*(?:First\s*Name|Last\s*Name|Preferred\s*Name|Member|Patient|Wellpoint|Horizon|Aetna|Medicaid|Subscriber|DOB|Date|Social|Race|Veteran|Gender|Homeless|Current|Contact|Best\s*Time|County\s*of|Service|Income|Address|Phone|Email|ID|Relationship|Requesting|Provider|If\s|Main\s*Reason|Any\s*additional|$))`;

/** "JONES" -> "Jones", "o'neal" -> "O'Neal"; mixed case is left as written. */
const nameCase = (s: string) =>
  s !== s.toUpperCase() && s !== s.toLowerCase()
    ? s
    : s.toLowerCase().replace(/(^|[\s'\-])([a-z])/g, (_, b, l) => b + l.toUpperCase());

/** The name: "LAST, FIRST" or "First Last". */
function splitName(raw: string): { first_name: string; last_name: string } {
  const clean = raw.replace(/\s+/g, ' ').trim();
  if (clean.includes(',')) {
    const [last, rest] = clean.split(',', 2);
    return { first_name: nameCase(rest.trim().split(' ')[0] ?? ''), last_name: nameCase(last.trim()) };
  }
  const parts = clean.split(' ');
  if (parts.length === 1) return { first_name: nameCase(parts[0]), last_name: '' };
  return { first_name: nameCase(parts[0]), last_name: nameCase(parts.slice(1).join(' ')) };
}

/** Insurance names as referrals write them, to the app's MCO names. */
const INSURERS: { match: RegExp; mco: (typeof MCO_OPTIONS)[number] }[] = [
  { match: /\baetna\b/i, mco: 'Aetna' },
  { match: /\bhorizon\b/i, mco: 'Horizon' },
  { match: /\bwellpoint\b|\bamerigroup\b/i, mco: 'Wellpoint' },
  { match: /\bunited\s*health\s*care\b|\bunitedhealthcare\b|\bUHC\b/i, mco: 'UnitedHealthcare' },
  { match: /\bfidelis\b/i, mco: 'Fidelis' },
];

const PHONE = /\(?\b(\d{3})\)?[\s.\-]*(\d{3})[\s.\-]*(\d{4})\b/;
const DATE = /(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})|(\d{4})-(\d{2})-(\d{2})/;

/** What a referral's text says about the member. Boxes it does not say stay empty. */
export function parseReferralText(rawText: string): ReferralDetails {
  if (!rawText.trim()) return { ...EMPTY };
  // Word's form placeholders and stray marks are not answers.
  const text = rawText.replace(/FORMTEXT/g, ' ').replace(/[�\u0007]/g, ' ').replace(/\s+/g, ' ');
  const out = { ...EMPTY };
  const answer = (labels: string) =>
    text.match(new RegExp(String.raw`(?:${labels})\s*[:#\-]?\s*(.+?)${NEXT_LABEL}`, 'i'))?.[1]?.trim() ?? '';

  // The name: First Name and Last Name boxes, or one Name, ending at the next label.
  const first = answer(String.raw`First\s*Name`);
  const last = answer(String.raw`Last\s*Name`);
  if (first || last) {
    out.first_name = nameCase(first.split(' ')[0] ?? '');
    out.last_name = nameCase(last);
  } else {
    const name =
      answer(String.raw`(?:Member|Patient|Client|Consumer)\s*Name|(?<![A-Za-z])Name(?=\s*:)`) ||
      // Availity's printout opens with "LAST, FIRST Patient".
      (text.match(/\b([A-Z][A-Z'’\-]+,\s*[A-Z][A-Z'’\-]+)\s+Patient\b/)?.[1] ?? '');
    if (name && name.split(' ').length <= 5) Object.assign(out, splitName(name));
  }

  // The member's phone, never the provider's: Availity prints the agency's
  // phone under the requesting provider.
  const labelled = text.match(
    new RegExp(String.raw`(?:Member|Patient|Client|Cell|Home|Mobile|Contact|Primary)\s*(?:Primary\s*)?(?:Phone|Tel|Number|#)\s*(?:Number|No\.?)?\s*[:#\-]?\s*${PHONE.source}`, 'i'),
  );
  let phone = labelled ? labelled.slice(1, 4) : null;
  if (!phone) {
    for (const m of text.matchAll(new RegExp(String.raw`\bPhone\s*(?:Number|No\.?)?\s*[:#\-]?\s*${PHONE.source}`, 'gi'))) {
      const before = text.slice(Math.max(0, (m.index ?? 0) - 160), m.index ?? 0);
      if (/Provider|Facility|NPI|Organization|Fax/i.test(before)) continue;
      phone = m.slice(1, 4);
      break;
    }
  }
  if (phone) out.phone = `(${phone[0]}) ${phone[1]}-${phone[2]}`;

  // The insurance: Availity's "Payer", the referral's heading, or the MCO named anywhere.
  const payer = text.match(/\b(?:Payer|Insurance|Health\s*Plan|MCO)\s*[:#\-]?\s*([A-Za-z][A-Za-z ]{2,40})/i)?.[1] ?? '';
  out.insurance = (INSURERS.find((i) => i.match.test(payer)) ?? INSURERS.find((i) => i.match.test(text)))?.mco ?? '';

  // IDs. A state Medicaid number has 12 digits; a shorter number under a
  // "Medicaid ID" label is the MCO's member ID (Horizon's form labels its
  // 8-digit member ID that way).
  const idAfter = (labels: string) =>
    // The label must name an ID, and the answer must hold digits: "Member
    // reported to be homeless" is not a member ID.
    text.match(new RegExp(String.raw`(?:${labels})\s*(?:ID|Number|No\.)\s*#?\s*[:#\-]?\s*([A-Z0-9]*\d[A-Z0-9\-]{3,19})`, 'i'))?.[1]?.replace(/-/g, '') ?? '';
  const medicaid = idAfter(String.raw`Medicaid`);
  const member = idAfter(String.raw`(?:Wellpoint|Horizon|Aetna|MCO|Member|Subscriber)\s*Member|Member(?!\s*(?:Medicaid|Primary|Secondary|Name|Phone|Information))|Subscriber`);
  if (/^\d{12}$/.test(medicaid)) out.medicaid_id = medicaid;
  else if (medicaid && !member) out.member_id = medicaid;
  if (member && member !== out.medicaid_id) out.member_id = member;

  const dob = text.match(new RegExp(String.raw`(?:Date\s*of\s*Birth(?:\s*\(DOB\))?|DOB|Birth\s*Date)\s*[:#\-]?\s*(?:${DATE.source})`, 'i'));
  if (dob) {
    const [, m, d, y, iy, im, id] = dob;
    out.date_of_birth = y ? `${m.padStart(2, '0')}/${d.padStart(2, '0')}/${y}` : `${im}/${id}/${iy}`;
  }

  const address = answer(String.raw`(?:Current\s*Living|Member\s*Primary|Home|Mailing)?\s*Address(?:\s*\(Zip\s*Code\s*at\s*minimum\))?`);
  if (address && address.length <= 120) out.address = address;
  return out;
}

/** The text of a .docx: its document.xml, one line per paragraph. */
export async function docxText(bytes: ArrayBuffer): Promise<string> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(bytes);
  const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
  return xml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"');
}

/**
 * The text of an old .doc. Word 97 keeps a short document's text as plain
 * Windows-1252 runs between paragraph marks, which is all a referral needs.
 */
export function docText(bytes: ArrayBuffer): string {
  const raw = new TextDecoder('windows-1252').decode(new Uint8Array(bytes));
  const runs = raw.match(/[\x20-\x7E -ÿ‘-”\r\n\t]{4,}/g) ?? [];
  // The text comes first; theme and style parts follow and are not words.
  const end = runs.findIndex((r) => /\[Content_Types\]|theme\/theme/.test(r));
  return (end > 0 ? runs.slice(0, end) : runs).join('\n');
}

/** Every page's printed text, through the PDF viewer the app already ships. */
async function pdfText(bytes: ArrayBuffer): Promise<string> {
  const { pdfjs } = await import('react-pdf');
  await import('@/lib/pdfWorker');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
  const parts: string[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, 5); n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    parts.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '));
  }
  await doc.destroy();
  return parts.join(' ');
}

/** Read a referral file: PDF, Word (.docx or .doc). A scan with no text is read by OCR when the browser can. */
export async function readReferral(file: File): Promise<ReferralDetails> {
  const bytes = await file.arrayBuffer();
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx')) return parseReferralText(await docxText(bytes).catch(() => ''));
  if (name.endsWith('.doc')) return parseReferralText(docText(bytes));
  if (!name.endsWith('.pdf') && file.type !== 'application/pdf') return { ...EMPTY };
  let text = await pdfText(bytes).catch(() => '');
  if (text.replace(/\s/g, '').length < 40) {
    const { ocrPdf, ocrSupported } = await import('@/lib/ocr');
    if (ocrSupported()) text = (await ocrPdf(bytes, { regions: ['full'] }).catch(() => ({ text: '' }))).text;
  }
  return parseReferralText(text);
}
