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
    contents: `export * from './src/lib/clinicalNotes/generate'; export * from './src/lib/clinicalNotes/config';`,
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
  assert.match(note, /^CM met with the consumer in person for a housing stability check-in and recertification\./);
  assert.match(note, /Rent is current\./);
  assert.match(note, /No (landlord concerns|concerns regarding the landlord) were identified\./);
  assert.match(note, /Income documentation is needed for the recertification\./);
  assert.match(note, /CM reviewed documents and next steps\./);
  assert.match(note, /Consumer agreed with the plan\./);
  assert.match(note, /CM will follow up at the next scheduled contact\./);
  assert.match(note, /Consumer (will|is to) gather the required documents at the next scheduled contact\./);
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
  assert.equal(note, 'CM contacted the consumer by phone regarding benefits. SNAP benefits were interrupted.');
});

test('legal concerns are reported, never concluded', () => {
  const d = emptyDraft();
  d.topics = ['legal'];
  d.items = { legal: [{ id: 'discrimination_concern', answers: { actions: ['Provided legal resource'] } }] };
  const note = generateNote(d, { method: 'in_person' }, 0);
  assert.match(note, /Consumer reported concerns regarding possible discrimination\./);
  assert.match(note, /CM provided a legal resource\./);
});

test('an unfinished item is not written', () => {
  const d = emptyDraft();
  d.topics = ['application'];
  d.items = { application: [{ id: 'documents', answers: { type: 'Income' } }] };
  assert.equal(canGenerate(d), false);
  assert.equal(generateNote(d, { method: 'phone' }, 0), 'CM contacted the consumer by phone regarding the housing application.');
});

test('typed detail is tidied, not rewritten', () => {
  const d = checkIn();
  d.freeText = '  consumer mentioned a new roommate  ';
  assert.match(generateNote(d, { method: 'in_person' }, 0), / Consumer mentioned a new roommate\. /);
});

test('the summary is short lines, not prose', () => {
  const s = summarize(checkIn());
  assert.deepEqual(s[0], { heading: 'General check-in (primary)', lines: ['Rent: Current', 'Landlord: No concerns'] });
  assert.deepEqual(s[1].lines, ['Deadline: Upcoming', 'Documents: Income → Needed']);
});

test('the opening says CM contacted or met with the consumer', () => {
  const d = emptyDraft();
  d.topics = ['landlord'];
  for (const [method, start] of [
    ['phone', 'CM contacted the consumer by phone'],
    ['text', 'CM contacted the consumer by text'],
    ['email', 'CM contacted the consumer by email'],
    ['in_person', 'CM met with the consumer in person'],
    ['other', 'CM contacted the consumer'],
  ]) {
    assert.ok(generateNote(d, { method }, 0).startsWith(start), method);
  }
});

test('a third party next step names who it is', () => {
  const d = emptyDraft();
  d.topics = ['application'];
  d.items = { application: [{ id: 'status', answers: { v: 'Pending' } }] };
  d.next = { who: 'Third party', cm: [], consumer: [], third: ['Make a decision'], thirdWho: 'Parent or guardian', other: '' };
  assert.match(generateNote(d, { method: 'phone' }, 0), /(Next step is pending|Awaiting) a decision from the consumer's parent or guardian\./);
});

test('apartment issues and specific needs read plainly', () => {
  const d = emptyDraft();
  d.topics = ['checkin', 'basic_needs'];
  d.items = {
    checkin: [
      { id: 'unit', answers: { concern: 'Heat, water, or power', status: 'New' } },
      { id: 'food', answers: { v: 'Running low' } },
    ],
    basic_needs: [{ id: 'transportation', answers: { kind: 'Medical appointment', v: 'Referral made' } }],
  };
  const note = generateNote(d, { method: 'in_person' }, 0);
  assert.match(note, /A new apartment heat, water or power issue was (identified|noted)\./);
  assert.match(note, /(Consumer is running low on food|Food is running low)\./);
  assert.match(note, /referral (was made for|for) transportation to a medical appointment/);
});

test('every choice in every topic writes a sentence', () => {
  for (const topic of mod.TOPICS) {
    for (const item of topic.items) {
      const qs = item.questions.filter((q) => !q.optional && !q.text);
      // Try each option of each required question, with the first option elsewhere.
      const combos = qs.length ? qs.flatMap((q) => q.options.map((o) => ({ ...Object.fromEntries(qs.map((x) => [x.key, x.options[0]])), [q.key]: o }))) : [{}];
      for (const answers of combos) {
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
  d.next = { who: 'Both', cm: ['Contact landlord or property'], consumer: ['Make payment'], third: [], other: '', timing: 'On a specific date', date: '2026-10-15' };
  const note = generateNote(d, { method: 'phone' });
  assert.match(note, /CM (will|plans to) contact the landlord or property by October 15, 2026\./);
  assert.match(note, /Consumer (will|is to) make a payment by October 15, 2026\./);
  d.next = { who: 'None', cm: [], consumer: [], third: [], other: '' };
  assert.match(generateNote(d, { method: 'phone' }), /No (further action|next step) is needed at this time\.$/);
  assert.equal(summarize(d).at(-1).lines[0], 'No next step');
});
