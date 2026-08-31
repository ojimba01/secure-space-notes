import { supabase } from '@/integrations/supabase/client';

/**
 * A person's saved signature and initial.
 *
 * Drawing a signature with a mouse on every form is slow, and the result is
 * different every time. A submitted form should carry the same mark each time
 * it is signed, so the mark is made once and kept.
 *
 * Filed under the signer's own auth id, and readable only by them. Nobody
 * signs as somebody else, including an administrator.
 */

export type SignatureKind = 'signature' | 'initial';

export interface SavedSignature {
  id: string;
  label: string;
  kind: SignatureKind;
  imagePath: string;
}

/** `staff_signatures` is newer than the generated types. */
const table = () =>
  (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from(
    'staff_signatures',
  );

export async function loadSignatures(profileId: string): Promise<SavedSignature[]> {
  const { data, error } = await table()
    .select('id, label, kind, image_path')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, string>[]).map((r) => ({
    id: r.id,
    label: r.label,
    kind: r.kind as SignatureKind,
    imagePath: r.image_path,
  }));
}

/**
 * Store a mark and record it.
 *
 * The image is a PNG either way: a drawing is exported from the canvas as one,
 * and a photograph is stored as it arrived. Keeping one format means the code
 * that stamps it onto a form does not have to ask what it is holding.
 */
export async function saveSignature(
  profileId: string,
  userId: string,
  label: string,
  kind: SignatureKind,
  blob: Blob,
): Promise<void> {
  const ext = blob.type === 'image/png' ? 'png' : blob.type.split('/')[1] || 'png';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('signatures')
    .upload(path, blob, { contentType: blob.type || 'image/png' });
  if (uploadError) throw new Error(uploadError.message);

  const { error } = await table().insert({
    profile_id: profileId,
    label: label.trim() || (kind === 'initial' ? 'Initials' : 'Signature'),
    kind,
    image_path: path,
  } as never);
  if (error) throw new Error(error.message);
}

export async function deleteSignature(sig: SavedSignature): Promise<void> {
  await supabase.storage.from('signatures').remove([sig.imagePath]);
  const { error } = await table().delete().eq('id', sig.id);
  if (error) throw new Error(error.message);
}

/** A link the browser can show, good for an hour. */
export async function signatureUrl(imagePath: string): Promise<string | null> {
  const { data } = await supabase.storage.from('signatures').createSignedUrl(imagePath, 3600);
  return data?.signedUrl ?? null;
}

/** The bytes, for stamping onto a form. */
export async function signatureBytes(imagePath: string): Promise<ArrayBuffer | null> {
  const { data } = await supabase.storage.from('signatures').download(imagePath);
  return data ? await data.arrayBuffer() : null;
}
