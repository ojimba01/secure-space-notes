// Where a blank form actually comes from.
//
// Six templates ship in the repository under public/form-templates/. That is
// the floor, not the answer: the state and the MCOs reissue their forms, and
// an agency that cannot put the new one in has to wait for a code change to
// file a claim.
//
// So the registry decides. A row in form_template_registry may carry a
// `template_path` pointing either at the file shipped in the repo (a path
// beginning with "/") or at a PDF an admin uploaded (a key in the
// form-templates bucket). Whichever the row names is what staff fill in.
import { supabase } from '@/integrations/supabase/client';

export const TEMPLATE_BUCKET = 'form-templates';

/** A path into the app's own build, rather than a key in storage. */
export const isRepoTemplate = (path: string | null | undefined): boolean =>
  !!path && path.startsWith('/');

/**
 * The blank form to open, as bytes.
 *
 * `mco` matters: the Aetna and Wellpoint requests are both a Prior
 * Authorization Request, so the document type alone cannot tell them apart.
 * A statewide row (no MCO) is the fallback when no payer-specific row exists.
 *
 * Falls back to `repoFile` whenever the registry has nothing to say or the
 * upload cannot be read, because a staff member who needs the form today
 * should get the version we shipped rather than an error.
 */
export async function loadBlankTemplate(
  formType: string,
  mco: string | null,
  repoFile: string,
): Promise<ArrayBuffer> {
  const storedPath = await registryPathFor(formType, mco);

  if (storedPath && !isRepoTemplate(storedPath)) {
    const { data, error } = await supabase.storage.from(TEMPLATE_BUCKET).download(storedPath);
    if (!error && data) return await data.arrayBuffer();
    // Fall through to the shipped copy rather than leaving somebody stuck.
  }

  const path = storedPath && isRepoTemplate(storedPath) ? storedPath : repoFile;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load the blank template (${res.status}).`);
  return await res.arrayBuffer();
}

/** The active registry row's template_path for this form, or null. */
export async function registryPathFor(
  formType: string,
  mco: string | null,
): Promise<string | null> {
  const { data } = await supabase
    .from('form_template_registry')
    .select('template_path, mco')
    .eq('form_type', formType)
    .eq('active', true);

  const rows = data ?? [];
  // A row naming this payer wins over a statewide one.
  const exact = mco ? rows.find((r) => r.mco === mco) : undefined;
  const statewide = rows.find((r) => !r.mco);
  return (exact ?? statewide ?? rows[0])?.template_path ?? null;
}
