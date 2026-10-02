// Clinical notes are written only from what the case manager selected.
//
// The note must never add facts: no assumed mood or cooperation, no assumed
// result, no names that were not entered. Rewording ("Regenerate wording")
// may change phrasing but never the facts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `export * from './src/lib/clinicalNotes/generate'; export * from './src/lib/clinicalNotes/config'; export * from './src/lib/clinicalNotes/backlog';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  alias: { '@': `${process.cwd()}/src` },
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { generateNote, emptyDraft, summarize, canGenerate } = mod;

/** A check-in about rent and recertification, close to the example in the brief. */
function checkIn() {
  const d = emptyDraft();
  d.topics = ['checkin', 'recertification'];
  d.items = {
    checkin: [
      { id: 'rent', answers: { v: 'Current' } },
      { id: 'landlord', answers: { v: 'No concerns' } },
    ],
    recertification: [
      { id: 'deadline', answers: { v: 'Upcoming' } },
      { id: 'documents', answers: { type: 'Income', status: 'Needed' } },
    ],
  };
  d.actions = [{ group: 'reviewed', options: ['Documents', 'Next steps'] }];
  d.response = ['Agreed with plan'];
  d.next = { who: 'Both', cm: ['Follow up'], consumer: ['Gather documents'], third: [], other: '', timing: 'At the next scheduled contact' };
  return d;
}

test('writes the contact in order: purpose, update, action, response, next step', () => {
  const note = generateNote(checkIn(), { method: 'in_person' }, 0);
  assert.match(note, /^CM met with the member in person for a housing stability check-in and recertification\./);
  assert.match(note, /Rent is current\./);
  assert.match(note, /No (landlord concerns|concerns regarding the landlord) were identified\./);
  assert.match(note, /Income documentation is needed for the recertification\./);
  assert.match(note, /CM reviewed documents and next steps\./);
  assert.match(note, /The member agreed with the plan\./);
  assert.match(note, /CM will follow up at the next scheduled contact\./);
  assert.match(note, /The member (will|is to) gather the required documents at the next scheduled contact\./);
});

test('adds nothing that was not selected', () => {
  for (let v = 0; v < 6; v++) {
    // "next scheduled contact" was selected as the timing, so it may appear.
    const note = generateNote(checkIn(), { method: 'phone' }, v).replace(/next scheduled contact/g, '');
    for (const word of ['cooperative', 'understood', 'mood', 'anxious', 'depressed', 'noncompliant', 'successfully', 'scheduled', 'resolved']) {
      assert.ok(!note.toLowerCase().includes(word), `variant ${v} added "${word}": ${note}`);
    }
  }
});

test('rewording keeps every fact', () => {
  const facts = [/rent/i, /landlord/i, /income/i, /recertification deadline/i, /agreed/i, /next scheduled contact/i, /phone/i];
  const notes = new Set();
  for (let v = 0; v < 4; v++) {
    const note = generateNote(checkIn(), { method: 'phone' }, v);
    notes.add(note);
    for (const f of facts) assert.match(note, f, `variant ${v} lost ${f}: ${note}`);
  }
  assert.ok(notes.size > 1, 'rewording should change the wording');
});

test('leaves out sections with nothing selected', () => {
  const d = emptyDraft();
  d.topics = ['benefits'];
  d.topicContext = { benefits: { type: 'SNAP' } };
  d.items = { benefits: [{ id: 'change', answers: { v: 'Interrupted' } }] };
  const note = generateNote(d, { method: 'phone' }, 0);
  assert.equal(note, 'CM contacted the member by phone regarding benefits. SNAP benefits were interrupted.');
});

test('legal concerns are reported, never concluded', () => {
  const d = emptyDraft();
  d.topics = ['legal'];
  d.items = { legal: [{ id: 'discrimination_concern', answers: { actions: ['Provided legal resource'] } }] };
  const note = generateNote(d, { method: 'in_person' }, 0);
  assert.match(note, /The member reported concerns regarding possible discrimination\./);
  assert.match(note, /CM provided a legal resource\./);
});

test('an unfinished item is not written', () => {
  const d = emptyDraft();
  d.topics = ['application'];
  d.items = { application: [{ id: 'documents', answers: { type: 'Income' } }] };
  assert.equal(canGenerate(d), false);
  assert.equal(generateNote(d, { method: 'phone' }, 0), 'CM contacted the member by phone regarding the housing application.');
});

test('typed detail is tidied, not rewritten', () => {
  const d = checkIn();
  d.freeText = '  client mentioned a new roommate  ';
  assert.match(generateNote(d, { method: 'in_person' }, 0), / Client mentioned a new roommate\. /);
});

