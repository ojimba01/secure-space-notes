// Client files, filed into Forms.
//
// A file uploaded to Client files used to stay there only. Each one is now read
// with the same reader as Upload documents (documentRecognition.ts): a fillable
// PDF's fields, its printed title, then its file name. A recognised document is
// filed under that form in Forms as well, through file_client_file_as_form
// (supabase/migrations/20261117120000_sort_client_files_into_forms.sql), which
// keeps the uploader and upload date and points at the same stored file.
// Every file is read once: the function marks it sorted either way.
import { supabase } from '@/integrations/supabase/client';
import { recognizeDocument } from '@/lib/documentRecognition';

export interface SortableFile {
  id: string;
  file_name: string;
  file_path: string;
}

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const files = () => (supabase.from as any)('client_files');

/** Read one Client file and file it in Forms. Returns the form type, or null if not recognised. */
export async function sortClientFile(file: SortableFile): Promise<string | null> {
  const isPdf = /\.pdf$/i.test(file.file_name) || /\.pdf$/i.test(file.file_path);
  let bytes: ArrayBuffer | undefined;
  if (isPdf) {
    const { data } = await supabase.storage.from('client-files').download(file.file_path);
    if (data) bytes = await data.arrayBuffer();
  }
  // The reader decides PDF or not by the name; some uploads lost the extension.
  const name = isPdf && !/\.pdf$/i.test(file.file_name) ? `${file.file_name}.pdf` : file.file_name;
  let type: string | null = null;
  try {
    const result = await recognizeDocument(name, bytes);
    type = result.documentType && result.documentType !== 'Unsorted' ? result.documentType : null;
  } catch {
    type = null;
  }
  const { error } = await rpc('file_client_file_as_form', { _file_id: file.id, _form_type: type });
  if (error) throw new Error(error.message);
  return type;
}

/** File every not-yet-read Client file for one client. Returns the types filed. */
export async function sortClientFiles(clientId: string): Promise<string[]> {
  const { data, error } = await files()
    .select('id, file_name, file_path')
    .eq('client_id', clientId)
    .is('sorted_at', null);
  if (error) return [];
  const filed: string[] = [];
  for (const f of (data ?? []) as SortableFile[]) {
    try {
      const type = await sortClientFile(f);
      if (type) filed.push(type);
    } catch {
      // A file that cannot be read stays in Client files; the next visit tries again.
    }
  }
  return filed;
}

/** Every client's not-yet-read files, for admins. */
export async function sortAllClientFiles(
  onProgress?: (done: number, total: number) => void,
): Promise<{ read: number; filed: number }> {
  const { data, error } = await files().select('id, file_name, file_path').is('sorted_at', null);
  if (error) throw new Error(error.message);
  const list = (data ?? []) as SortableFile[];
  let filed = 0;
  for (const [i, f] of list.entries()) {
    try {
      if (await sortClientFile(f)) filed += 1;
    } catch {
      // Left for the next run.
    }
    onProgress?.(i + 1, list.length);
  }
  return { read: list.length, filed };
}
