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
    contents: `export * from './src/lib/clinicalNotes/generate'; export * from './src/lib/clinicalNotes/config'; export * from './src/lib/clinicalNotes/backlog'; export * as tree from './src/lib/clinicalNotes/tree';`,
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true, write: false, platform: 'node', format: 'esm',
  alias: { '@': `${process.cwd()}/src` },
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const { generateNote, summarize, canGenerate } = mod;
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

test('"visit" only when in person', () => {
  assert.equal(mod.contactWord('in_person'), 'visit');
  for (const m of ['phone', 'text', 'email', 'virtual', 'other', null]) assert.equal(mod.contactWord(m), 'contact');
});

const T = mod.tree;
const draft = () => mod.emptyDraft();

/** Picks and answers that make a question asked: its first trigger item, its gating answer. */
function setupFor(c, q) {
  const t = T.emptyTree();
  t.categories = [c.id];
  const item = q.items?.[0] ?? q.when?.[0] ?? c.items[0].id;
  t.picks[c.id] = [item];
  if (q.whenAnswer) t.answers[T.answerKey(c.id, q.whenAnswer.q)] = q.whenAnswer.is;
  if (q.perAnswerOf) t.answers[T.answerKey(c.id, q.perAnswerOf)] = ['Photo ID'];
  return { t, per: q.perItem ? item : q.perAnswerOf ? 'Photo ID' : undefined };
}

test('a category alone writes nothing', () => {
  const d = draft();
  d.tree.categories = ['housing_assistance', 'lease_tenancy'];
  assert.equal(canGenerate(d), false);
  assert.equal(generateNote(d, { method: 'phone' }), 'CM contacted the member by phone.');
});

test('every item and every answer writes its own definite sentence', () => {
  for (const c of T.CATEGORIES) {
    for (const item of c.items) {
      const t = T.emptyTree();
      t.categories = [c.id];
      t.picks[c.id] = [item.id];
      const out = T.categorySentences(t, c.id);
      if (item.say) assert.ok(out.includes(item.say), `${c.id}/${item.id}`);
    }
    for (const q of c.questions) {
      const answers = q.says ? Object.keys(q.says) : Object.keys(q.phrases ?? {});
      for (const a of answers) {
        const { t, per } = setupFor(c, q);
        t.answers[T.answerKey(c.id, q.id, per)] = q.multi ? [a] : a;
        const text = T.categorySentences(t, c.id).join(' ');
        const expect = q.says?.[a] ?? (q.phrases?.[a] && q.sentence ? q.sentence(q.phrases[a], 1) : '');
        if (expect && !expect.includes('{')) assert.ok(text.includes(expect), `${c.id}/${q.id}/${a}: ${text}`);
        assert.doesNotMatch(text, /\{x\}|\{X\}|undefined/, `${c.id}/${q.id}/${a}`);
        assert.doesNotMatch(text, /\bor\b/, `${c.id}/${q.id}/${a}`);
      }
    }
  }
});

test('no choice anywhere says "or"', () => {
  const labels = [
    ...T.CATEGORIES.flatMap((c) => [c.label, ...c.items.map((i) => i.label), ...c.questions.flatMap((q) => Object.keys(q.says ?? q.phrases ?? {}))]),
    ...Object.keys(T.GOALS), ...Object.keys(T.PROMPTS), ...Object.keys(T.HOUSING), ...Object.keys(T.HOUSING_CHANGE),
    ...Object.keys(T.RESULT), ...Object.keys(T.UNABLE_BECAUSE), ...Object.keys(T.RESPONSE), ...Object.keys(T.BARRIER),
    ...Object.keys(T.OWNER), ...Object.values(T.OWNER_ACTIONS).flatMap(Object.keys), ...Object.keys(T.STEP_TIMING), ...Object.keys(T.NEXT_CONTACT),
  ];
  for (const l of labels) assert.doesNotMatch(l, /\bor\b/, l);
});

test('a whole note, in order, from buttons only', () => {
  const d = draft();
  d.tree.categories = ['housing_assistance', 'care_coordination'];
  d.tree.picks = { housing_assistance: ['app_assist', 'app_submit'], care_coordination: ['mco'] };
  d.tree.answers = {
    'housing_assistance.app_status': 'Submitted',
    'care_coordination.purpose.mco': 'Referral',
    'care_coordination.outcome.mco': 'No response',
  };
  d.prompts = ['Application update'];
  d.goals = ['Apply for housing'];
  d.housing = { status: 'Staying with family', changed: 'No change', change: '' };
  d.actions = [{ group: 'contacted', options: ['MCO'] }];
  d.result = { value: 'Pending third-party response' };
  d.response = ['Agreed with the plan'];
  d.barriers = { list: ['Waiting for a third party'], other: '', impact: '' };
  d.steps = [{ who: 'CM', actions: ['Follow up on application'], other: '', timing: 'Within 1 week', goal: '' }];
  d.nextContact = { kind: 'Within 1 week' };
  const note = generateNote(d, { method: 'in_person' });
  assert.equal(
    note,
    "CM met with the member in person. The contact was prompted by an application update. This contact supported the member's goal to apply for housing. " +
      "The member is staying with family. The member's housing status has not changed since the last contact. " +
      'CM assisted the member with a housing application. CM submitted a housing application. The housing application has been submitted. ' +
      "CM contacted the member's MCO regarding a referral. No response has been received from the member's MCO. " +
      "CM contacted the member's MCO. The outcome is pending a third-party response. The member agreed with the plan. " +
      'Barriers identified: waiting for a third party. CM will follow up on the application within one week. Next contact is planned within one week.',
  );
  // "Contacted", never "coordinated", when there was no response.
  assert.doesNotMatch(note, /coordinat/);
});