test('the summary is short lines, not prose', () => {
  const s = summarize(checkIn());
  assert.deepEqual(s[0], { heading: 'General check-in (primary)', lines: ['Rent: Current', 'Landlord: No concerns'] });
  assert.deepEqual(s[1].lines, ['Deadline: Upcoming', 'Documents: Income → Needed']);
});

test('the opening says CM contacted or met with the member', () => {
  const d = emptyDraft();
  d.topics = ['landlord'];
  for (const [method, start] of [
    ['phone', 'CM contacted the member by phone'],
    ['text', 'CM contacted the member by text'],
    ['email', 'CM contacted the member by email'],
    ['in_person', 'CM met with the member in person'],
    ['other', 'CM contacted the member'],
  ]) {
    assert.ok(generateNote(d, { method }, 0).startsWith(start), method);
  }
});

test('a third party next step names who it is', () => {
  const d = emptyDraft();
  d.topics = ['application'];
  d.items = { application: [{ id: 'status', answers: { v: 'Pending' } }] };
  d.next = { who: ['Third party'], cm: [], consumer: [], third: ['Make a decision'], thirdWho: 'Guardian', other: '' };
  assert.match(generateNote(d, { method: 'phone' }, 0), /(Next step is pending|Awaiting) a decision from the member's guardian\./);
});

test('apartment issues and specific needs read plainly', () => {
  const d = emptyDraft();
  d.topics = ['checkin', 'basic_needs'];
  d.items = {
    checkin: [
      { id: 'unit', answers: { concern: 'Heat', status: 'New' } },
      { id: 'food', answers: { v: 'Running low' } },
    ],
    basic_needs: [{ id: 'transportation', answers: { kind: 'Medical appointment', v: 'Referral made' } }],
  };
  const note = generateNote(d, { method: 'in_person' }, 0);
  assert.match(note, /A new apartment heat issue was (identified|noted)\./);
  assert.match(note, /(The member is running low on food|Food is running low)\./);
  assert.match(note, /referral (was made for|for) transportation to a medical appointment/);
});

test('every choice in every topic writes a sentence', () => {
  for (const topic of mod.TOPICS) {
    for (const item of topic.items) {
      const qs = item.questions.filter((q) => !q.optional && !q.text);
      const val = (q, o) => (q.multi ? [o] : o);
      // Try each option of each required question, with the first option elsewhere.
      const combos = qs.length ? qs.flatMap((q) => q.options.map((o) => ({ ...Object.fromEntries(qs.map((x) => [x.key, val(x, x.options[0])])), [q.key]: val(q, o) }))) : [{}];
      for (const answers of combos) {
        // A typed answer ("Please specify", "What concern …") wherever one is asked.
        for (const q of item.questions) if (q.text && (!q.showIf || q.showIf(answers))) answers[q.key] = 'sample detail';
        const d = emptyDraft();
        d.topics = [topic.id];
        d.items = { [topic.id]: [{ id: item.id, answers }] };
        const note = generateNote(d, { method: 'phone' });
        const opening = generateNote({ ...emptyDraft(), topics: [topic.id] }, { method: 'phone' });
        assert.ok(note.length > opening.length, `${topic.id}/${item.id} ${JSON.stringify(answers)} wrote nothing`);
        assert.doesNotMatch(note, /undefined|null|\s\./, `${topic.id}/${item.id}`);
      }
    }
  }
});

test('a choice with no follow-up question is complete when picked', () => {
  const d = emptyDraft();
  d.topics = ['supportive_housing'];
  d.items = { supportive_housing: [{ id: 'option', answers: {} }] };
  assert.match(generateNote(d, { method: 'phone' }), /Supportive housing was discussed as an option\./);
  assert.deepEqual(summarize(d)[0].lines, ['Discussed option']);
});

test('next steps: both parties, no next step, and a specific date', () => {
  const d = emptyDraft();
  d.topics = ['landlord'];
  d.items = { landlord: [{ id: 'rent', answers: { v: 'Late' } }] };
  d.next = { who: ['CM', 'Consumer'], cm: ['Contact landlord'], consumer: ['Make payment'], third: [], other: '', timing: 'On a specific date', date: '2026-10-15' };
  const note = generateNote(d, { method: 'phone' });
  assert.match(note, /CM (will|plans to) contact the landlord by October 15, 2026\./);
  assert.match(note, /The member (will|is to) make a payment by October 15, 2026\./);
  d.next = { who: ['None'], cm: [], consumer: [], third: [], other: '' };
  assert.match(generateNote(d, { method: 'phone' }), /No (further action|next step) is needed at this time\.$/);
  assert.equal(summarize(d).at(-1).lines[0], 'No next step');
});

test('backlog: one 30-day cycle per row, five for 150 days, six with the extension', () => {
  const five = mod.backlogCycles('2026-01-01', false);
  assert.equal(five.length, 5);
  assert.deepEqual(five[0], { n: 1, start: '2026-01-01', end: '2026-01-30' });
  assert.deepEqual(five[1], { n: 2, start: '2026-01-31', end: '2026-03-01' });
  assert.equal(five[4].end, '2026-05-30');
  const six = mod.backlogCycles('2026-01-01', true);
  assert.equal(six.length, 6);
  assert.deepEqual(six[5], { n: 6, start: '2026-05-31', end: '2026-06-29' });
  assert.deepEqual(mod.backlogCycles('', false), []);
});

test('next step: several can be responsible, and older "Both" drafts still read', () => {
  const d = emptyDraft();
  d.topics = ['landlord'];
  d.items = { landlord: [{ id: 'rent', answers: { v: 'Late' } }] };
  d.next = { who: ['CM', 'Third party'], cm: ['Follow up'], consumer: [], third: ['Respond'], thirdWho: 'Landlord', other: '' };
  const note = generateNote(d, { method: 'phone' });
  assert.match(note, /CM (will|plans to) follow up\./);
  assert.match(note, /(Next step is pending|Awaiting) a response from the landlord\./);
  assert.equal(summarize(d).at(-1).lines[0], 'CM, Third party · Landlord, Follow up, Respond');
  // Saved before several could be picked: "Both" is CM and the member.
  d.next = { who: 'Both', cm: ['Follow up'], consumer: ['Make payment'], third: [], other: '' };
  const old = generateNote(d, { method: 'phone' });
  assert.match(old, /CM (will|plans to) follow up\./);
  assert.match(old, /The member (will|is to) make a payment\./);
});

test('notes say client, never consumer', () => {
  for (const topic of mod.TOPICS) {
    const d = emptyDraft();
    d.topics = [topic.id];
    d.items = { [topic.id]: topic.items.map((it) => ({ id: it.id, answers: Object.fromEntries(it.questions.map((q) => [q.key, q.multi ? [q.options[0]] : q.options[0]])) })) };
    d.response = ['Agreed with plan'];
    d.next = { who: ['Consumer'], cm: [], consumer: ['Gather documents'], third: [], other: '' };
    assert.doesNotMatch(generateNote(d, { method: 'phone' }), /consumer/i, topic.id);
  }
});

test('choices and notes never offer "or"', () => {
  const lists = [mod.NEXT_CM, mod.NEXT_CONSUMER, mod.THIRD_PARTIES, mod.BARRIERS, mod.RESPONSES];
  const labels = lists.flatMap((l) => Object.keys(l));
  for (const t of mod.TOPICS) {
    labels.push(...t.items.map((i) => i.label));
    for (const it of t.items) for (const q of it.questions) labels.push(...q.options);
  }
  for (const a of mod.ACTIONS) labels.push(...Object.keys(a.options));
  for (const l of labels) assert.doesNotMatch(l, /\bor\b/, l);
  // Every choice in every topic, written out, has no "or" either.
  for (const t of mod.TOPICS) for (const it of t.items) for (const q of it.questions) for (const o of q.options) {
    const d = emptyDraft();
    d.topics = [t.id];
    const answers = Object.fromEntries(it.questions.map((x) => [x.key, x.multi ? [x.options[0]] : x.options[0]]));
    answers[q.key] = q.multi ? [o] : o;
    d.items = { [t.id]: [{ id: it.id, answers }] };
    assert.doesNotMatch(generateNote(d, { method: 'phone' }), /\bor\b/, `${t.id}/${it.id}/${o}`);
  }
});

test('activities open the contact; reason, goal, housing status follow', () => {
  const d = emptyDraft();
  d.activities = ['lease_review', 'benefits'];
  d.reason = 'lease renewal notice arrived';
  d.goal = 'keep the current apartment';
  d.housing = { status: 'At risk of losing housing', changed: 'Yes', change: 'received a lease renewal notice' };
  mod.syncSections(d);
  assert.deepEqual(d.topics, ['landlord', 'benefits']);
  // Lease review opens only the lease questions of Landlord.
  assert.deepEqual(mod.allowedItems(d, 'landlord'), ['lease']);
  const note = generateNote(d, { method: 'phone' });
  assert.match(note, /^CM (contacted|spoke with) the member by phone regarding a lease review and benefits assistance\. Reason for contact: Lease renewal notice arrived\. Housing goal: Keep the current apartment\./);
  assert.match(note, /The member is (currently )?at risk of losing housing\. The member's housing situation has changed since the last contact\. Change reported: Received a lease renewal notice\./);
});

test('coordination-only contacts say CM completed the coordination', () => {
  const d = emptyDraft();
  d.activities = ['mco'];
  assert.equal(generateNote(d, { method: 'phone' }), 'CM completed MCO coordination for the member by phone.');
});

test('Other activity uses the typed text, and nothing is written without it', () => {
  const d = emptyDraft();
  d.activities = ['other'];
  assert.equal(canGenerate(d), false);
  d.activityOther = 'a utility payment arrangement';
  assert.match(generateNote(d, { method: 'in_person' }), /regarding a utility payment arrangement\./);
});

test('barriers are their own step, separate from the result', () => {
  const d = emptyDraft();
  d.activities = ['housing_search'];
  d.result = { value: 'Progress made' };
  d.barriers = { answer: 'Yes', list: ['Financial barrier', 'Other barrier'], other: 'no credit history', impact: 'units require a credit check' };
  const note = generateNote(d, { method: 'phone' });
  assert.match(note, /Progress was made/);
  assert.match(note, /(Barriers affecting the housing goal:|The housing goal was affected by) a financial barrier and no credit history\. Impact on the housing goal: Units require a credit check\./);
  d.barriers = { answer: 'Not assessed', list: [], other: '', impact: '' };
  assert.match(generateNote(d, { method: 'phone' }), /Barriers were not assessed\./);
  d.barriers = { list: [], other: '', impact: '' };
  assert.doesNotMatch(generateNote(d, { method: 'phone' }), /arrier/);
});

test('each next step has its own person, action and time', () => {
  const d = emptyDraft();
  d.activities = ['application'];
  d.goal = 'move into a unit';
  d.steps = [
    { who: 'CM', actions: ['Check application'], other: '', timing: 'In 1 week', goal: 'move into a unit' },
    { who: 'Member', actions: ['Submit documents'], other: '', timing: 'In 2–3 days', goal: 'keep income current' },
  ];
  d.nextContact = { kind: 'Specific date', date: '2026-11-03' };
  const note = generateNote(d, { method: 'phone' });
  assert.match(note, /CM (will|plans to) check on the application within one week\./);
  assert.match(note, /The member (will|is to) submit documents within 2–3 days\. This step supports the housing goal: Keep income current\./);
  // The step's goal is not repeated when it is the contact's goal.
  assert.equal(note.match(/This step supports/g).length, 1);
  assert.match(note, /Next contact is planned for November 3, 2026\.$/);
  d.steps = [];
  d.noNextStep = true;
  d.nextContact = { kind: 'Not yet scheduled' };
  assert.match(generateNote(d, { method: 'phone' }), /No next step was identified( at this time)?\. Next contact is not yet scheduled\.$/);
});

test('new detail sections write one claim per choice', () => {
  const d = emptyDraft();
  d.activities = ['home_safety', 'tenant_rights'];
  mod.syncSections(d);
  d.items = {
    home_safety: [{ id: 'check', answers: { v: ['Completed check', 'Identified a concern'], concern: 'loose stair railing' } }],
    tenant_rights: [{ id: 'topic', answers: { v: ['Lease terms', 'Other topic'], vOther: 'security deposits' } }],
  };
  const note = generateNote(d, { method: 'in_person' });
  assert.match(note, /CM completed a home safety check\.|A home safety check was completed by CM\./);
  assert.match(note, /A home safety concern was identified: loose stair railing\./);
  assert.match(note, /tenant rights education about lease terms and security deposits\./);
  assert.doesNotMatch(note, /legal advice|No home safety concern/);
});

test('"visit" only for a phone call', () => {
  assert.equal(mod.contactWord('phone'), 'visit');
  for (const m of ['in_person', 'text', 'email', 'virtual', 'other', null]) assert.equal(mod.contactWord(m), 'contact');
});

test('new choices name one thing each', () => {
  const labels = [
    ...mod.ACTIVITIES.map((a) => a.label),
    ...Object.keys(mod.BARRIER_LIST),
    ...mod.RESPONSE_CHOICES,
    ...Object.keys(mod.HOUSING_STATUS),
  ];
  for (const l of labels) assert.doesNotMatch(l, /\bor\b/, l);
});
