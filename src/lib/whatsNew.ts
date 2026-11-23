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
  /**
   * For a change people have to find: a popup with steps, shown once, in
   * place of the five-second notice.
   */
  popup?: {
    title: string;
    /** Numbered steps, for a change people have to find. */
    steps?: string[];
    /** One short paragraph, for an announcement with a picture. */
    body?: string;
    /** A picture across the top, with a NEW ribbon on the corner. */
    illustration?: 'autosave' | 'editHistory' | 'webIntake' | 'intakeCalls' | 'formComments' | 'intakePackage';
    goTo?: { label: string; path: string; state?: unknown };
  };
}

export const FEATURES: Feature[] = [
  {
    key: 'intake-calls-page',
    message: 'Intake calls now has its own page.',
    audience: 'admins',
    announceUntil: '2026-12-07',
    popup: {
      title: 'Review every intake in one place!',
      body: 'The new Intake calls page shows each new member’s calls, forms and review status. It has been enabled on your account.',
      illustration: 'intakePackage',
    },
  },
  {
    key: 'form-comments',
    message: 'Your supervisor can now comment on your forms.',
    audience: 'everyone',
    announceUntil: '2026-12-07',
    popup: {
      title: 'Get it right the first time!',
      body: 'Your supervisor can now comment on a form, and you are notified right away. Notifications have been enabled on your account.',
      illustration: 'formComments',
    },
  },
  {
    key: 'intake-calls',
    message: 'You can now report when a new client does not answer.',
    audience: 'everyone',
    announceUntil: '2026-12-03',
    popup: {
      title: 'Client didn’t pick up? Let the team know!',
      body: 'You can now report a missed intake call in one click. Intake call tracking has been enabled on your account.',
      illustration: 'intakeCalls',
    },
  },
  {
    key: 'web-client-intake',
    message: 'The Client Intake now opens as a web form.',
    audience: 'everyone',
    announceUntil: '2026-12-02',
    popup: {
      title: 'Intakes just got easier!',
      body: 'The Client Intake now opens as a simple web form. Your answers fill in the PDF automatically.',
      illustration: 'webIntake',
    },
  },
  {
    key: 'form-edit-history',
    message: 'Forms now keep a full edit history.',
    audience: 'admins',
    announceUntil: '2026-12-02',
    popup: {
      title: 'Every change, accounted for!',
      body: 'Forms now keep a full edit history. Edit history has been enabled on your account.',
      illustration: 'editHistory',
    },
  },
  {
    key: 'forms-autosave',
    message: 'Forms now save automatically.',
    audience: 'everyone',
    announceUntil: '2026-12-02',
    popup: {
      title: 'Never lose your work again!',
      body: 'Forms now save automatically as you work. Autosave has been enabled on your account.',
      illustration: 'autosave',
    },
  },
  {
    key: 'staff-activity-60-days',
    message: 'New in Staff activity: Last 60 days and custom dates.',
    audience: 'staffActivity',
    announceUntil: '2026-11-19',
  },
  {
    key: 'client-forms-moved',
    message: 'Forms have moved to the client’s Overview tab.',
    audience: 'everyone',
    announceUntil: '2026-11-26',
    popup: {
      title: 'Forms have moved',
      steps: [
        'Select Clients, then select a client’s card.',
        'On the Overview tab, scroll down to Forms.',
        'Begin, continue, upload and download each form there, or on the Forms tab.',
      ],
      goTo: { label: 'Go to Clients', path: '/', state: { view: 'clients' } },
    },
  },
  {
    key: 'forms-update-nov-17',
    message: 'Updates to Forms: Edit for completed forms, and Client files moved into Forms.',
    audience: 'everyone',
    announceUntil: '2026-12-01',
    popup: {
      title: 'Updates to Forms',
      steps: [
        'To change a completed form, open its row under Forms and select Edit. Save draft keeps it unfinished; Complete form finishes it again.',
        'Client files is gone. Its files are now in Forms, under their form or under Other documents. To add a file, select Upload documents.',
        'You can open every file on your clients, whoever uploaded it.',
        'Select a form’s name, or its document count, to show its documents.',
      ],
    },
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
