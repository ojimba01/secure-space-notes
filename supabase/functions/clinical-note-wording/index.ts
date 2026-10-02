// Rewords a clinical note with Claude, from facts the case manager selected.
//
// The app writes every note itself from the selections (src/lib/clinicalNotes).
// This function only offers smoother wording of that draft. It is told to add
// nothing, and its answer is checked: a version that introduces any name,
// number or date not already in the draft is thrown away, and the app keeps
// its own wording. The case manager reviews and confirms every note either way.
//
// Off until the ANTHROPIC_API_KEY secret is set. Turn it on only under a HIPAA
// Business Associate Agreement with Anthropic: the typed "anything else" text
// can contain client information. No client name or ID is sent; the note says
// "the member".
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-opus-5-5';

const SYSTEM = `You reword case management progress notes for a New Jersey housing program.

You receive a draft note that was written mechanically from facts a case manager selected, plus the list of those facts. Rewrite the draft so it reads as one concise, professional, factual third-person note.

Rules:
- Use only the facts given. Do not add, infer or assume anything: no mood, mental status, cooperation, understanding, motivation, success, or outcome that is not stated.
- Do not add names of people, agencies, landlords, providers, programs or places. Do not add dates, numbers or amounts.
- Keep every fact in the draft. Do not soften, strengthen or merge facts into new claims.
- Refer to the case manager as "CM" and the client as "the member".
- Legal matters stay as the member's reported concerns, never as conclusions. Tenant rights education is never legal advice.
- Keep the order: activities and reason for contact, housing goal, housing status, member update, CM's actions, result, barriers, member response, next steps, next contact. Keep the activities (why contact took place) separate from CM's actions (what CM did). Do not lengthen it.
- No headings, bullets or quotation marks. Reply with the note text only.`;

interface Body {
  probe?: boolean;
  draft?: string;
  facts?: string[];
  previous?: string;
}

/** Capitalized words, numbers and dates in a text, minus sentence starts and our own terms. */
function specifics(text: string): Set<string> {
  const out = new Set<string>();
  const allowed = new Set(['CM', 'Client', 'Member', 'MCO', 'Housing', 'Reason', 'Barriers', 'Impact', 'Change', 'The', 'A', 'An', 'No', 'This', 'There', 'Next', 'Progress', 'Awaiting']);
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const words = sentence.split(/\s+/);
    words.forEach((w, i) => {
      const clean = w.replace(/[^A-Za-z0-9/–-]/g, '');
      if (!clean) return;
      if (/\d/.test(clean)) out.add(clean);
      else if (i > 0 && /^[A-Z]/.test(clean) && !allowed.has(clean)) out.add(clean);
    });
  }
  return out;
}

/** True when the reworded note introduces no name, number or date absent from the source. */
function addsNothing(source: string, reworded: string): boolean {
  const known = specifics(source);
  const lowerSource = source.toLowerCase();
  for (const s of specifics(reworded)) {
    if (!known.has(s) && !lowerSource.includes(s.toLowerCase())) return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Signed-in staff only.
  const asCaller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: who } = await asCaller.auth.getUser();
  if (!who?.user) return Response.json({ available: false, reason: 'Not signed in' }, { status: 401, headers: cors });

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return Response.json({ available: false }, { headers: cors });

  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    // An empty body is answered below.
  }
  if (body.probe) return Response.json({ available: true }, { headers: cors });

  const draft = (body.draft ?? '').trim();
  if (!draft) return Response.json({ available: true, note: null, reason: 'No draft' }, { status: 400, headers: cors });
  const facts = (body.facts ?? []).map((f) => `- ${f}`).join('\n');
  const previous = (body.previous ?? '').trim();

  const user = [
    `Facts selected:\n${facts || '- (see draft)'}`,
    `Draft note:\n${draft}`,
    previous ? `Use different wording from this earlier version, with the same facts:\n${previous}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const client = new Anthropic({ apiKey: key });
    // Server-side fallback: if the model declines, the request is retried on
    // the model Anthropic recommends for that case. Typed loosely because the
    // "default" form is newer than some SDK type definitions.
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: user }],
    } as unknown as Parameters<typeof client.beta.messages.create>[0]) as Anthropic.Beta.BetaMessage;

    if (response.stop_reason === 'refusal') {
      return Response.json({ available: true, note: null, reason: 'Declined' }, { headers: cors });
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    if (!text || response.stop_reason === 'max_tokens') {
      return Response.json({ available: true, note: null, reason: 'Incomplete' }, { headers: cors });
    }
    if (!addsNothing(`${draft}\n${facts}`, text)) {
      return Response.json({ available: true, note: null, reason: 'Added details' }, { headers: cors });
    }
    return Response.json({ available: true, note: text, model: response.model }, { headers: cors });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ available: false, reason: 'The API key was not accepted' }, { headers: cors });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ available: true, note: null, reason: 'Busy, try again' }, { headers: cors });
    }
    if (err instanceof Anthropic.APIError) {
      console.error('clinical-note-wording', err.status, err.message);
      return Response.json({ available: true, note: null, reason: `Error ${err.status}` }, { headers: cors });
    }
    console.error('clinical-note-wording', err);
    return Response.json({ available: true, note: null, reason: 'Unavailable' }, { headers: cors });
  }
});
