// The level of need and LON score, taken from the client's LON.
//
// The LON says the client's level of need (its "Level of Need category") and
// total score in its own form fields. Those used to reach the client record
// only when an admin copied them across by hand, so 36 clients with a filed
// LON had no level of need. This reads the latest completed LON and puts them
// on the record:
//   - when a client's forms load, into a blank level of need or score only,
//     never over a value someone entered;
//   - when an LON is completed in the app, always, since it is the new
//     assessment.
// Only the level the form states is used, never one worked out from the
// score. A score under 18 is saved as Low Level whatever the form says (a
// database trigger enforces it). A change of level rebuilds billing and touchpoints,
// as editing it by hand does.
import { supabase } from '@/integrations/supabase/client';
import { extractPdfFieldValues, interpretFormValues } from '@/lib/formAutofill';
import { normalizeLevel } from '@/lib/billing';
import { resyncDerivedSchedules } from '@/lib/authorizations';
import { regenerateClientCycles } from '@/lib/billingSync';

const LON = 'Level of Need (LON)';

/** The level and score one LON PDF gives, or nulls where it gives none. */
export async function readLon(filePath: string): Promise<{ level: string | null; score: number | null }> {
  const { data, error } = await supabase.storage.from('client-files').download(filePath);
  if (error || !data) return { level: null, score: null };
  const raw = await extractPdfFieldValues(await data.arrayBuffer());
  const values = interpretFormValues(LON, raw);
  // The TOTAL SCORE box, or where it was left blank (it was added up by hand
  // until the app started filling it in), the score dropdowns added up.
  const total = values.lonScore !== undefined && values.lonScore > 0 ? values.lonScore : sumScores(raw);
  const score = total !== null && total > 0 && total <= 60 ? total : null;
  // Only the level the form states. It is never worked out from the score:
  // that could raise a client's billing without anyone choosing it, which the
  // agency decided against. A score with no stated level fills the score only.
  const level = normalizeLevel(raw['Level of Need category']);
  return { level: level ? `${level} Level` : null, score };
}

/** The LON's score dropdowns (Score_2 … Score_19) added up, or null when none was chosen. */
export function sumScores(raw: Record<string, string>): number | null {
  let total = 0;
  let any = false;
  for (const [name, value] of Object.entries(raw)) {
    if (!/^Score_\d+$/.test(name)) continue;
    const n = Number(String(value).split(',')[0].trim());
    if (!Number.isFinite(n) || String(value).trim() === '') continue;
    total += n;
    any = true;
  }
  return any ? total : null;
}

/**
 * Put the latest completed LON's level and score on the client record.
 * Returns what changed, or null when nothing did.
 */
export async function fillFromLon(
  clientId: string,
  options: { overwrite: boolean },
): Promise<{ level?: string; score?: number } | null> {
  const { data: client } = await supabase
    .from('clients')
    .select('level_of_need, lon_score')
    .eq('id', clientId)
    .maybeSingle();
  if (!client) return null;
  const hasLevel = !!(client.level_of_need ?? '').trim();
  const hasScore = client.lon_score !== null && client.lon_score !== undefined;
  if (!options.overwrite && hasLevel && hasScore) return null;

  const { data: forms } = await supabase
    .from('client_forms')
    .select('file_path, status')
    .eq('client_id', clientId)
    .eq('form_type', LON)
    .in('status', ['submitted', 'approved'])
    .not('file_path', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const latest = forms?.[0];
  if (!latest?.file_path) return null;

  const { level, score } = await readLon(latest.file_path);
  const patch: { level_of_need?: string; lon_score?: number } = {};
  if (level && (options.overwrite || !hasLevel) && level !== client.level_of_need) patch.level_of_need = level;
  if (score !== null && (options.overwrite || !hasScore) && score !== client.lon_score) patch.lon_score = score;
  if (!Object.keys(patch).length) return null;

  const { error } = await supabase.from('clients').update(patch).eq('id', clientId);
  if (error) return null;
  if (patch.level_of_need) {
    await resyncDerivedSchedules(clientId).catch(() => {});
    await regenerateClientCycles(clientId).catch(() => {});
  }
  return { level: patch.level_of_need, score: patch.lon_score };
}

/** Every active client with a blank level of need or score and a filed LON, for admins. */
export async function fillAllFromLon(
  onProgress?: (done: number, total: number) => void,
): Promise<{ checked: number; updated: number }> {
  const { data } = await supabase
    .from('clients')
    .select('id, level_of_need, lon_score')
    .eq('status', 'active')
    .is('deleted_at', null);
  const blank = (data ?? []).filter((c) => !(c.level_of_need ?? '').trim() || c.lon_score === null);
  let updated = 0;
  for (const [i, c] of blank.entries()) {
    try {
      if (await fillFromLon(c.id, { overwrite: false })) updated += 1;
    } catch {
      // Left for the next run.
    }
    onProgress?.(i + 1, blank.length);
  }
  return { checked: blank.length, updated };
}
