// Recording where staff spend their time, for the Staff activity page.
//
// Each page visit and each task (filling out a form, uploading a document) is
// a row in staff_activity, opened when it starts and topped up every half
// minute while it stays open. Only time spent actively working counts: the tab
// has to be in view and the person has to have used the mouse or keyboard in
// the last two minutes. A page left open over lunch shows as open, not worked.
//
// Rows are written only through two database functions that touch the
// caller's own rows (docs/staff-activity.sql), and only superadmins can read
// them. Until that SQL has been applied the calls fail, and nothing else is
// affected: recording is never allowed to get in the way of the work.
import { supabase } from '@/integrations/supabase/client';

/** How often counted time is sent. */
const FLUSH_MS = 30_000;
/** How often the clock checks whether somebody is working. */
const TICK_MS = 5_000;
/** No input for this long and the time stops counting. */
const IDLE_MS = 120_000;

export type ActivityKind = 'page' | 'task';
export type TaskOutcome = 'completed' | 'draft' | 'closed';

// The two functions are newer than the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args: Record<string, unknown>) => (supabase.rpc as any)(name, args);

interface Open {
  id: Promise<string | null>;
  /** Seconds counted and not yet sent. */
  pending: number;
  ended: boolean;
}

const open = new Set<Open>();
let lastInput = Date.now();
let started = false;

function send(entry: Open, outcome?: TaskOutcome) {
  const seconds = entry.pending;
  entry.pending = 0;
  if (!seconds && !outcome) return;
  entry.id
    .then((id) => {
      if (!id) return;
      return rpc('touch_staff_activity', {
        _id: id,
        _add_seconds: seconds,
        _outcome: outcome ?? null,
      });
    })
    .catch(() => undefined);
}

function ensureStarted() {
  if (started || typeof window === 'undefined') return;
  started = true;

  const input = () => {
    lastInput = Date.now();
  };
  for (const event of ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel']) {
    window.addEventListener(event, input, { passive: true, capture: true });
  }

  window.setInterval(() => {
    const working = document.visibilityState === 'visible' && Date.now() - lastInput < IDLE_MS;
    if (!working) return;
    for (const entry of open) entry.pending += TICK_MS / 1000;
  }, TICK_MS);

  window.setInterval(() => {
    for (const entry of open) send(entry);
  }, FLUSH_MS);

  // Leaving the tab or closing it: send what has been counted so far.
  const flushAll = () => {
    for (const entry of open) send(entry);
  };
  window.addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll();
  });
}

export interface ActivityHandle {
  /** Stop counting. A task says how it ended. */
  end: (outcome?: TaskOutcome) => void;
}

/** Start recording a page visit or a task. Call end() when it closes. */
export function startActivity(
  kind: ActivityKind,
  area: string,
  label: string,
  clientId?: string | null,
): ActivityHandle {
  ensureStarted();
  lastInput = Date.now();
  const entry: Open = {
    id: Promise.resolve(
      rpc('start_staff_activity', {
        _kind: kind,
        _area: area,
        _label: label,
        _client_id: clientId ?? null,
      }),
    )
      .then(({ data, error }: { data: string | null; error: unknown }) => (error ? null : data))
      .catch(() => null),
    pending: 0,
    ended: false,
  };
  open.add(entry);
  return {
    end: (outcome) => {
      if (entry.ended) return;
      entry.ended = true;
      open.delete(entry);
      send(entry, outcome);
    },
  };
}

/** Readable names for each part of the app, as the Staff activity page shows them. */
export const AREA_LABEL: Record<string, string> = {
  clients: 'Clients',
  client: 'Client records',
  forms: 'Forms',
  touchpoints: 'Touchpoints',
  calendar: 'Calendar',
  billing: 'Billing',
  admin: 'Admin dashboard',
  advanced: 'Advanced tools',
  help: 'Help guide',
  activity: 'Staff activity',
  form: 'Filling out forms',
  upload: 'Uploading documents',
  touchpoint: 'Logging touchpoints',
  other: 'Other pages',
};

/** Which page a location is, for recording. Null for pages not worth recording. */
export function pageFor(
  pathname: string,
  search: string,
): { area: string; label: string; clientId: string | null } | null {
  const params = new URLSearchParams(search);
  if (pathname === '/') {
    const client = params.get('client');
    if (client) return { area: 'client', label: 'Client record', clientId: client };
    const view = params.get('view');
    if (view === 'clients') return { area: 'clients', label: 'Client list', clientId: null };
    if (view === 'forms') return { area: 'forms', label: 'Forms', clientId: null };
    if (view === 'calendar') return { area: 'calendar', label: 'Calendar', clientId: null };
    return { area: 'touchpoints', label: 'Touchpoints', clientId: null };
  }
  if (pathname.startsWith('/billing')) return { area: 'billing', label: 'Billing', clientId: null };
  if (pathname.startsWith('/admin')) return { area: 'admin', label: 'Admin dashboard', clientId: null };
  if (pathname.startsWith('/advanced-tools')) return { area: 'advanced', label: 'Advanced tools', clientId: null };
  if (pathname.startsWith('/onboarding')) return { area: 'help', label: 'Help guide', clientId: null };
  if (pathname.startsWith('/staff-activity')) return { area: 'activity', label: 'Staff activity', clientId: null };
  if (pathname.startsWith('/auth') || pathname.startsWith('/reset-password')) return null;
  return { area: 'other', label: pathname, clientId: null };
}
