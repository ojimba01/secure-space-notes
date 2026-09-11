// One person's calendar, as a file Outlook, Google and Apple can subscribe to.
//
//   GET /calendar-feed?token=<uuid>   ->   text/calendar
//
// The token is the whole credential: no JWT, no session, because a calendar
// app fetching a URL on a schedule has no way to present one. That is the same
// bargain sheet-intake makes, and it is why the token is per-person,
// revocable, and hands back nothing but that person's own events.
//
// What a subscriber gets is a reminder, not the record. Their calendar app
// decides when to re-fetch -- Google can take most of a day, Outlook a few
// hours, Apple as little as five minutes -- so anything that has to be right
// now still has to be read in the app.
//
// Entries name the client. Staff subscribe with the agency's own Workspace or
// Microsoft 365 account, so that name lands somewhere the agency controls --
// which is the assumption this whole feed rests on.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/** Where a subscriber is sent to act on something. Unset: no links. */
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');

/** How much calendar to publish. Enough history to look back over, enough
 *  ahead to plan by, and not the whole table. */
const DAYS_BACK = 90;
const DAYS_AHEAD = 180;

const EVENT_TYPE_LABEL: Record<string, string> = {
  touch_point: 'Touchpoint',
  client_visit: 'Client visit',
  phone_call: 'Phone call',
  team_meeting: 'Team meeting',
  follow_up: 'Follow-up',
  administrative: 'Administrative',
  other: 'Event',
};

const MODALITY_LABEL: Record<string, string> = {
  in_person: 'In person',
  phone: 'Phone',
  text: 'Text',
  email: 'Email',
  virtual: 'Video',
  other: 'Contact',
};

// ---------------------------------------------------------------------------
// RFC 5545 plumbing
// ---------------------------------------------------------------------------

/** Escape a TEXT value. Order matters: backslashes first, or we escape our own. */
function esc(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Fold to 75 octets, as the spec requires and as strict parsers enforce.
 *
 * Counted in UTF-8 bytes, not characters, and never split through the middle
 * of one -- a name with an accent in it would otherwise arrive as mojibake, or
 * reject the whole file.
 */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;

  const out: string[] = [];
  let start = 0;
  let limit = 75; // continuation lines carry a leading space, so 74 after the first
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Do not cut inside a multi-byte character: 0b10xxxxxx is a continuation byte.
    while (end > start && end < bytes.length && (bytes[end] & 0b1100_0000) === 0b1000_0000) {
      end--;
    }
    const chunk = new TextDecoder().decode(bytes.slice(start, end));
    out.push(out.length === 0 ? chunk : ` ${chunk}`);
    start = end;
    limit = 74;
  }
  return out.join('\r\n');
}

const utcStamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const dateStamp = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

// ---------------------------------------------------------------------------

interface EventRow {
  id: string;
  title: string;
  description: string | null;
  event_type: string | null;
  status: string;
  modality: string | null;
  start_time: string;
  end_time: string;
  client_id: string | null;
  clients: {
    first_name: string | null;
    last_name: string | null;
    status: string | null;
    workflow_stage: string | null;
    deleted_at: string | null;
  } | null;
}

/** A closed case is Admin's, here as everywhere else. */
const isCaseClosed = (c: { status?: string | null; workflow_stage?: string | null }) =>
  c.status === 'closed' || c.workflow_stage === 'closed';

function summaryFor(e: EventRow): string {
  const typeLabel = EVENT_TYPE_LABEL[e.event_type ?? 'other'] ?? 'Event';
  const clientName = `${e.clients?.first_name ?? ''} ${e.clients?.last_name ?? ''}`.trim();
  const modality = e.modality ? MODALITY_LABEL[e.modality] ?? null : null;
  const done = e.status === 'completed' ? '\u2713 ' : '';

  if (e.event_type === 'touch_point' && clientName) {
    return `${done}${clientName}${modality ? ` (${modality})` : ''}`;
  }
  return `${done}${e.title || typeLabel}`;
}

