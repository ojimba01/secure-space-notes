import JSZip from 'jszip';
import { supabase } from '@/integrations/supabase/client';
import { extractDocumentFields } from '@/lib/documentFields';

/**
 * Load text the agency already extracted, instead of extracting it again.
 *
 * The archive ships a folder of `.txt` files, one per document, named after the
 * file they came from with `/` written as `__`:
 *
 *   WELLPOINT CLIENTS__AYYAD, Magdy__AYYAD Magdy - Level of Need (LON).pdf.txt
 *   WELLPOINT CLIENTS/AYYAD, Magdy/AYYAD Magdy - Level of Need (LON).pdf
 *
 * The second line is exactly what the importer stored in `source_filename`, so
 * the match is deterministic. No guessing, no fuzzy names.
 *
 * This fills the text and the fields the text can give up. It deliberately
 * does NOT mark a document read, because reading also opens the PDF's own form
 * fields, and that is where the good answers live: a state IAT gives up a date
 * of birth to its form fields 98% of the time and to its printed text 1% of the
 * time. Marking these done would trade the better source for the faster one.
 *
 * What it does buy, immediately: every document becomes searchable, and the
 * letters - approval letters especially - give up their authorisation numbers
 * and service dates without waiting for the queue.
 */

const MAX_STORED_CHARS = 400_000;
/** Postgres will not store a NUL byte in a text column. */
const clean = (s: string) => s.replace(/\u0000/g, '').trim();

export interface TextLoadProgress {
  read: number;
  matched: number;
  filled: number;
  total: number;
}

export interface TextLoadResult {
  /** Text files in the zip. */
  total: number;
  /** Text files whose document is filed in the app. */
  matched: number;
  /** Documents given text. */
  filled: number;
  /** Documents that already had text, left alone. */
  alreadyHadText: number;
  /** Text files naming a document that is not in the app. */
  unmatched: string[];
  failed: { name: string; error: string }[];
}

/** Turn a text file's name back into the path the importer stored. */
export const sourcePathFromTextName = (name: string): string => {
  const base = name.split('/').pop() ?? name;
  return base.replace(/\.txt$/i, '').replace(/__/g, '/');
};

/**
 * Read a zip of extracted text and write it onto the documents it belongs to.
 *
 * Documents are matched in chunks so a 2,044-file zip does not become 2,044
 * round trips before anything is written.
 */
export async function loadExtractedText(
  file: File,
  onProgress?: (p: TextLoadProgress) => void,
): Promise<TextLoadResult> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());

  const entries = Object.values(zip.files).filter(
    (e) => !e.dir && /\.txt$/i.test(e.name) && !e.name.includes('__MACOSX') &&
      !(e.name.split('/').pop() ?? '').startsWith('.'),
  );

  const result: TextLoadResult = {
    total: entries.length,
    matched: 0,
    filled: 0,
    alreadyHadText: 0,
    unmatched: [],
    failed: [],
  };

  const byPath = new Map<string, JSZip.JSZipObject>();
  for (const entry of entries) byPath.set(sourcePathFromTextName(entry.name), entry);

  const paths = [...byPath.keys()];
  const CHUNK = 100;
  let read = 0;

  for (let i = 0; i < paths.length; i += CHUNK) {
    const slice = paths.slice(i, i + CHUNK);

    const { data: rows, error } = await supabase
      .from('client_forms')
      .select('id, client_id, source_filename, extracted_text')
      .in('source_filename', slice);
    if (error) throw new Error(error.message);

    const found = new Map<string, { id: string; extracted_text: string | null }>();
    for (const row of rows ?? []) {
      if (row.source_filename) {
        found.set(row.source_filename, { id: row.id, extracted_text: row.extracted_text });
      }
    }

    for (const path of slice) {
      read += 1;
      const match = found.get(path);
      if (!match) {
        result.unmatched.push(path);
        continue;
      }
      result.matched += 1;

      if (match.extracted_text && match.extracted_text.trim()) {
        result.alreadyHadText += 1;
        continue;
      }

      try {
        const raw = await byPath.get(path)!.async('string');
        const text = clean(raw).slice(0, MAX_STORED_CHARS);
        if (!text) continue;

        // Only what printed text can honestly give. The form-field answers
        // are left for the reader, which is the better source for them.
        const fields = extractDocumentFields(text);

        const { error: writeError } = await supabase
          .from('client_forms')
          .update({
            extracted_text: text,
            text_char_count: text.length,
            text_truncated: clean(raw).length > MAX_STORED_CHARS,
            field_authorization_number: fields.authorizationNumber,
            field_service_start: fields.serviceStart,
            field_service_end: fields.serviceEnd,
            field_total_charges: fields.totalCharges,
            field_notice_date: fields.noticeDate,
            field_submission_date: fields.submissionDate,
          })
          .eq('id', match.id);
        if (writeError) throw writeError;
        result.filled += 1;
      } catch (err: any) {
        result.failed.push({ name: path, error: err.message ?? String(err) });
      }
    }

    onProgress?.({
      read,
      matched: result.matched,
      filled: result.filled,
      total: entries.length,
    });
  }

  return result;
}
