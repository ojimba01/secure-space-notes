// Emails support when somebody opens a ticket or replies to one.
//
// Called by the app straight after the ticket or reply is saved. The caller's
// own login is used to read the ticket, so nobody can have a ticket emailed
// that they could not already see. Screenshots and recordings are linked, not
// attached, through signed links that expire after seven days.
//
// Needs RESEND_API_KEY (already used by compliance-cron). Emails go to
// mdajimba@gmail.com unless SUPPORT_EMAIL (comma-separated) says otherwise.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Attachment {
  path: string;
  kind: 'screenshot' | 'recording' | 'file';
  name?: string;
}

const KIND_LABEL: Record<string, string> = {
  screenshot: 'Screenshot',
  recording: 'Screen recording',
  file: 'File',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const url = Deno.env.get('SUPABASE_URL')!;
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: { ticketId?: string; messageId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is answered below.
  }
  if (!body.ticketId) return Response.json({ sent: false, reason: 'No ticket' }, { status: 400, headers: cors });

  // Read through the caller's login: a ticket they cannot see is not found.
  const { data: ticket } = await asCaller
    .from('support_tickets')
    .select('id, created_by, message, page_url, status, attachments, created_at')
    .eq('id', body.ticketId)
    .maybeSingle();
  if (!ticket) return Response.json({ sent: false, reason: 'Not found' }, { status: 404, headers: cors });

  let message: { body: string; from_support: boolean; attachments: Attachment[] } | null = null;
  if (body.messageId) {
    const { data } = await asCaller
      .from('support_ticket_messages')
      .select('body, from_support, attachments')
      .eq('id', body.messageId)
      .eq('ticket_id', ticket.id)
      .maybeSingle();
    message = data;
    // Support's own replies go to the person in the app, not to support's inbox.
    if (!message || message.from_support) return Response.json({ sent: false }, { headers: cors });
  }

  const { data: person } = await admin
    .from('profiles')
    .select('first_name, last_name, email')
    .eq('user_id', ticket.created_by)
    .maybeSingle();
  const who = person
    ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() || person.email || 'A staff member'
    : 'A staff member';

  const attachments: Attachment[] = (message ? message.attachments : ticket.attachments) ?? [];
  const links: string[] = [];
  for (const a of attachments) {
    const { data } = await admin.storage.from('support-attachments').createSignedUrl(a.path, 7 * 86_400);
    if (data?.signedUrl) {
      links.push(`<li><a href="${esc(data.signedUrl)}">${esc(KIND_LABEL[a.kind] ?? 'File')}${a.name ? `: ${esc(a.name)}` : ''}</a></li>`);
    }
  }

  let appLink = '';
  try {
    if (ticket.page_url) appLink = `${new URL(ticket.page_url).origin}/support-tickets?ticket=${ticket.id}`;
  } catch {
    // No usable page address; the email goes without a link back.
  }

  const text = message ? message.body : ticket.message;
  const subject = message ? `Support reply from ${who}` : `New support request from ${who}`;
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#111">
      <p><strong>${esc(who)}</strong>${person?.email ? ` (${esc(person.email)})` : ''} ${message ? 'replied to a support request' : 'opened a support request'}.</p>
      <blockquote style="border-left:3px solid #ccc;margin:0;padding:4px 12px;white-space:pre-wrap">${esc(text)}</blockquote>
      ${ticket.page_url ? `<p style="color:#555">Page: ${esc(ticket.page_url)}</p>` : ''}
      ${links.length ? `<p>Attachments (links expire in 7 days):</p><ul>${links.join('')}</ul>` : ''}
      ${appLink ? `<p><a href="${esc(appLink)}">Open the ticket</a> to reply or update its status.</p>` : ''}
    </div>`;

  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.log('RESEND_API_KEY not set; support email not sent:', subject);
    return Response.json({ sent: false, reason: 'Email is not set up' }, { headers: cors });
  }
  // SUPPORT_EMAIL overrides who receives it (comma-separated).
  const to = (Deno.env.get('SUPPORT_EMAIL') ?? 'mdajimba@gmail.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!to.length) return Response.json({ sent: false, reason: 'No recipient' }, { headers: cors });
  // One email per address, so an address the mail service refuses does not
  // stop the others.
  const results = await Promise.all(
    to.map(async (address) => {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Clinical Notes Support <onboarding@resend.dev>', to: [address], subject, html }),
      });
      const detail = res.ok ? '' : await res.text();
      if (!res.ok) console.error('support email failed', address, res.status, detail);
      return { address, sent: res.ok, status: res.status, detail };
    }),
  );
  return Response.json({ sent: results.some((r) => r.sent), results }, { headers: cors });
});
});