function vevent(e: EventRow, host: string, now: Date): string {
  const start = new Date(e.start_time);
  const end = new Date(e.end_time);
  // Auto-scheduled touchpoints carry a date and no time -- they are stored
  // with start and end equal. Emitting those as timed events would put a
  // zero-length sliver at 8am in somebody's morning; they belong at the top of
  // the day, where an all-day entry goes.
  const allDay = start.getTime() === end.getTime();

  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.id}@${host}`,
    `DTSTAMP:${utcStamp(now)}`,
    allDay
      ? `DTSTART;VALUE=DATE:${dateStamp(start)}`
      : `DTSTART:${utcStamp(start)}`,
    allDay
      // DTEND is exclusive for an all-day event: the day after.
      ? `DTEND;VALUE=DATE:${dateStamp(addDays(start, 1))}`
      : `DTEND:${utcStamp(end)}`,
    `SUMMARY:${esc(summaryFor(e))}`,
    `STATUS:${e.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    // Nothing here is an invitation, and a calendar that marks these busy
    // would block a whole day for a phone call that takes ten minutes.
    'TRANSP:TRANSPARENT',
  ];

  if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
  if (APP_URL) lines.push(`URL:${APP_URL}`);

  lines.push('END:VEVENT');
  return lines.map(fold).join('\r\n');
}

Deno.serve(async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  // A malformed token is not a lookup worth making.
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response('Not found', { status: 404 });
  }

  const { data: sub } = await supabase
    .from('calendar_feed_subscriptions')
    .select('profile_id, access_count')
    .eq('token', token)
    .maybeSingle();

  // Same answer for a wrong token and a revoked one: a 404 tells whoever is
  // guessing nothing about which of the two they have.
  if (!sub) return new Response('Not found', { status: 404 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name, active')
    .eq('id', sub.profile_id)
    .maybeSingle();

  // A deactivated account keeps no live feed.
  if (!profile?.active) return new Response('Not found', { status: 404 });

  const now = new Date();
  const from = addDays(now, -DAYS_BACK).toISOString();
  const to = addDays(now, DAYS_AHEAD).toISOString();

  const { data, error } = await supabase
    .from('calendar_events')
    .select(
      'id, title, description, event_type, status, modality, start_time, end_time, client_id,' +
        ' clients:client_id (first_name, last_name, status, workflow_stage, deleted_at)',
    )
    .eq('employee_id', sub.profile_id)
    .gte('start_time', from)
    .lte('start_time', to)
    .order('start_time');

  if (error) return new Response('Unavailable', { status: 503 });

  // Service role reads past RLS, so every rule the app enforces has to be
  // restated here. A closed case and a deleted client are both out.
  const events = ((data ?? []) as unknown as EventRow[]).filter((e) => {
    if (!e.client_id) return true;
    if (!e.clients) return false;
    return !e.clients.deleted_at && !isCaseClosed(e.clients);
  });

  const host = url.hostname;
  const owner = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || 'Case Notes';

  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Supportive Care Management//Case Notes//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${esc(`Case Notes — ${owner}`)}`),
    'X-WR-TIMEZONE:America/New_York',
    // Both spellings of the same request: please re-read this hourly. Every
    // calendar app treats it as a hint and most ignore it.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
    ...events.map((e) => vevent(e, host, now)),
    'END:VCALENDAR',
    '',
  ].join('\r\n');

  // Best effort, and deliberately not awaited into the response: a person
  // wants to know their link is being read, but not at the cost of the read.
  supabase
    .from('calendar_feed_subscriptions')
    .update({ last_accessed_at: now.toISOString(), access_count: (sub.access_count ?? 0) + 1 })
    .eq('token', token)
    .then(() => {});

  return new Response(req.method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="case-notes.ics"',
      // A subscription URL is a credential; nothing in front of it should keep
      // a copy.
      'Cache-Control': 'private, no-store',
    },
  });
});
