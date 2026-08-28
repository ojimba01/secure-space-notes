// The agency's filing convention, applied to a document as it is uploaded.
//
//     SURNAME First - Document Type - tags - YYYY-MM-DD.ext
//
// Every one of the 2,033 documents in the archive is named this way. A file
// arriving from a phone or a fax is not, and renaming two thousand of them by
// hand once was enough — `_RENAME LOG - undo list.csv` records 1,300 of them.
//
// So the app proposes the name at the point of upload, when it already knows
// the client, has just worked out the document type, and can read a date off
// the page. The suggestion is editable: it is a starting point for somebody
// who can see the document, not a decision made on their behalf.
import type { DocumentType } from '@/lib/documentRecognition';

/** Version words the archive uses, in the order they are written. */
export const NAME_TAGS = [
  'Updated',
  'Corrected',
  '2nd',
  '3rd',
  'Signed',
  '30-day',
  '150-day',
  '180-day',
] as const;

export type NameTag = (typeof NAME_TAGS)[number];

export interface NameParts {
  firstName: string | null;
  lastName: string | null;
  documentType: DocumentType | string | null;
  /** ISO date, or null to leave the date off entirely. */
  date: string | null;
  tags?: string[];
  /** Kept from the uploaded file; defaults to pdf. */
  extension?: string;
}

/**
 * Strip anything a file system will not take, and anything that would make one
 * segment look like another.
 *
 * Slashes matter most: two document types contain one ("Lease or Housing
 * Document" does not, but a hand-typed "Auth / Approval" would), and a slash
 * in a name silently becomes a folder.
 */
const clean = (s: string): string =>
  s
    .replace(/[\\/:*?"<>|]+/g, ' ')
    // The convention uses " - " as its separator, so a hyphen inside a segment
    // has to lose its spaces or the name cannot be read back.
    .replace(/\s+-\s+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

/** `2026-08-28` from an ISO date, or null. Anything unparseable is left off. */
const isoDay = (d: string | null): string | null => {
  if (!d) return null;
  const m = d.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/**
 * The agency's name for this document.
 *
 * Segments that are not known are left out rather than filled with a
 * placeholder: `LAST First - Lease or Housing Document.pdf` is a usable name,
 * and `LAST First - Unknown - Untitled - .pdf` is not.
 */
export function suggestDocumentName(parts: NameParts): string {
  const ext = (parts.extension ?? 'pdf').replace(/^\./, '').toLowerCase() || 'pdf';

  const last = clean(parts.lastName ?? '').toUpperCase();
  const first = clean(parts.firstName ?? '');
  // "SURNAME First" — surname in capitals, which is how the archive sorts.
  const who = [last, first].filter(Boolean).join(' ');

  const segments = [
    who,
    clean(String(parts.documentType ?? '')),
    ...(parts.tags ?? []).map((t) => clean(t)).filter(Boolean),
    isoDay(parts.date) ?? '',
  ].filter(Boolean);

  // Nothing known at all still needs a filename.
  if (segments.length === 0) return `Document.${ext}`;
  return `${segments.join(' - ')}.${ext}`;
}

/**
 * Version words already present in the name the uploader gave the file.
 *
 * The original filename is often the only place a version is recorded — a
 * scan of a corrected form looks identical to the first one — so anything the
 * uploader wrote is carried across rather than dropped.
 */
export function tagsFromFilename(filename: string): string[] {
  const found: string[] = [];
  const name = filename.replace(/\.[^.]+$/, '');
  for (const tag of NAME_TAGS) {
    const pattern = tag.includes('-')
      ? new RegExp(`\\b${tag.replace('-', '[\\s-]?')}\\b`, 'i')
      : new RegExp(`\\b${tag}\\b`, 'i');
    if (pattern.test(name)) found.push(tag);
  }
  return found;
}

/** The extension of an uploaded file, without the dot. */
export function extensionOf(filename: string): string {
  const m = filename.match(/\.([A-Za-z0-9]{1,8})$/);
  return m ? m[1].toLowerCase() : 'pdf';
}
