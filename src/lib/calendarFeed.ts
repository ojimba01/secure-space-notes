// The per-person calendar subscription link.
//
// One read-only feed per member of staff, at a URL secret enough to stand in
// for signing in — which is the whole design: a calendar app fetching on a
// schedule has no session to present. So the link is the credential, it is off
// until somebody turns it on, and replacing it kills the old one outright.
import { supabase } from '@/integrations/supabase/client';

export interface CalendarFeed {
  token: string;
  showClientNames: boolean;
  lastAccessedAt: string | null;
}

/** The subscription table and its rotate function postdate the generated types. */
const loosely = supabase as unknown as {
  from: (t: string) => ReturnType<typeof supabase.from>;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

interface FeedRow {
  token: string;
  show_client_names: boolean;
  last_accessed_at: string | null;
}

const toFeed = (r: FeedRow): CalendarFeed => ({
  token: r.token,
  showClientNames: r.show_client_names,
  lastAccessedAt: r.last_accessed_at,
});

/**
 * The URL to paste into a calendar app.
 *
 * Built from the Supabase URL the app is already talking to, so it follows the
 * project between staging and production without a second thing to configure.
 */
export function calendarFeedUrl(token: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return `${(base ?? '').replace(/\/$/, '')}/functions/v1/calendar-feed?token=${token}`;
}

/** The signed-in person's feed, or null when they have never turned one on. */
export async function loadCalendarFeed(profileId: string): Promise<CalendarFeed | null> {
  const { data, error } = await loosely
    .from('calendar_feed_subscriptions')
    .select('token, show_client_names, last_accessed_at')
    .eq('profile_id', profileId)
    .maybeSingle();
  // A missing table means the migration has not been run yet. That is not
  // something to shout at a case manager about: the section simply offers to
  // create a link, and creating one will say what is wrong.
  if (error) return null;
  return data ? toFeed(data as unknown as FeedRow) : null;
}

/**
 * Turn the feed on, or turn it over.
 *
 * Both are the same call on purpose. Somebody who has just realised they
 * pasted their link into a group chat should not have to work out whether they
 * want "revoke" or "regenerate" — one button, old link dead, new link ready.
 */
export async function rotateCalendarFeedToken(): Promise<CalendarFeed> {
  const { data, error } = await loosely.rpc('rotate_calendar_feed_token');
  if (error) throw new Error(error.message);
  const token = data as string;

  // The token is all the function returns; the preference is the row's.
  const { data: row } = await loosely
    .from('calendar_feed_subscriptions')
    .select('token, show_client_names, last_accessed_at')
    .eq('token', token)
    .maybeSingle();

  return row
    ? toFeed(row as unknown as FeedRow)
    : { token, showClientNames: false, lastAccessedAt: null };
}

/** Stop publishing entirely. Every calendar subscribed to it goes stale. */
export async function turnCalendarFeedOff(): Promise<void> {
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) throw new Error('Not signed in');
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', me.user.id)
    .maybeSingle();
  if (!profile) throw new Error('Not signed in');

  const { error } = await loosely
    .from('calendar_feed_subscriptions')
    .delete()
    .eq('profile_id', profile.id);
  if (error) throw new Error(error.message);
}

/** Whether the feed carries client names. Off is the default, and the safe one. */
export async function setCalendarFeedNames(show: boolean): Promise<void> {
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) throw new Error('Not signed in');
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', me.user.id)
    .maybeSingle();
  if (!profile) throw new Error('Not signed in');

  const { error } = await loosely
    .from('calendar_feed_subscriptions')
    .update({ show_client_names: show })
    .eq('profile_id', profile.id);
  if (error) throw new Error(error.message);
}
