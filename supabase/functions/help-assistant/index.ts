// The Help panel's assistant: matches a staff member's question to one of the
// app's walkthroughs and answers in a sentence or two.
//
// It only chooses from the walkthroughs the app sends; it never takes an
// action in the app. Runs only when ANTHROPIC_API_KEY is set, under the same
// HIPAA BAA as clinical-note-wording. A question may name a client, so nothing
// is logged here.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MODEL = 'claude-opus-5-5';

const SYSTEM = `You are the Help assistant inside Clinical Notes, a case management app for a New Jersey housing program.

Staff ask how to do something in the app. You receive their question and the list of walkthroughs the app can show on screen, each with its steps.

Choose the one walkthrough that does what they asked, and answer in one or two short sentences that say what it does. If none fits, set walkthrough to "none" and say briefly that you can't show that one yet and that Contact support can help.

Rules:
- Use plain, standard words. No headings, lists or markdown.
- Only describe steps that appear in the walkthrough you chose. Do not invent buttons, pages or features.
- Never give clinical, legal or billing advice.`;

interface Task {
  id: string;
  title: string;
  steps: string[];
}

interface Body {
  probe?: boolean;
  question?: string;
  tasks?: Task[];
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

  const question = (body.question ?? '').trim().slice(0, 1000);
  const tasks = (body.tasks ?? []).filter((t) => t && typeof t.id === 'string').slice(0, 100);
  if (!question || !tasks.length) {
    return Response.json({ available: true, answer: null, reason: 'Nothing to answer' }, { status: 400, headers: cors });
  }

  const list = tasks
    .map((t) => `- ${t.id}: ${t.title}\n${t.steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`)
    .join('\n');
  const ids = [...tasks.map((t) => t.id), 'none'];

  try {
    const client = new Anthropic({ apiKey: key });
    // Structured output keeps the reply to one of the walkthrough ids. Server-side
    // fallback retries a declined request on the model Anthropic recommends.
    // Typed loosely because the "default" fallback form is newer than some SDK types.
    const response = (await client.beta.messages.create({
      model: MODEL,
      max_tokens: 1000,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              walkthrough: { type: 'string', enum: ids },
              answer: { type: 'string' },
            },
            required: ['walkthrough', 'answer'],
            additionalProperties: false,
          },
        },
      },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `Walkthroughs:\n${list}\n\nQuestion: ${question}` }],
    } as unknown as Parameters<typeof client.beta.messages.create>[0])) as Anthropic.Beta.BetaMessage;

    if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
      return Response.json({ available: true, answer: null, reason: 'No answer' }, { headers: cors });
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    let parsed: { walkthrough?: string; answer?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ available: true, answer: null, reason: 'Unreadable answer' }, { headers: cors });
    }
    const id = parsed.walkthrough && parsed.walkthrough !== 'none' && ids.includes(parsed.walkthrough) ? parsed.walkthrough : null;
    return Response.json({ available: true, walkthrough: id, answer: String(parsed.answer ?? '').trim() }, { headers: cors });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ available: false, reason: 'The API key was not accepted' }, { headers: cors });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ available: true, answer: null, reason: 'Busy, try again' }, { headers: cors });
    }
    if (err instanceof Anthropic.APIError) {
      return Response.json({ available: true, answer: null, reason: `Claude returned ${err.status}` }, { headers: cors });
    }
    return Response.json({ available: true, answer: null, reason: 'Something went wrong' }, { headers: cors });
  }
});
