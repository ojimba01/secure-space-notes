// Faxes one completed form to an MCO, through HumbleFax.
//
// This runs on the server because the fax account's access key and secret are
// HTTP Basic credentials for an outbound channel carrying a member's record.
// Anything in the browser bundle is readable by anyone who opens it, so the
// keys live here and the browser only ever names a form.
//
// It is not a cron job and it is not open. Supabase verifies the caller's JWT
// before this runs (verify_jwt is on in config.toml), and the form is then read
// back through the caller's own token, so row level security decides whether
// this person may act on this form. Only after that does the service role key
// come out, to read the PDF and record what happened.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const API = 'https://api.humblefax.com';

/** Digits only. A number typed as (201) 555-0134 dials the same as 2015550134. */
const digits = (s: string) => s.replace(/\D+/g, '');

/**
 * A US fax number the service will accept.
 *
 * Ten digits, or eleven beginning with the country code. Anything else is a
 * typo, and a typo here faxes a member's record to a stranger.
 */
const normaliseNumber = (raw: string): string | null => {
  const d = digits(raw);
  if (d.length === 10) return `1${d}`;
  if (d.length === 11 && d.startsWith('1')) return d;
  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const accessKey = Deno.env.get('HUMBLEFAX_ACCESS_KEY');
  const secretKey = Deno.env.get('HUMBLEFAX_SECRET_KEY');
  const fromNumber = Deno.env.get('HUMBLEFAX_FROM_NUMBER');
  const fromName = Deno.env.get('HUMBLEFAX_FROM_NAME') ?? 'Supportive Care Management';
  if (!accessKey || !secretKey || !fromNumber) {
    return json(
      { error: 'The fax account is not configured. Set HUMBLEFAX_ACCESS_KEY, HUMBLEFAX_SECRET_KEY and HUMBLEFAX_FROM_NUMBER.' },
      500,
    );
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Sign in first.' }, 401);

  let body: { formId?: string; toNumber?: string; toName?: string; note?: string; saveNumberForMco?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const formId = (body.formId ?? '').trim();
  if (!formId) return json({ error: 'Which form?' }, 400);

  const toNumber = normaliseNumber(body.toNumber ?? '');
  if (!toNumber) {
    return json({ error: 'That fax number is not ten digits. Check it before sending.' }, 400);
  }

  const url = Deno.env.get('SUPABASE_URL')!;

  // Read the form as the person who asked, so row level security answers
  // "may they?" rather than this function guessing at it.
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: caller } = await asCaller.auth.getUser();
  if (!caller?.user) return json({ error: 'Sign in first.' }, 401);

  const { data: form, error: formErr } = await asCaller
    .from('client_forms')
    .select('id, form_type, title, file_path, client_id, external_status, fax_status')
    .eq('id', formId)
    .maybeSingle();
  if (formErr) return json({ error: `Could not read the form: ${formErr.message}` }, 500);
  if (!form) return json({ error: 'That form is not yours to send.' }, 403);
  if (!form.file_path) return json({ error: 'That form has no document to fax.' }, 400);
  if (form.fax_status === 'queued' || form.fax_status === 'sending') {
    return json({ error: 'That form is already on its way.' }, 409);
  }

  // From here on the service role does the work: reading a private file out of
  // storage, and writing columns a case manager cannot write on an approved
  // form. The question of authority was already settled above.
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: file, error: fileErr } = await admin.storage
    .from('client-files')
    .download(form.file_path);
  if (fileErr || !file) {
    return json({ error: `Could not read the document: ${fileErr?.message ?? 'missing'}` }, 500);
  }

  const auth = `Basic ${btoa(`${accessKey}:${secretKey}`)}`;
  const stamp = new Date().toISOString();
  const subject = form.title || form.form_type;

  const fail = async (message: string, status = 502) => {
    await admin
      .from('client_forms')
      .update({ fax_status: 'failed', fax_error: message, fax_to_number: toNumber, fax_requested_at: stamp })
      .eq('id', formId);
    return json({ error: message }, status);
  };

  try {
    // Three calls, in this order: describe the fax, attach the document, send
    // it. The service will not accept an attachment for a fax it has not been
    // told about, and will not send one with nothing attached.
    const createRes = await fetch(`${API}/tmpFax`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toName: body.toName?.trim() || 'Managed Care Organization',
        fromName,
        fromNumber: digits(fromNumber),
        recipients: [toNumber],
        subject,
        message: body.note?.trim() || `${subject} attached.`,
        includeCoversheet: true,
        pageSize: 'Letter',
        resolution: 'Fine',
      }),
    });
    if (!createRes.ok) {
      return await fail(`The fax service refused the request (${createRes.status}). ${await createRes.text()}`.slice(0, 500));
    }
    const created = await createRes.json();
    const tmpFaxId = created?.data?.tmpFax?.id ?? created?.tmpFax?.id ?? created?.id;
    if (!tmpFaxId) return await fail('The fax service did not return a fax to attach the form to.');

    const filename = `${subject.replace(/[^\w\- ]+/g, '').trim() || 'form'}.pdf`;
    const upload = new FormData();
    upload.append('file', new File([await file.arrayBuffer()], filename, { type: 'application/pdf' }));

    const attachRes = await fetch(`${API}/attachment/${tmpFaxId}`, {
      method: 'POST',
      headers: { Authorization: auth },
      body: upload,
    });
    if (!attachRes.ok) {
      return await fail(`The fax service would not take the document (${attachRes.status}). ${await attachRes.text()}`.slice(0, 500));
    }

    const sendRes = await fetch(`${API}/tmpFax/${tmpFaxId}/send`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!sendRes.ok) {
      return await fail(`The fax service would not send it (${sendRes.status}). ${await sendRes.text()}`.slice(0, 500));
    }
    const sent = await sendRes.json();
    const faxId = String(sent?.data?.sentFax?.id ?? sent?.sentFax?.id ?? sent?.id ?? tmpFaxId);

    // Queued, not sent. A fax is sent when the machine at the other end has
    // answered, which the webhook reports minutes later. Marking it sent here
    // would tell a case manager the MCO has it when the line may be busy.
    const { error: updErr } = await admin
      .from('client_forms')
      .update({
        fax_id: faxId,
        fax_status: 'queued',
        fax_to_number: toNumber,
        fax_requested_at: stamp,
        fax_completed_at: null,
        fax_error: null,
      })
      .eq('id', formId);
    if (updErr) {
      // The fax is genuinely on its way; only our record of it failed. Say so
      // rather than implying nothing happened and inviting a second fax.
      return json(
        { ok: true, faxId, warning: `The fax was sent but could not be recorded: ${updErr.message}` },
        200,
      );
    }

    // An administrator can keep the number for next time, so it is typed once.
    if (body.saveNumberForMco) {
      await admin
        .from('mco_fax_numbers')
        .upsert(
          { mco: body.saveNumberForMco, fax_number: toNumber, updated_at: stamp, updated_by: caller.user.id },
          { onConflict: 'mco' },
        );
    }

    return json({ ok: true, faxId, status: 'queued' });
  } catch (e) {
    return await fail(`Could not reach the fax service: ${String(e)}`.slice(0, 500), 502);
  }
});
