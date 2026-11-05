// Telling staff about new features.
//
// Each feature in FEATURES gets a notice at the top of the screen for five
// seconds, once per person, to the people it is relevant for, until its
// announce-until date. On the page itself, a "New" ribbon marks the new
// controls for 24 hours from the moment the person first sees it.
//
// When and whether each person has seen a feature is kept in feature_views
// (supabase/migrations/20261105140000_feature_views.sql), so it follows them
// across devices.
import { supabase } from '@/integrations/supabase/client';

export type FeatureAudience = 'everyone' | 'admins' | 'staffActivity';

export interface Feature {
  key: string;
  /** The notice, in one short sentence. */
  message: string;
  audience: FeatureAudience;
  /** The last day (YYYY-MM-DD) the notice is shown. */
  announceUntil: string;
}

export const FEATURES: Feature[] = [
  {
    key: 'staff-activity-60-days',
    message: 'New in Staff activity: Last 60 days and custom dates.',
    audience: 'staffActivity',
    announceUntil: '2026-11-19',
  },
];

/** How long the "New" ribbon stays after a person first sees it. */
export const RIBBON_MS = 24 * 60 * 60 * 1000;

export interface FeatureView {
  feature: string;
  notified_at: string | null;
  first_seen_at: string | null;
}

// Newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase.from as any)('feature_views');

let cache: { userId: string; views: Promise<Map<string, FeatureView>> } | null = null;

/** This person's views, loaded once per sign-in. */
export function loadViews(userId: string): Promise<Map<string, FeatureView>> {
  if (cache?.userId !== userId) {
    cache = {
      userId,
      views: Promise.resolve(table().select('feature, notified_at, first_seen_at').eq('user_id', userId))
        .then(({ data }: { data: FeatureView[] | null }) => new Map((data ?? []).map((v) => [v.feature, v])))
        .catch(() => new Map<string, FeatureView>()),
    };
  }
  return cache.views;
}

async function save(userId: string, feature: string, fields: Partial<FeatureView>) {
  const views = await loadViews(userId);
  const current = views.get(feature) ?? { feature, notified_at: null, first_seen_at: null };
  const next = { ...current, ...fields };
  views.set(feature, next);
  await Promise.resolve(
    table().upsert({ user_id: userId, ...next }, { onConflict: 'user_id,feature' }),
  ).catch(() => undefined);
}

export function markNotified(userId: string, feature: string): Promise<void> {
  return save(userId, feature, { notified_at: new Date().toISOString() });
}

/** Records the first time a person sees a feature's ribbon, and returns that time. */
export async function markSeen(userId: string, feature: string): Promise<string> {
  const views = await loadViews(userId);
  const seen = views.get(feature)?.first_seen_at;
  if (seen) return seen;
  const now = new Date().toISOString();
  await save(userId, feature, { first_seen_at: now });
  return now;
}
