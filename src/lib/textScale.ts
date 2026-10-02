// Text size per account, for someone who needs everything larger.
//
// A superadmin sets it in Advanced Tools. The whole page is zoomed by the
// account's scale, so the layout stays exactly the same (the same columns and
// lines everyone else sees), just bigger, using more of a wide screen.
import { supabase } from '@/integrations/supabase/client';

export const TEXT_SCALES: { value: number; label: string }[] = [
  { value: 1, label: 'Standard' },
  { value: 1.15, label: 'Large' },
  { value: 1.3, label: 'Larger' },
  { value: 1.5, label: 'Largest' },
];

const CACHE = 'textScale:';

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase.from as any)('display_settings');

/** The saved scale for a profile (1 when none is set). */
export async function loadTextScale(profileId: string): Promise<number> {
  const { data } = await table().select('text_scale').eq('profile_id', profileId).maybeSingle();
  const v = Number(data?.text_scale ?? 1);
  return Number.isFinite(v) && v >= 1 ? v : 1;
}

export async function saveTextScale(profileId: string, scale: number): Promise<void> {
  const { data: who } = await supabase.auth.getUser();
  const { error } = await table().upsert({ profile_id: profileId, text_scale: scale, updated_by: who.user?.id ?? null }, { onConflict: 'profile_id' });
  if (error) throw new Error(error.message);
}

/** Zoom the whole page. Remembered in this browser so the next load starts at the right size. */
export function applyTextScale(profileId: string | null, scale: number): void {
  const z = scale > 1 ? String(scale) : '';
  document.documentElement.style.zoom = z;
  if (!profileId) return;
  try {
    localStorage.setItem(CACHE + profileId, String(scale));
  } catch {
    // Storage blocked: the size is read from the database on each load instead.
  }
}

export function cachedTextScale(profileId: string): number | null {
  try {
    const v = Number(localStorage.getItem(CACHE + profileId));
    return v >= 1 ? v : null;
  } catch {
    return null;
  }
}