test('unable to complete names why; barrier "none" answers stand alone', () => {
  const d = draft();
  d.tree.categories = ['other_service'];
  d.tree.picks = { other_service: ['followup'] };
  d.result = { value: 'Unable to complete', reason: 'Member unavailable' };
  d.barriers = { list: ['No barrier identified'], other: '', impact: '' };
  const note = generateNote(d, { method: 'phone' });
  assert.match(note, /The activity could not be completed because the member was unavailable\./);
  assert.match(note, /No barriers were identified\./);
});

test('"Service not listed" writes nothing', () => {
  const d = draft();
  d.tree.categories = ['other_service'];
  d.tree.picks = { other_service: [T.NOT_LISTED] };
  assert.equal(canGenerate(d), false);
});

test('answers per document, per need, per situation', () => {
  const d = draft();
  d.tree.categories = ['benefits_docs', 'basic_needs', 'crisis_support'];
  d.tree.picks = { benefits_docs: ['docs_gather'], basic_needs: ['transportation'], crisis_support: ['eviction_notice'] };
  d.tree.answers = {
    'benefits_docs.doc_types': ['Photo ID', 'Bank statement'],
    'benefits_docs.doc_status.Photo ID': 'Gathered',
    'benefits_docs.doc_status.Bank statement': 'Missing',
    'basic_needs.need_action.transportation': ['Provided a resource'],
    'basic_needs.transport_for.transportation': 'Medical appointment',
    'basic_needs.transport_help.transportation': ['Bus pass'],
    'crisis_support.crisis_status.eviction_notice': 'Ongoing',
    'crisis_support.crisis_support_needed.eviction_notice': 'Temporary plan in place',
  };
  const note = generateNote(d, { method: 'phone' });
  assert.match(note, /Photo ID has been gathered\. The bank statement is missing\./);
  assert.match(note, /CM provided a resource for transportation\. Transportation was needed for a medical appointment\. A bus pass was needed\./);
  assert.match(note, /CM addressed an eviction notice\. The eviction notice is ongoing\. A temporary plan is in place\./);
  assert.equal(T.categoryComplete(d.tree, 'benefits_docs'), true);
});

/** A full contact over two categories, for the checks below. */
function fullNote() {
  const d = draft();
  d.tree.categories = ['housing_assistance', 'care_coordination'];
  d.tree.picks = { housing_assistance: ['app_assist'], care_coordination: ['mco'] };
  d.tree.answers = { 'care_coordination.purpose.mco': 'Referral' };
  d.activities = [...d.tree.categories];
  d.prompts = ['Application update'];
  d.goals = ['Apply for housing'];
  d.housing = { status: 'Staying with family', changed: 'No change' };
  d.actions = [{ group: 'reviewed', options: ['Application'] }];
  d.result = { value: 'Completed' };
  d.response = ['Agreed with the plan'];
  d.barriers = { list: ['Waiting for a third party'] };
  d.steps = [{ who: 'CM', actions: ['Follow up on application'], timing: 'Within 1 week' }];
  d.nextContact = { kind: 'Within 1 week' };
  return d;
}

test('rewording changes the phrasing, never the facts', () => {
  const d = fullNote();
  const a = generateNote(d, { method: 'phone' }, 0);
  const b = generateNote(d, { method: 'phone' }, 1);
  assert.notEqual(a, b);
  for (const fact of ['housing application', "member's MCO regarding a referral", 'the application', 'staying with family', 'waiting for a third party', 'within one week'])
    for (const note of [a, b]) assert.ok(note.includes(fact), `${fact}: ${note}`);
});

test('notes say "the member", never consumer or client', () => {
  const note = generateNote(fullNote(), { method: 'in_person' });
  assert.match(note, /the member/);
  assert.doesNotMatch(note, /consumer|client/i);
});

test('what CM did names one thing per choice', () => {
  for (const a of mod.ACTIONS) for (const l of [a.label, ...Object.keys(a.options)]) assert.doesNotMatch(l, /\bor\b/, l);
});

test('several categories: one answer for all, or a different one for each', () => {
  const d = fullNote();
  let note = generateNote(d, { method: 'phone' });
  assert.doesNotMatch(note, /Regarding/);
  d.split = { actions: true, result: true };
  d.byActivity = {
    housing_assistance: { ...mod.emptyPart(), actions: [{ group: 'submitted', options: ['Application'] }], result: { value: 'Completed' } },
    care_coordination: { ...mod.emptyPart(), actions: [{ group: 'contacted', options: ['MCO'] }], result: { value: 'Pending third-party response' } },
  };
  note = generateNote(d, { method: 'phone' });
  assert.match(note, /Regarding housing assistance, CM (submitted|completed submission of) the application\./);
  assert.match(note, /Regarding care coordination, CM (contacted|reached out to) the member's MCO\. The outcome is pending a third-party response\./);
  // The shared answer is not also written.
  assert.doesNotMatch(note, /went over the application|reviewed the application/);
  const s = summarize(d).map((x) => x.heading);
  assert.ok(s.includes('CM actions: Housing assistance') && s.includes('Result: Care coordination'), s.join(' | '));
});

test('notes from older builders start over in the builder', () => {
  const old = { topics: ['checkin'], items: {}, actions: [], response: [], next: null, freeText: 'Typed' };
  const d = mod.normalizeDraft(old);
  assert.equal(d.v, 3);
  assert.deepEqual(d.tree.categories, []);
  assert.equal(canGenerate(old), false);
});
