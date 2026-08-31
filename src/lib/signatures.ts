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
  /** Offered first when a form asks for this kind of mark. */
  isDefault: boolean;
}

/** `staff_signatures` is newer than the generated types. */
const table = () =>
  (supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }).from(
    'staff_signatures',
  );

export async function loadSignatures(profileId: string): Promise<SavedSignature[]> {
  const { data, error } = await table()
    .select('id, label, kind, image_path, is_default')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    label: r.label as string,
    kind: r.kind as SignatureKind,
    imagePath: r.image_path as string,
    isDefault: r.is_default === true,
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

/** Make this the one offered first. The trigger unsets the previous one. */
export async function makeDefault(id: string): Promise<void> {
  const { error } = await table().update({ is_default: true } as never).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSignature(sig: SavedSignature): Promise<void> {
  await supabase.storage.from('signatures').remove([sig.imagePath]);
  const { error } = await table().delete().eq('id', sig.id);
  if (error) throw new Error(error.message);
}

/**
 * Turn a photograph of a signature into something that looks scanned.
 *
 * A phone photo carries the paper's colour, the shadow of the hand that took
 * it and whatever was on the desk. Thresholding on brightness keeps the ink
 * and drops the rest: everything lighter than the cut becomes transparent,
 * everything darker becomes black.
 *
 * Transparent rather than filled white, so stamping it onto a form does not
 * paint a white box over the line it sits on. It reads as white anywhere it is
 * shown against a page.
 */
export async function cleanPhotograph(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  // Big enough to stay sharp on a printed form, small enough to store.
  const scale = Math.min(1, 1200 / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data } = image;

  // The cut sits below the mid point: paper photographed indoors is rarely
  // white, and a cut at half would take the paper with the ink.
  const CUT = 150;
  for (let i = 0; i < data.length; i += 4) {
    const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (brightness > CUT) {
      data[i + 3] = 0;
    } else {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/png'),
  );
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
