// What a case manager can select when building a clinical note.
//
// Every choice is short, and choices that differ only by outcome sit behind
// one parent ("Benefits change" → Interrupted / Restored / …), so nobody reads
// a long list before it is relevant.
//
// Each item also says how its answers read in the note. Those sentences use
// nothing but the answers: no mood, no cooperation, no assumed result, no
// names of agencies or places. Several wordings per fact let "Regenerate
// wording" vary the phrasing without changing what is said.

/** Terms used in notes. Change here if the organization changes them. */
export const TERMS = { cm: 'CM', client: 'member', Client: 'The member' } as const;

export type Answers = Record<string, string | string[] | undefined>;

export interface Question {
  key: string;
  label: string;
  options: string[];
  /** Pick several. */
  multi?: boolean;
  /** Can be left out. */
  optional?: boolean;
  /** A short typed answer instead of choices. */
  text?: boolean;
  /** Asked only when this holds for the answers so far (a "Please specify" after Other, say). */
  showIf?: (a: Answers) => boolean;
}

export interface SayContext {
  /** Topic-level answers, such as the benefit type. */
  topic: Answers;
}

export interface Item {
  id: string;
  label: string;
  questions: Question[];
  /** The note sentence(s) for these answers, in wording variant `v`. */
  say: (a: Answers, v: number, ctx: SayContext) => string[];
}

export interface Topic {
  id: string;
  label: string;
  /** The touchpoint type this topic records as. */
  touchpointType: string;
  /** Completes "CM … regarding ___". */
  purpose: string;
  /** Shown above the item choices, when the items are not plain topics. */
  itemsLabel?: string;
  /** Asked once for the whole topic, before its items (optional). */
  context?: Question;
  items: Item[];
  /** Ask for a few words of free text, which buttons cannot capture well. */
  encourageFreeText?: boolean;
  /** Reached only through a visit activity, never offered as a section of its own. */
  hidden?: boolean;
}

// ---- helpers ------------------------------------------------------------

/** Wording variant `v` of a list. */
export const choose = <T,>(v: number, list: T[]): T => list[((v % list.length) + list.length) % list.length];

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "a, b and c" */
export const joinList = (parts: string[]) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** The typed answer, tidied without changing its words. */
export function tidy(text: string | undefined): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const capped = cap(t);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

const slug = (label: string) => label.toLowerCase().replace(/[^a-z]+/g, '_');

const one = (a: Answers, key: string) => (typeof a[key] === 'string' ? (a[key] as string) : '');
const many = (a: Answers, key: string) => (Array.isArray(a[key]) ? (a[key] as string[]) : []);

/** One question; each option maps straight to its sentence wordings. */
function simple(id: string, label: string, question: string, map: Record<string, string[]>): Item {
  return {
    id,
    label,
    questions: [{ key: 'v', label: question, options: Object.keys(map) }],
    say: (a, v) => {
      const s = map[one(a, 'v')];
      return s ? [choose(v, s)] : [];
    },
  };
}

/** "Other": an optional few words, or a neutral line when left blank. */
function other(fallback: string, question = 'What else did you discuss?'): Item {
  return {
    id: 'other',
    label: 'Other',
    questions: [{ key: 'text', label: question, options: [], text: true, optional: true }],
    say: (a) => [tidy(one(a, 'text')) || fallback],
  };
}

const DOC_TYPES: Record<string, string> = {
  ID: 'identification',
  Income: 'income',
  Benefits: 'benefits',
  Bank: 'bank',
  'Rental history': 'rental history',
  Disability: 'disability',
  Other: 'other required',
};

/** Documents for something: what type, then where they stand. */
function documents(forWhat: string, id = 'documents', label = 'Documents'): Item {
  return {
    id,
    label,
    questions: [
      { key: 'type', label: 'What type of document?', options: Object.keys(DOC_TYPES) },
      { key: 'status', label: 'What is its status?', options: ['Needed', 'Gathered', 'Submitted', 'Missing'] },
    ],
    say: (a, v) => {
      const t = DOC_TYPES[one(a, 'type')];
      if (!t) return [];
      const T = cap(t);
      const s: Record<string, string[]> = {
        Needed: [`${T} documentation is needed for the ${forWhat}.`, `The ${forWhat} requires ${t} documentation.`],
        Gathered: [`${T} documentation has been gathered for the ${forWhat}.`, `${T} documentation for the ${forWhat} was gathered.`],
        Submitted: [`${T} documentation was submitted for the ${forWhat}.`, `${T} documentation for the ${forWhat} has been submitted.`],
        Missing: [`${T} documentation for the ${forWhat} is missing.`, `The ${forWhat} is missing ${t} documentation.`],
      };
      const list = s[one(a, 'status')];
      return list ? [choose(v, list)] : [];
    },
  };
}

/** Contact with a party: who did not respond, and so on. */
function communication(id: string, label: string, party: string): Item {
  return simple(id, label, `What happened with the ${party}?`, {
    Contacted: [`The ${party} was contacted.`, `Contact was made with the ${party}.`],
    'Received response': [`A response was received from the ${party}.`, `The ${party} responded.`],
    'No response': [`No response has been received from the ${party}.`, `The ${party} has not responded.`],
    'Follow-up needed': [`Follow-up with the ${party} is needed.`, `The ${party} requires follow-up.`],
  });
}

const APARTMENT_ISSUES: Record<string, string> = {
  Repairs: 'repair issue',
  Maintenance: 'maintenance issue',
  Heat: 'heat issue',
  Water: 'water issue',
  Power: 'power issue',
  Pests: 'pest issue',
  Safety: 'safety issue',
  Accessibility: 'accessibility issue',
  Other: 'issue',
};

// ---- topics -------------------------------------------------------------

const checkIn: Topic = {
  id: 'checkin',
  label: 'General check-in',
  touchpointType: 'general_checkin',
  purpose: 'a housing stability check-in',
  items: [
    simple('housing', 'Housing', "What is the client's housing status?", {
      Stable: [`${TERMS.Client}'s housing remains stable.`, `${TERMS.Client}'s housing is stable.`],
      Searching: [`${TERMS.Client} is currently searching for housing.`, `${TERMS.Client} is searching for housing.`],
      'Temporary housing': [`${TERMS.Client} is in temporary housing.`, `${TERMS.Client} is currently in temporary housing.`],
      Shelter: [`${TERMS.Client} is staying in shelter.`, `${TERMS.Client} is currently staying in shelter.`],
      'Staying with family': [`${TERMS.Client} is staying with family.`, `${TERMS.Client} is currently staying with family.`],
      'Staying with friends': [`${TERMS.Client} is staying with friends.`, `${TERMS.Client} is currently staying with friends.`],
      'At risk': [`${TERMS.Client}'s housing is at risk.`, `${TERMS.Client}'s current housing is at risk.`],
      Other: ['Housing status was reviewed.', `${TERMS.Client}'s housing status was reviewed.`],
    }),
    simple('rent', 'Rent', 'What is the rent status?', {
      Current: ['Rent is current.', 'Rent remains current.'],
      Late: ['Rent is late.', 'Rent is currently late.'],
      'Balance owed': [`${TERMS.Client} has a rent balance owed.`, 'A rent balance is owed.'],
      'Payment plan': [`${TERMS.Client} is on a rent payment plan.`, 'A rent payment plan is in place.'],
      Other: ['Rent was reviewed.', 'Rent was addressed.'],
    }),
    simple('utilities', 'Utilities', 'What is the utility status?', {
      Current: ['Utilities are current.', 'Utility accounts are current.'],
      'Past due': ['Utilities are past due.', 'A utility balance is past due.'],
      'Shutoff notice': ['A utility shutoff notice was received.', `${TERMS.Client} has a utility shutoff notice.`],
      Disconnected: ['Utilities are disconnected.', 'A utility service is disconnected.'],
      Other: ['Utilities were reviewed.', 'Utilities were addressed.'],
    }),
    simple('landlord', 'Landlord', 'Are there any landlord concerns?', {
      'No concerns': ['No landlord concerns were identified.', 'No concerns regarding the landlord were identified.'],
      'Concern raised': ['A landlord concern was raised.', 'A concern regarding the landlord was raised.'],
      'Contact needed': ['Contact with the landlord is needed.', 'The landlord needs to be contacted.'],
      Other: ['Landlord matters were reviewed.', 'Landlord matters were addressed.'],
    }),
    {
      id: 'unit',
      label: 'Apartment issue',
      questions: [
        { key: 'concern', label: 'What type of apartment issue?', options: Object.keys(APARTMENT_ISSUES) },
        { key: 'status', label: 'What is the status of the issue?', options: ['New', 'Ongoing', 'Improved', 'Resolved', 'Worse'] },
      ],
      say: (a, v) => {
        const issue = APARTMENT_ISSUES[one(a, 'concern')];
        if (!issue) return [];
        const what = `apartment ${issue}`;
        const s: Record<string, string[]> = {
          New: [`A new ${what} was identified.`, `A new ${what} was noted.`],
          Ongoing: [`The ${what} is ongoing.`, `An ${what} remains ongoing.`],
          Improved: [`The ${what} has improved.`, `There has been improvement in the ${what}.`],
          Resolved: [`The ${what} has been resolved.`, `The ${what} is resolved.`],
          Worse: [`The ${what} has worsened.`, `The ${what} has gotten worse.`],
        };
        const list = s[one(a, 'status')];
        return list ? [choose(v, list)] : [];
      },
    },
    simple('benefits', 'Benefits', 'What is the benefits status?', {
      Receiving: [`${TERMS.Client} is receiving benefits.`, `${TERMS.Client}'s benefits are in place.`],
      Stopped: [`${TERMS.Client}'s benefits have stopped.`, `${TERMS.Client}'s benefits were stopped.`],
      'Change pending': [`A change to the ${TERMS.client}'s benefits is pending.`, `A benefits change is pending.`],
      'Needs help applying': [`${TERMS.Client} needs help applying for benefits.`, `Help applying for benefits is needed.`],
    }),
    simple('health', 'Health', 'Are there any health concerns?', {
      'No new concerns': ['No new health concerns were noted.', 'No new health concerns were identified.'],
      'New concern': ['A new health concern was noted.', 'A new health concern was identified.'],
      'Ongoing concern': ['A health concern is ongoing.', 'A health concern remains ongoing.'],
      'Recent hospital stay': [`${TERMS.Client} had a recent hospital stay.`, `${TERMS.Client} was recently in the hospital.`],
      'Missed appointments': [`${TERMS.Client} has missed medical appointments.`, 'Medical appointments were missed.'],
    }),
    simple('employment', 'Work', "What is the client's work status?", {
      Working: [`${TERMS.Client} is working.`, `${TERMS.Client} is currently employed.`],
      'Looking for work': [`${TERMS.Client} is looking for work.`, `${TERMS.Client} is seeking employment.`],
      'Not working': [`${TERMS.Client} is not currently working.`, `${TERMS.Client} is not employed at this time.`],
      'Started a new job': [`${TERMS.Client} started a new job.`, `${TERMS.Client} recently began a new job.`],
      'Lost a job': [`${TERMS.Client} recently lost a job.`, `${TERMS.Client}'s employment recently ended.`],
    }),
    simple('transportation', 'Transportation', 'What is the transportation situation?', {
      'Has reliable transportation': [`${TERMS.Client} has reliable transportation.`, 'Transportation is in place.'],
      'Needs bus pass': [`${TERMS.Client} needs a bus pass.`, 'A bus pass is needed.'],
      'Needs fare': [`${TERMS.Client} needs transportation fare.`, 'Transportation fare is needed.'],
      'Needs rides to appointments': [`${TERMS.Client} needs rides to appointments.`, 'Transportation to appointments is needed.'],
      'No transportation': [`${TERMS.Client} has no transportation.`, `${TERMS.Client} is without transportation.`],
      'Car issue': [`${TERMS.Client} has a car issue.`, 'A car issue was noted.'],
      'License issue': [`${TERMS.Client} has a license issue.`, 'A license issue was noted.'],
    }),
    simple('food', 'Food access', "What is the client's food access?", {
      'Has enough food': [`${TERMS.Client} has enough food.`, 'Food needs are met.'],
      'Running low': [`${TERMS.Client} is running low on food.`, 'Food is running low.'],
      'Out of food': [`${TERMS.Client} is out of food.`, `${TERMS.Client} has no food.`],
      'Uses a food pantry': [`${TERMS.Client} uses a food pantry.`, `${TERMS.Client} is getting food from a food pantry.`],
      'Has SNAP': [`${TERMS.Client} receives SNAP.`, `${TERMS.Client} has SNAP benefits.`],
    }),
    simple('safety', 'Safety', 'Are there any safety concerns?', {
      'No concerns': ['No safety concerns were noted.', 'No safety concerns were identified.'],
      'Concern at home': ['A safety concern at home was noted.', 'A safety concern in the home was identified.'],
      'Concern in the neighborhood': ['A safety concern in the neighborhood was noted.', 'A neighborhood safety concern was identified.'],
      'Other concern': ['A safety concern was noted.', 'A safety concern was identified.'],
    }),
    other('Other matters were addressed during the check-in.'),
  ],
};

const housingSearch: Topic = {
  id: 'housing_search',
  label: 'Housing search',
  touchpointType: 'housing_application',
  purpose: 'the housing search',
  items: [
    simple('search', 'Search', 'What is the search status?', {
      Started: ['The housing search was started.', 'A housing search began.'],
      Ongoing: ['The housing search is ongoing.', 'The housing search continues.'],
      Paused: ['The housing search is paused.', 'The housing search has been paused.'],
    }),
    simple('listings', 'Listings', 'What happened with listings?', {
      Reviewed: ['Housing listings were reviewed.', 'Available listings were reviewed.'],
      Shared: [`Housing listings were shared with the ${TERMS.client}.`, `Listings were provided to the ${TERMS.client}.`],
      'Property contacted': ['A property from the listings was contacted.', 'Contact was made with a listed property.'],
    }),
    simple('viewing', 'Viewing', 'What is the viewing status?', {
      Scheduled: ['A unit viewing was scheduled.', 'A viewing was scheduled.'],
      Completed: ['A unit viewing was completed.', 'A viewing took place.'],
      Missed: ['A scheduled viewing was missed.', 'A unit viewing was missed.'],
      Rescheduled: ['A unit viewing was rescheduled.', 'A viewing was rescheduled.'],
    }),
    simple('unit', 'Unit found', 'What is the unit status?', {
      Identified: ['A unit was identified.', 'A potential unit was identified.'],
      'Pending approval': ['A unit is pending approval.', 'A unit was identified and is pending approval.'],
      Secured: ['A unit was secured.', 'A unit has been secured.'],
    }),
    simple('barrier', 'Barrier', 'What is the barrier?', {
      Cost: ['Cost is a barrier to the housing search.', 'The housing search is limited by cost.'],
      Availability: ['Unit availability is a barrier to the housing search.', 'Limited unit availability is a barrier.'],
      Eligibility: ['Eligibility is a barrier to the housing search.', 'An eligibility barrier was identified in the housing search.'],
      'Missing documents': ['Missing documents are a barrier to the housing search.', 'The housing search is delayed by missing documents.'],
      Other: ['A barrier to the housing search was identified.', 'The housing search has a barrier.'],
    }),
    other('Other housing search matters were addressed.'),
  ],
};

const application: Topic = {
  id: 'application',
  label: 'Application',
  touchpointType: 'housing_application',
  purpose: 'the housing application',
  items: [
    simple('work', 'Application work', 'What happened with the application?', {
      Started: ['The housing application was started.', 'A housing application was started.'],
      Completed: ['The housing application was completed.', 'The housing application has been completed.'],
      Submitted: ['The housing application was submitted.', 'The housing application has been submitted.'],
      Updated: ['The housing application was updated.', 'Updates were made to the housing application.'],
    }),
    simple('status', 'Status', 'What is the application status?', {
      Pending: ['The housing application is pending.', 'The housing application remains pending.'],
      Approved: ['The housing application was approved.', 'The housing application has been approved.'],
      Denied: ['The housing application was denied.', 'The housing application has been denied.'],
      Waitlisted: [`The ${TERMS.client} was placed on the waitlist.`, 'The housing application is waitlisted.'],
      Withdrawn: ['The housing application was withdrawn.', 'The housing application has been withdrawn.'],
    }),
    documents('application'),
    communication('property', 'Property contact', 'property'),
    simple('appointment', 'Appointment', 'What is the appointment status?', {
      Scheduled: ['An application appointment was scheduled.', 'An appointment for the application was scheduled.'],
      Attended: ['The application appointment was attended.', 'The appointment for the application took place.'],
      Missed: ['The application appointment was missed.', 'The appointment for the application was missed.'],
      Rescheduled: ['The application appointment was rescheduled.', 'The appointment for the application was rescheduled.'],
    }),
    simple('barrier', 'Barrier', 'What is the barrier?', {
      'Missing documents': ['Missing documents are a barrier to the application.', 'The application is delayed by missing documents.'],
      Eligibility: ['Eligibility is a barrier to the application.', 'An eligibility barrier to the application was identified.'],
      Cost: ['Cost is a barrier to the application.', 'An application cost is a barrier.'],
      Availability: ['Availability is a barrier to the application.', 'Limited availability is a barrier to the application.'],
      Other: ['A barrier to the application was identified.', 'The application has a barrier.'],
    }),
  ],
};

const landlord: Topic = {
  id: 'landlord',
  label: 'Landlord',
  touchpointType: 'landlord_tenant',
  purpose: 'landlord matters',
  items: [
    communication('communication', 'Communication', 'landlord'),
    simple('rent', 'Rent', 'What is the rent status?', {
      Current: ['Rent is current.', 'Rent remains current.'],
      Late: ['Rent is late.', 'Rent is currently late.'],
      'Balance owed': ['A rent balance is owed.', `${TERMS.Client} has a rent balance owed.`],
      'Payment plan': ['A rent payment plan is in place.', `${TERMS.Client} is on a rent payment plan.`],
      Resolved: ['The rent issue has been resolved.', 'The rent issue is resolved.'],
    }),
    simple('maintenance', 'Maintenance', 'What is the maintenance status?', {
      Reported: ['A maintenance issue was reported to the landlord.', 'A maintenance request was reported.'],
      'Followed up': ['The maintenance request was followed up on.', 'Follow-up was made on the maintenance request.'],
      Scheduled: ['The maintenance repair was scheduled.', 'A maintenance repair has been scheduled.'],
      Completed: ['The maintenance repair was completed.', 'The maintenance request has been completed.'],
      Unresolved: ['The maintenance issue remains unresolved.', 'The maintenance issue is unresolved.'],
    }),
    simple('lease', 'Lease', 'What is the lease status?', {
      Reviewed: ['The lease was reviewed.', 'Lease terms were reviewed.'],
      Signed: ['The lease was signed.', 'The lease has been signed.'],
      'Renewal due': ['The lease is due for renewal.', 'A lease renewal is due.'],
      Issue: ['A lease issue was identified.', 'An issue with the lease was identified.'],
    }),
    simple('complaint', 'Complaint', 'What is the complaint status?', {
      Received: ['A complaint was received.', 'A complaint has been received.'],
      Discussed: ['The complaint was discussed.', 'The complaint was addressed.'],
      Ongoing: ['The complaint is ongoing.', 'The complaint remains open.'],
      Resolved: ['The complaint was resolved.', 'The complaint has been resolved.'],
    }),
    simple('accommodation', 'Accommodation', 'What is the accommodation status?', {
      Requested: ['A reasonable accommodation was requested.', 'An accommodation request was made.'],
      Pending: ['The accommodation request is pending.', 'The accommodation request remains pending.'],
      Approved: ['The accommodation request was approved.', 'The accommodation request has been approved.'],
      Denied: ['The accommodation request was denied.', 'The accommodation request has been denied.'],
    }),
    simple('movein', 'Move-in', 'What is the move-in status?', {
      Scheduled: ['Move-in was scheduled.', 'A move-in date was scheduled.'],
      Completed: ['Move-in was completed.', 'The move-in has been completed.'],
      Delayed: ['Move-in was delayed.', 'The move-in has been delayed.'],
    }),
    other('Other landlord matters were addressed.'),
  ],
};

const voucher: Topic = {
  id: 'voucher',
  label: 'Voucher',
  touchpointType: 'voucher_support',
  purpose: 'the housing voucher',
  items: [
    simple('application', 'Application', 'What is the voucher application status?', {
      Started: ['The voucher application was started.', 'A voucher application was started.'],
      Submitted: ['The voucher application was submitted.', 'The voucher application has been submitted.'],
      Pending: ['The voucher application is pending.', 'The voucher application remains pending.'],
      Approved: ['The voucher application was approved.', 'The voucher application has been approved.'],
      Denied: ['The voucher application was denied.', 'The voucher application has been denied.'],
    }),
    documents('voucher'),
    communication('authority', 'Housing authority', 'housing authority'),
    simple('search', 'Housing search', 'What is the housing search status?', {
      Ongoing: ['The voucher housing search is ongoing.', 'The search for a voucher unit continues.'],
      'Unit identified': ['A unit was identified for the voucher.', 'A voucher unit was identified.'],
      Paused: ['The voucher housing search is paused.', 'The search for a voucher unit has been paused.'],
    }),
    simple('extension', 'Extension', 'What is the extension status?', {
      Requested: ['A voucher extension was requested.', 'An extension of the voucher was requested.'],
      Pending: ['The voucher extension request is pending.', 'The extension request remains pending.'],
      Approved: ['The voucher extension was approved.', 'The extension of the voucher was approved.'],
      Denied: ['The voucher extension was denied.', 'The extension of the voucher was denied.'],
    }),
    simple('inspection', 'Inspection', 'What is the inspection status?', {
      Scheduled: ['The unit inspection was scheduled.', 'A unit inspection has been scheduled.'],
      Passed: ['The unit passed inspection.', 'The unit inspection was passed.'],
      Failed: ['The unit failed inspection.', 'The unit did not pass inspection.'],
      Pending: ['The unit inspection is pending.', 'The inspection remains pending.'],
    }),
    simple('status', 'Status', 'What is the voucher status?', {
      Active: ['The voucher is active.', 'The voucher remains active.'],
      Pending: ['The voucher is pending.', 'The voucher remains pending.'],
      Issued: ['The voucher was issued.', 'The voucher has been issued.'],
      Expired: ['The voucher has expired.', 'The voucher is expired.'],
    }),
    other('Other voucher matters were addressed.'),
  ],
};

const recertification: Topic = {
  id: 'recertification',
  label: 'Recertification',
  touchpointType: 'recertification',
  purpose: 'recertification',
  items: [
    simple('notice', 'Notice', 'What happened with the notice?', {
      Received: ['A recertification notice was received.', 'The recertification notice has been received.'],
      Reviewed: ['The recertification notice was reviewed.', 'The recertification notice was gone over.'],
    }),
    documents('recertification'),
    simple('submission', 'Submission', 'What is the submission status?', {
      Submitted: ['The recertification was submitted.', 'The recertification has been submitted.'],
      Pending: ['The recertification submission is pending.', 'Submission of the recertification is pending.'],
      'Not yet submitted': ['The recertification has not yet been submitted.', 'The recertification is not yet submitted.'],
    }),
    simple('deadline', 'Deadline', 'What is the deadline status?', {
      Upcoming: ['The recertification deadline is upcoming.', 'A recertification deadline is approaching.'],
      Met: ['The recertification deadline was met.', 'The recertification was completed by the deadline.'],
      Missed: ['The recertification deadline was missed.', 'The recertification deadline has passed.'],
    }),
    simple('lease', 'Lease renewal', 'What is the lease renewal status?', {
      Pending: ['The lease renewal is pending.', 'Lease renewal remains pending.'],
      Completed: ['The lease renewal was completed.', 'The lease has been renewed.'],
      Issue: ['An issue with the lease renewal was identified.', 'The lease renewal has an issue.'],
    }),
    simple('subsidy', 'Subsidy renewal', 'What is the subsidy renewal status?', {
      Pending: ['The subsidy renewal is pending.', 'Subsidy renewal remains pending.'],
      Completed: ['The subsidy renewal was completed.', 'The subsidy has been renewed.'],
      Issue: ['An issue with the subsidy renewal was identified.', 'The subsidy renewal has an issue.'],
    }),
    simple('status', 'Status', 'What is the recertification status?', {
      Pending: ['The recertification is pending.', 'The recertification remains pending.'],
      Approved: ['The recertification was approved.', 'The recertification has been approved.'],
      'Issue identified': ['An issue with the recertification was identified.', 'The recertification has an identified issue.'],
      Completed: ['The recertification was completed.', 'The recertification has been completed.'],
    }),
    other('Other recertification matters were addressed.'),
  ],
};

const BENEFIT_NOUNS: Record<string, string> = {
  SSI: 'SSI benefits',
  SSDI: 'SSDI benefits',
  SNAP: 'SNAP benefits',
  WFNJ: 'WFNJ benefits',
  Unemployment: 'unemployment benefits',
  'Employment income': 'employment income',
  Other: 'benefits',
};
const benefitNoun = (ctx: SayContext) => BENEFIT_NOUNS[one(ctx.topic, 'type')] ?? 'benefits';
/** "were" for benefits, "was" for employment income. */
const benefitVerb = (noun: string) => (noun === 'employment income' ? 'was' : 'were');

const benefits: Topic = {
  id: 'benefits',
  label: 'Benefits',
  touchpointType: 'benefits_income',
  purpose: 'benefits',
  context: {
    key: 'type',
    label: 'Which benefit or income source?',
    options: Object.keys(BENEFIT_NOUNS),
    optional: true,
  },
  items: [
    {
      id: 'change',
      label: 'Benefits change',
      questions: [
        { key: 'v', label: 'What changed?', options: ['Interrupted', 'Restored', 'Approved', 'Denied', 'Increased', 'Decreased', 'Other'] },
      ],
      say: (a, v, ctx) => {
        const n = benefitNoun(ctx);
        const N = cap(n);
        const be = benefitVerb(n);
        const w = one(a, 'v');
        if (!w) return [];
        if (w === 'Other') return [choose(v, [`A change in ${n} was reviewed.`, `A change to ${n} was addressed.`])];
        return [choose(v, [`${N} ${be} ${w.toLowerCase()}.`, `${N} ${be === 'were' ? 'have' : 'has'} been ${w.toLowerCase()}.`])];
      },
    },
    {
      id: 'application',
      label: 'Application',
      questions: [{ key: 'v', label: 'What is the application status?', options: ['Started', 'Submitted', 'Pending', 'Approved', 'Denied'] }],
      say: (a, v, ctx) => {
        const n = benefitNoun(ctx);
        const w = one(a, 'v');
        if (!w) return [];
        const s: Record<string, string[]> = {
          Started: [`An application for ${n} was started.`, `A ${n} application was started.`],
          Submitted: [`An application for ${n} was submitted.`, `The ${n} application has been submitted.`],
          Pending: [`The application for ${n} is pending.`, `The ${n} application remains pending.`],
          Approved: [`The application for ${n} was approved.`, `The ${n} application has been approved.`],
          Denied: [`The application for ${n} was denied.`, `The ${n} application has been denied.`],
        };
        return [choose(v, s[w])];
      },
    },
    documents('benefits application'),
    communication('agency', 'Agency contact', 'benefits agency'),
    {
      id: 'eligibility',
      label: 'Eligibility',
      questions: [{ key: 'v', label: 'What is the eligibility status?', options: ['Reviewed', 'Eligible', 'Not eligible', 'Pending'] }],
      say: (a, v, ctx) => {
        const n = benefitNoun(ctx);
        const s: Record<string, string[]> = {
          Reviewed: [`Eligibility for ${n} was reviewed.`, `${cap(n)} eligibility was reviewed.`],
          Eligible: [`${TERMS.Client} is eligible for ${n}.`, `Eligibility for ${n} was confirmed.`],
          'Not eligible': [`${TERMS.Client} is not eligible for ${n}.`, `${TERMS.Client} was found not eligible for ${n}.`],
          Pending: [`Eligibility for ${n} is pending.`, `The eligibility determination for ${n} is pending.`],
        };
        const list = s[one(a, 'v')];
        return list ? [choose(v, list)] : [];
      },
    },
    other('Other benefits matters were addressed.'),
  ],
};

interface Need {
  /** Kept when the label changes, so saved drafts still match. */
  id?: string;
  noun: string;
  plural?: boolean;
  /** Asked first, when "food" or "transportation" alone is too vague. */
  kinds?: { label: string; options: Record<string, { noun: string; plural?: boolean }> };
}

const NEEDS: Record<string, Need> = {
  Food: {
    noun: 'food',
    kinds: {
      label: 'What type of food assistance?',
      options: {
        Groceries: { noun: 'groceries', plural: true },
        'Food pantry': { noun: 'food pantry access' },
        SNAP: { noun: 'SNAP' },
        Meals: { noun: 'meals', plural: true },
      },
    },
  },
  Clothing: { noun: 'clothing' },
  Furniture: { noun: 'furniture' },
  Utilities: { noun: 'utilities', plural: true },
  Transportation: {
    noun: 'transportation',
    kinds: {
      label: 'What was transportation needed for?',
      options: {
        'Medical appointment': { noun: 'transportation to a medical appointment' },
        'Housing appointment': { noun: 'transportation to a housing appointment' },
        Work: { noun: 'transportation to work' },
        'Bus pass': { noun: 'a bus pass' },
        Fare: { noun: 'transportation fare' },
        Other: { noun: 'transportation' },
      },
    },
  },
  Phone: { id: 'phone_internet', noun: 'phone service' },
  Internet: { noun: 'internet service' },
  'Household items': { noun: 'household items', plural: true },
  Identification: { noun: 'identification' },
  Other: { noun: 'other basic needs', plural: true },
};

const basicNeeds: Topic = {
  id: 'basic_needs',
  label: 'Basic needs',
  touchpointType: 'basic_needs',
  purpose: 'basic needs',
  items: Object.entries(NEEDS).map(([label, need]) => ({
    id: need.id ?? slug(label),
    label,
    questions: [
      ...(need.kinds ? [{ key: 'kind', label: need.kinds.label, options: Object.keys(need.kinds.options) }] : []),
      { key: 'v', label: 'What assistance was provided?', options: ['Discussed', 'Resource provided', 'Referral made', 'Application completed', 'Obtained', 'Pending'] },
    ],
    say: (a: Answers, v: number) => {
      const kind = need.kinds?.options[one(a, 'kind')];
      const noun = kind?.noun ?? need.noun;
      const plural = kind ? kind.plural : need.plural;
      const N = cap(noun);
      const s: Record<string, string[]> = {
        Discussed: [`Needs related to ${noun} were discussed.`, `${N} needs were discussed.`],
        'Resource provided': [`A resource for ${noun} was provided.`, `A ${noun} resource was provided.`],
        'Referral made': [`A referral was made for ${noun} assistance.`, `A referral for ${noun} assistance was made.`],
        'Application completed': [`An application for ${noun} assistance was completed.`, `An application was completed for ${noun} assistance.`],
        Obtained: [`${N} ${plural ? 'were' : 'was'} obtained.`, `${N} ${plural ? 'have' : 'has'} been obtained.`],
        Pending: [`Assistance with ${noun} is pending.`, `${N} assistance remains pending.`],
      };
      const list = s[one(a, 'v')];
      return list ? [choose(v, list)] : [];
    },
  })),
};

/** Label → [item id, how the party reads]. Ids stay put when labels change. */
const CARE_PARTIES: Record<string, [string, string]> = {
  MCO: ['mco', `the ${TERMS.client}'s MCO`],
  'Medical provider': ['medical_provider', 'a medical provider'],
  'Behavioral health provider': ['behavioral_health', 'a behavioral health provider'],
  'Housing provider': ['housing_provider', 'a housing provider'],
  Shelter: ['shelter', 'the shelter'],
  'Housing authority': ['housing_authority', 'the housing authority'],
  'Benefits agency': ['benefits_agency', 'the benefits agency'],
  Family: ['family_support', `the ${TERMS.client}'s family`],
  'Support person': ['support_person', `the ${TERMS.client}'s support person`],
  Other: ['other', 'another party'],
};
const CARE_PURPOSES: Record<string, string> = {
  'Status update': 'a status update',
  Referral: 'a referral',
  Documentation: 'documentation',
  Appointment: 'an appointment',
  'Housing barrier': 'a housing barrier',
  'Discharge planning': 'discharge planning',
  'Service coordination': 'service coordination',
  Other: 'other matters',
};
const CARE_RESULTS: Record<string, string[]> = {
  Completed: ['The coordination was completed.', 'This was completed.'],
  Pending: ['The outcome is pending.', 'This remains pending.'],
  'Follow-up needed': ['Follow-up is needed.', 'Further follow-up is needed.'],
  'No response': ['No response has been received.', 'A response has not yet been received.'],
};

const careCoordination: Topic = {
  id: 'care_coordination',
  label: 'Care coordination',
  touchpointType: 'care_coordination',
  purpose: 'care coordination',
  itemsLabel: 'Who did you coordinate with?',
  items: Object.keys(CARE_PARTIES).map((label) => ({
    id: CARE_PARTIES[label][0],
    label,
    questions: [
      { key: 'purpose', label: 'What was the purpose?', options: Object.keys(CARE_PURPOSES) },
      { key: 'result', label: 'What was the result?', options: Object.keys(CARE_RESULTS) },
    ],
    say: (a: Answers, v: number) => {
      const party = CARE_PARTIES[label][1];
      const purpose = CARE_PURPOSES[one(a, 'purpose')];
      if (!purpose) return [];
      const out = [
        choose(v, [
          `${TERMS.cm} coordinated with ${party} regarding ${purpose}.`,
          `${TERMS.cm} was in contact with ${party} to coordinate ${purpose}.`,
        ]),
      ];
      const r = CARE_RESULTS[one(a, 'result')];
      if (r) out.push(choose(v, r));
      return out;
    },
  })),
};

const LEGAL_ISSUES: Record<string, string> = {
  Eviction: 'eviction',
  Lease: 'the lease',
  Lockout: 'a lockout',
  Habitability: 'the habitability of the unit',
  'Rent dispute': 'a rent dispute',
  Accommodation: 'a reasonable accommodation',
  'Discrimination concern': 'possible discrimination',
  'Benefits issue': 'a benefits issue',
  Other: 'a legal matter',
};
const LEGAL_ACTIONS: Record<string, string> = {
  'Discussed concern': 'discussed the concern',
  'Provided legal resource': 'provided a legal resource',
  'Referral made': 'made a referral for legal assistance',
  'Appointment confirmed': 'confirmed a legal appointment',
  'Follow-up completed': 'completed follow-up',
};

const legal: Topic = {
  id: 'legal',
  label: 'Legal',
  touchpointType: 'legal_aid',
  purpose: 'a legal concern',
  itemsLabel: 'What legal issue did you discuss?',
  items: Object.keys(LEGAL_ISSUES).map((label) => ({
    id: slug(label),
    label,
    questions: [{ key: 'actions', label: `What did ${TERMS.cm} do?`, options: Object.keys(LEGAL_ACTIONS), multi: true }],
    say: (a: Answers, v: number) => {
      // Reported, never concluded: a legal finding is not ours to record.
      const out = [
        choose(v, [
          `${TERMS.Client} reported concerns regarding ${LEGAL_ISSUES[label]}.`,
          `${TERMS.Client} reported a concern regarding ${LEGAL_ISSUES[label]}.`,
        ]),
      ];
      const acts = many(a, 'actions').map((x) => LEGAL_ACTIONS[x]).filter(Boolean);
      if (acts.length) out.push(`${TERMS.cm} ${joinList(acts)}.`);
      return out;
    },
  })),
};

const supportiveHousing: Topic = {
  id: 'supportive_housing',
  label: 'Supportive housing',
  touchpointType: 'supportive_housing',
  purpose: 'supportive housing',
  items: [
    {
      // Nothing to ask: picking it is the whole answer.
      id: 'option',
      label: 'Discussed option',
      questions: [],
      say: (_a, v) => [choose(v, ['Supportive housing was discussed as an option.', 'Supportive housing options were discussed.'])],
    },
    simple('referral', 'Referral', 'What is the referral status?', {
      Made: ['A referral for supportive housing was made.', 'A supportive housing referral was made.'],
      Pending: ['The supportive housing referral is pending.', 'The supportive housing referral remains pending.'],
      Accepted: ['The supportive housing referral was accepted.', 'The supportive housing referral has been accepted.'],
      Declined: ['The supportive housing referral was declined.', 'The supportive housing referral has been declined.'],
    }),
    simple('application', 'Application', 'What is the application status?', {
      Started: ['A supportive housing application was started.', 'The supportive housing application was started.'],
      Submitted: ['The supportive housing application was submitted.', 'The supportive housing application has been submitted.'],
      Pending: ['The supportive housing application is pending.', 'The supportive housing application remains pending.'],
      Approved: ['The supportive housing application was approved.', 'The supportive housing application has been approved.'],
      Denied: ['The supportive housing application was denied.', 'The supportive housing application has been denied.'],
    }),
    simple('eligibility', 'Eligibility', 'What is the eligibility status?', {
      Reviewed: ['Eligibility for supportive housing was reviewed.', 'Supportive housing eligibility was reviewed.'],
      Eligible: [`${TERMS.Client} is eligible for supportive housing.`, 'Eligibility for supportive housing was confirmed.'],
      'Not eligible': [`${TERMS.Client} is not eligible for supportive housing.`, `${TERMS.Client} was found not eligible for supportive housing.`],
      Pending: ['Eligibility for supportive housing is pending.', 'The supportive housing eligibility determination is pending.'],
    }),
    simple('assessment', 'Assessment', 'What is the assessment status?', {
      Scheduled: ['A supportive housing assessment was scheduled.', 'An assessment for supportive housing was scheduled.'],
      Completed: ['The supportive housing assessment was completed.', 'The assessment for supportive housing was completed.'],
      Pending: ['The supportive housing assessment is pending.', 'The assessment for supportive housing is pending.'],
    }),
    simple('interview', 'Interview', 'What is the interview status?', {
      Scheduled: ['A supportive housing interview was scheduled.', 'An interview for supportive housing was scheduled.'],
      Completed: ['The supportive housing interview was completed.', 'The interview for supportive housing took place.'],
      Missed: ['The supportive housing interview was missed.', 'The interview for supportive housing was missed.'],
    }),
    simple('status', 'Status', 'What is the supportive housing status?', {
      Pending: ['Supportive housing status is pending.', 'The supportive housing status remains pending.'],
      Waitlisted: [`The ${TERMS.client} is waitlisted for supportive housing.`, 'The supportive housing application is waitlisted.'],
      Approved: ['Supportive housing was approved.', 'Supportive housing has been approved.'],
      Denied: ['Supportive housing was denied.', 'Supportive housing has been denied.'],
    }),
    simple('placement', 'Placement', 'What is the placement status?', {
      Offered: ['A supportive housing placement was offered.', 'A placement was offered.'],
      Accepted: ['The supportive housing placement was accepted.', 'The placement was accepted.'],
      Declined: ['The supportive housing placement was declined.', 'The placement was declined.'],
      Pending: ['The supportive housing placement is pending.', 'The placement remains pending.'],
    }),
    simple('movein', 'Move-in', 'What is the move-in status?', {
      Scheduled: ['Move-in to supportive housing was scheduled.', 'A supportive housing move-in was scheduled.'],
      Completed: ['Move-in to supportive housing was completed.', 'The supportive housing move-in has been completed.'],
      Delayed: ['Move-in to supportive housing was delayed.', 'The supportive housing move-in has been delayed.'],
    }),
    other('Other supportive housing matters were addressed.'),
  ],
};

const CRISIS_EVENTS: Record<string, string> = {
  'Housing loss': 'housing loss',
  'Eviction risk': 'risk of eviction',
  'Utility shutoff': 'utility shutoff',
  'Hospital discharge': 'hospital discharge',
  Shelter: 'shelter stay',
  'Safety issue': 'safety concern',
  'Behavioral health event': 'behavioral health event',
  Other: 'crisis situation',
};
const CRISIS_STATUS: Record<string, string[]> = {
  Stabilized: ['The situation has stabilized.', 'The situation is currently stable.'],
  Resolved: ['The situation has been resolved.', 'The situation is resolved.'],
  Ongoing: ['The situation is ongoing.', 'The situation remains ongoing.'],
  'Temporary plan': ['A temporary plan is in place.', 'A temporary plan has been put in place.'],
  'Additional help needed': ['Additional help is needed.', 'Further assistance is needed.'],
};
const CRISIS_ACTIONS: Record<string, string> = {
  'Assessed immediate need': `assessed the ${TERMS.client}'s immediate needs`,
  'Confirmed current location': `confirmed the ${TERMS.client}'s current location`,
  'Coordinated with provider': 'coordinated with the provider',
  'Connected to resource': `connected the ${TERMS.client} to a resource`,
  'Contacted MCO': `contacted the ${TERMS.client}'s MCO`,
  'Reviewed next steps': 'reviewed next steps',
  'Scheduled follow-up': 'scheduled a follow-up',
};

const crisis: Topic = {
  id: 'crisis_followup',
  label: 'Crisis follow-up',
  touchpointType: 'crisis_followup',
  purpose: 'crisis follow-up',
  encourageFreeText: true,
  itemsLabel: 'What situation are you following up on?',
  items: Object.keys(CRISIS_EVENTS).map((label) => ({
    id: slug(label),
    label,
    questions: [
      { key: 'status', label: 'What is the current status?', options: Object.keys(CRISIS_STATUS) },
      { key: 'actions', label: `What did ${TERMS.cm} do?`, options: Object.keys(CRISIS_ACTIONS), multi: true, optional: true },
    ],
    say: (a: Answers, v: number) => {
      const out = [
        choose(v, [
          `${TERMS.cm} followed up regarding the ${TERMS.client}'s ${CRISIS_EVENTS[label]}.`,
          `${TERMS.cm} completed follow-up regarding the ${TERMS.client}'s ${CRISIS_EVENTS[label]}.`,
        ]),
      ];
      const st = CRISIS_STATUS[one(a, 'status')];
      if (st) out.push(choose(v, st));
      const acts = many(a, 'actions').map((x) => CRISIS_ACTIONS[x]).filter(Boolean);
      if (acts.length) out.push(`${TERMS.cm} ${joinList(acts)}.`);
      return out;
    },
  })),
};

const otherTopic: Topic = {
  id: 'other',
  label: 'Other',
  touchpointType: 'other',
  purpose: '',
  encourageFreeText: true,
  hidden: true,
  items: [other('Other matters were addressed.', 'What else did you discuss?')],
};

// ---- detail sections reached through a visit activity -----------------------

/** Picked answers of a several-choice question. */
const picks = (a: Answers, key = 'v') => many(a, key);
/** "Please specify", asked when Other is picked. */
const specify = (key: string, otherLabel: string): Question => ({
  key: `${key}Other`,
  label: 'Please specify',
  options: [],
  text: true,
  showIf: (a) => (Array.isArray(a[key]) ? (a[key] as string[]).includes(otherLabel) : a[key] === otherLabel),
});
/** The chosen phrases, with the typed text standing in for Other. */
const phrases = (a: Answers, key: string, map: Record<string, string>, otherLabel: string) =>
  picks(a, key).map((x) => (x === otherLabel ? one(a, `${key}Other`).trim() : map[x])).filter(Boolean);

const HSP: Record<string, string[]> = {
  'Reviewed existing plan': [`${TERMS.cm} reviewed the existing housing stabilization plan.`, `${TERMS.cm} went over the existing housing stabilization plan.`],
  'Updated plan': [`${TERMS.cm} updated the housing stabilization plan.`, `The housing stabilization plan was updated by ${TERMS.cm}.`],
  'Identified a new goal': [`${TERMS.cm} identified a new housing goal with the ${TERMS.client}.`, `${TERMS.cm} and the ${TERMS.client} identified a new housing goal.`],
  'Reviewed progress': [`${TERMS.cm} reviewed progress on the housing stabilization plan.`, `${TERMS.cm} went over progress on the housing stabilization plan.`],
  'Identified a barrier': [`${TERMS.cm} identified a barrier to the housing stabilization plan.`, `A barrier to the housing stabilization plan was identified by ${TERMS.cm}.`],
};
const hspTopic: Topic = {
  id: 'hsp',
  label: 'Housing stabilization plan',
  touchpointType: 'general_checkin',
  purpose: 'the housing stabilization plan',
  hidden: true,
  items: [
    {
      id: 'plan',
      label: 'Plan review',
      questions: [{ key: 'v', label: 'What happened with the housing stabilization plan?', options: Object.keys(HSP), multi: true }],
      say: (a, v) => picks(a).map((x, i) => choose(v + i, HSP[x] ?? [])).filter(Boolean),
    },
  ],
};

/** One item: pick topics (Other asks to specify), and one sentence names them all. */
function topicsCovered(id: string, label: string, question: string, map: Record<string, string>, otherLabel: string, sentence: (list: string) => string[]): Item {
  return {
    id,
    label,
    questions: [{ key: 'v', label: question, options: [...Object.keys(map), otherLabel], multi: true }, specify('v', otherLabel)],
    say: (a, v) => {
      const p = phrases(a, 'v', map, otherLabel);
      return p.length ? [choose(v, sentence(joinList(p)))] : [];
    },
  };
}

const tenantRights: Topic = {
  id: 'tenant_rights',
  label: 'Tenant rights education',
  touchpointType: 'landlord_tenant',
  purpose: 'tenant rights',
  hidden: true,
  items: [
    // Education about rights, never legal advice.
    topicsCovered(
      'topic',
      'Education topic',
      'What topic was covered?',
      { 'Lease terms': 'lease terms', 'Rent responsibilities': 'rent responsibilities', Repairs: 'repairs', 'Eviction process': 'the eviction process', 'Reasonable accommodation': 'reasonable accommodation' },
      'Other topic',
      (l) => [`${TERMS.cm} provided tenant rights education about ${l}.`, `${TERMS.cm} provided the ${TERMS.client} with tenant rights education about ${l}.`],
    ),
  ],
};

const EMPLOYMENT: Record<string, string[]> = {
  'Discussed employment goals': [`${TERMS.cm} discussed employment goals with the ${TERMS.client}.`, `${TERMS.cm} and the ${TERMS.client} discussed employment goals.`],
  'Shared an employment resource': [`${TERMS.cm} shared an employment resource.`, `${TERMS.cm} provided an employment resource.`],
  'Made an employment referral': [`${TERMS.cm} made an employment referral.`, `${TERMS.cm} referred the ${TERMS.client} for employment services.`],
  'Assisted with an employment application': [`${TERMS.cm} assisted with an employment application.`, `${TERMS.cm} helped the ${TERMS.client} with an employment application.`],
  'Followed up on employment': [`${TERMS.cm} followed up on employment.`, `${TERMS.cm} completed follow-up on employment.`],
};
const employment: Topic = {
  id: 'employment',
  label: 'Employment support',
  touchpointType: 'benefits_income',
  purpose: 'employment',
  hidden: true,
  items: [
    {
      id: 'support',
      label: 'Employment support',
      questions: [{ key: 'v', label: `What did ${TERMS.cm} do?`, options: Object.keys(EMPLOYMENT), multi: true }],
      say: (a, v) => picks(a).map((x, i) => choose(v + i, EMPLOYMENT[x] ?? [])).filter(Boolean),
    },
  ],
};

const budgeting: Topic = {
  id: 'budgeting',
  label: 'Budgeting support',
  touchpointType: 'benefits_income',
  purpose: 'budgeting',
  hidden: true,
  items: [
    topicsCovered(
      'focus',
      'Budgeting focus',
      `What did ${TERMS.cm} work on with the ${TERMS.client}?`,
      { 'Rent budget': 'a rent budget', 'Expense review': 'an expense review', 'Payment plan': 'a payment plan', 'Savings goal': 'a savings goal' },
      'Other topic',
      (l) => [`${TERMS.cm} provided budgeting support focused on ${l}.`, `${TERMS.cm} provided the ${TERMS.client} with budgeting support focused on ${l}.`],
    ),
  ],
};

const financialLiteracy: Topic = {
  id: 'financial_literacy',
  label: 'Financial literacy coaching',
  touchpointType: 'benefits_income',
  purpose: 'financial literacy',
  hidden: true,
  items: [
    topicsCovered(
      'topic',
      'Coaching topic',
      'What topic was covered?',
      { 'Understanding a bill': 'understanding a bill', 'Tracking expenses': 'tracking expenses', 'Planning payments': 'planning payments', 'Credit education': 'credit' },
      'Other topic',
      (l) => [`${TERMS.cm} provided financial literacy coaching about ${l}.`, `${TERMS.cm} provided the ${TERMS.client} with financial literacy coaching about ${l}.`],
    ),
  ],
};

const SAFETY: Record<string, string[]> = {
  'Completed check': [`${TERMS.cm} completed a home safety check.`, `A home safety check was completed by ${TERMS.cm}.`],
  'Identified a concern': [],
  'No concern identified': ['No home safety concern was identified.', 'The home safety check identified no concern.'],
  'Follow-up needed': ['Follow-up on home safety is needed.', 'Home safety requires follow-up.'],
};
const homeSafety: Topic = {
  id: 'home_safety',
  label: 'Home safety check',
  touchpointType: 'general_checkin',
  purpose: 'home safety',
  hidden: true,
  items: [
    {
      id: 'check',
      label: 'Home safety check',
      questions: [
        { key: 'v', label: 'What happened?', options: Object.keys(SAFETY), multi: true },
        {
          key: 'concern',
          label: 'What concern was identified?',
          options: [],
          text: true,
          showIf: (a) => picks(a).includes('Identified a concern'),
        },
      ],
      // Only what was picked: no concern is never assumed from a blank.
      say: (a, v) =>
        picks(a).flatMap((x, i) => {
          if (x === 'Identified a concern') {
            const c = one(a, 'concern').trim().replace(/[.!?]+$/, '');
            return c ? [`A home safety concern was identified: ${c}.`] : ['A home safety concern was identified.'];
          }
          return [choose(v + i, SAFETY[x] ?? [])];
        }).filter(Boolean),
    },
  ],
};

const housingSpecialist: Topic = {
  id: 'housing_specialist',
  label: 'Housing specialist coordination',
  touchpointType: 'care_coordination',
  purpose: 'coordination with the housing specialist',
  hidden: true,
  items: [
    {
      id: 'coordination',
      label: 'Housing specialist',
      questions: [
        { key: 'purpose', label: 'What was the purpose?', options: Object.keys(CARE_PURPOSES) },
        specify('purpose', 'Other'),
        { key: 'result', label: 'What was the result?', options: Object.keys(CARE_RESULTS) },
      ],
      say: (a, v) => {
        const p = one(a, 'purpose') === 'Other' ? one(a, 'purposeOther').trim() : CARE_PURPOSES[one(a, 'purpose')];
        if (!p) return [];
        const out = [`${TERMS.cm} coordinated with the housing specialist regarding ${p}.`];
        const r = CARE_RESULTS[one(a, 'result')];
        if (r) out.push(choose(v, r));
        return out;
      },
    },
  ],
};

const propertyManager: Topic = {
  id: 'property_manager',
  label: 'Property manager',
  touchpointType: 'landlord_tenant',
  purpose: 'the property manager',
  hidden: true,
  items: [communication('communication', 'Communication', 'property manager')],
};

const documentAssistance: Topic = {
  id: 'document_assistance',
  label: 'Document assistance',
  touchpointType: 'housing_application',
  purpose: 'documents',
  hidden: true,
  items: [
    documents('application', 'application_docs', 'Application documents'),
    documents('voucher', 'voucher_docs', 'Voucher documents'),
    documents('recertification', 'recert_docs', 'Recertification documents'),
    documents('benefits application', 'benefits_docs', 'Benefits documents'),
  ],
};

export const TOPICS: Topic[] = [
  checkIn,
  housingSearch,
  application,
  landlord,
  voucher,
  recertification,
  benefits,
  basicNeeds,
  careCoordination,
  legal,
  supportiveHousing,
  crisis,
  otherTopic,
  hspTopic,
  tenantRights,
  employment,
  budgeting,
  financialLiteracy,
  homeSafety,
  housingSpecialist,
  propertyManager,
  documentAssistance,
];

export const topicById = (id: string) => TOPICS.find((t) => t.id === id);

// ---- what happened on the visit -------------------------------------------

/** A detail section an activity opens, limited to some of its items when given. */
export interface Section {
  topic: string;
  items?: string[];
}

export interface Activity {
  id: string;
  label: string;
  /** Completes "CM … regarding ___". */
  phrase: string;
  /** The existing detail questions this activity shows. */
  sections: Section[];
  /** Coordination about the member, often without them on the call. */
  coordination?: boolean;
}

/** Step 1: the housing support activities that took place. Each opens its detail questions. */
export const ACTIVITIES: Activity[] = [
  { id: 'housing_search', label: 'Housing search assistance', phrase: 'housing search assistance', sections: [{ topic: 'housing_search' }] },
  { id: 'application', label: 'Housing application assistance', phrase: 'housing application assistance', sections: [{ topic: 'application' }] },
  { id: 'lease_review', label: 'Lease review', phrase: 'a lease review', sections: [{ topic: 'landlord', items: ['lease'] }] },
  { id: 'lease_signing', label: 'Lease signing support', phrase: 'lease signing support', sections: [{ topic: 'landlord', items: ['lease'] }] },
  { id: 'hsp_review', label: 'Housing stabilization plan review', phrase: 'a housing stabilization plan review', sections: [{ topic: 'hsp' }] },
  { id: 'move_in', label: 'Move-in coordination', phrase: 'move-in coordination', sections: [{ topic: 'landlord', items: ['movein'] }, { topic: 'supportive_housing', items: ['movein'] }] },
  { id: 'tenant_rights', label: 'Tenant rights education', phrase: 'tenant rights education', sections: [{ topic: 'tenant_rights' }] },
  { id: 'resource_referral', label: 'Community resource referral', phrase: 'a community resource referral', sections: [{ topic: 'basic_needs' }] },
  { id: 'employment', label: 'Employment support', phrase: 'employment support', sections: [{ topic: 'checkin', items: ['employment'] }, { topic: 'employment' }] },
  { id: 'landlord', label: 'Landlord communication', phrase: 'communication with the landlord', sections: [{ topic: 'landlord' }] },
  { id: 'property_manager', label: 'Property manager communication', phrase: 'communication with the property manager', sections: [{ topic: 'property_manager' }] },
  { id: 'benefits', label: 'Benefits assistance', phrase: 'benefits assistance', sections: [{ topic: 'benefits' }] },
  { id: 'documents', label: 'Document assistance', phrase: 'document assistance', sections: [{ topic: 'document_assistance' }] },
  { id: 'budgeting', label: 'Budgeting support', phrase: 'budgeting support', sections: [{ topic: 'budgeting' }] },
  { id: 'financial_literacy', label: 'Financial literacy coaching', phrase: 'financial literacy coaching', sections: [{ topic: 'financial_literacy' }] },
  { id: 'eviction_prevention', label: 'Eviction prevention', phrase: 'eviction prevention', sections: [{ topic: 'crisis_followup' }, { topic: 'legal' }] },
  { id: 'crisis', label: 'Crisis intervention', phrase: 'crisis intervention', sections: [{ topic: 'crisis_followup' }] },
  { id: 'mco', label: 'MCO coordination', phrase: 'MCO coordination', sections: [{ topic: 'care_coordination' }], coordination: true },
  { id: 'housing_specialist', label: 'Housing specialist coordination', phrase: 'coordination with the housing specialist', sections: [{ topic: 'housing_specialist' }], coordination: true },
  { id: 'home_safety', label: 'Home safety check', phrase: 'a home safety check', sections: [{ topic: 'home_safety' }] },
  { id: 'other', label: 'Other activity', phrase: '', sections: [] },
];

export const activityById = (id: string) => ACTIVITIES.find((a) => a.id === id);

/** Detail sections that can be added when relevant, beyond what the activities open. */
export const EXTRA_SECTIONS = ['voucher', 'recertification', 'supportive_housing', 'basic_needs', 'legal', 'checkin'];

/** "visit" when it was in person, "contact" otherwise. */
export const contactWord = (method?: string | null) => (method === 'in_person' ? 'visit' : 'contact');

export const HOUSING_STATUS: Record<string, string[]> = {
  'Stably housed': [`${TERMS.Client} is stably housed.`, `${TERMS.Client} is currently stably housed.`],
  'At risk of losing housing': [`${TERMS.Client} is at risk of losing housing.`, `${TERMS.Client} is currently at risk of losing housing.`],
  'Experiencing homelessness': [`${TERMS.Client} is experiencing homelessness.`, `${TERMS.Client} is currently experiencing homelessness.`],
  'Transitioning into housing': [`${TERMS.Client} is transitioning into housing.`, `${TERMS.Client} is currently transitioning into housing.`],
};

export const HOUSING_CHANGED: Record<string, string> = {
  Yes: `${TERMS.Client}'s housing situation has changed since the last contact.`,
  No: `${TERMS.Client}'s housing situation has not changed since the last contact.`,
  Unknown: `Whether the ${TERMS.client}'s housing situation has changed since the last contact is unknown.`,
};

// ---- what CM did --------------------------------------------------------

export interface ActionGroup {
  id: string;
  label: string;
  /** Second-level choices, with how each reads after the verb. */
  options: Record<string, string>;
  /** The sentence for the chosen phrases. */
  say: (phrases: string[], v: number) => string;
  /** Options that ask for a few words, and how the answer reads. */
  detail?: Record<string, { label: string; phrase: (text: string) => string }>;
}

export const ACTIONS: ActionGroup[] = [
  {
    id: 'reviewed',
    label: 'Reviewed',
    options: { Documents: 'documents', Application: 'the application', Lease: 'the lease', Benefits: 'benefits', 'Housing stabilization plan': 'the housing stabilization plan', 'Next steps': 'next steps' },
    say: (p, v) => choose(v, [`${TERMS.cm} reviewed ${joinList(p)}.`, `${TERMS.cm} went over ${joinList(p)}.`]),
  },
  {
    id: 'assisted',
    label: 'Assisted with',
    options: { 'An application': 'an application', Documents: 'documents', 'Phone call': 'a phone call', Scheduling: 'scheduling', 'Housing search': 'the housing search' },
    say: (p, v) =>
      choose(v, [
        `${TERMS.cm} assisted the ${TERMS.client} with ${joinList(p)}.`,
        `${TERMS.cm} supported the ${TERMS.client} with ${joinList(p)}.`,
      ]),
  },
  {
    id: 'contacted',
    label: 'Contacted',
    options: {
      Landlord: 'the landlord',
      'Property manager': 'the property manager',
      'Property about a listing': 'the property about the listing',
      'Housing authority': 'the housing authority',
      Provider: 'the provider',
      'Benefits agency': 'the benefits agency',
      MCO: `the ${TERMS.client}'s MCO`,
    },
    say: (p, v) => choose(v, [`${TERMS.cm} contacted ${joinList(p)}.`, `${TERMS.cm} reached out to ${joinList(p)}.`]),
  },
  {
    id: 'provided',
    label: 'Provided',
    options: { Information: 'information', 'A resource': 'a resource', Education: 'education', Documentation: 'documentation' },
    detail: { Education: { label: 'What was the education about?', phrase: (t) => `education about ${t}` } },
    say: (p, v) =>
      choose(v, [`${TERMS.cm} provided the ${TERMS.client} with ${joinList(p)}.`, `${TERMS.cm} provided ${joinList(p)} to the ${TERMS.client}.`]),
  },
  {
    id: 'submitted',
    label: 'Submitted',
    options: { Application: 'the application', Documents: 'documents', Request: 'a request' },
    say: (p, v) => choose(v, [`${TERMS.cm} submitted ${joinList(p)}.`, `${TERMS.cm} completed submission of ${joinList(p)}.`]),
  },
  {
    id: 'referred',
    label: 'Referred to',
    options: {
      'Housing program': 'a housing program',
      Benefits: 'benefits services',
      'Legal services': 'legal services',
      'Behavioral health': 'behavioral health services',
      Medical: 'medical services',
      'Basic needs': 'a basic needs resource',
    },
    say: (p, v) => choose(v, [`${TERMS.cm} referred the ${TERMS.client} to ${joinList(p)}.`, `${TERMS.cm} made a referral to ${joinList(p)}.`]),
  },
  {
    id: 'coordinated',
    label: 'Coordinated with',
    options: { Provider: 'the provider', MCO: `the ${TERMS.client}'s MCO`, 'Housing authority': 'the housing authority', Landlord: 'the landlord', Shelter: 'the shelter', 'Benefits agency': 'the benefits agency' },
    say: (p, v) => choose(v, [`${TERMS.cm} coordinated with ${joinList(p)}.`, `${TERMS.cm} completed coordination with ${joinList(p)}.`]),
  },
  {
    id: 'scheduled',
    label: 'Scheduled',
    options: { Appointment: 'an appointment', Viewing: 'a viewing', Inspection: 'an inspection', 'Follow-up contact': 'a follow-up contact' },
    say: (p, v) => choose(v, [`${TERMS.cm} scheduled ${joinList(p)}.`, `${TERMS.cm} arranged ${joinList(p)}.`]),
  },
  {
    id: 'advocated',
    label: 'Advocated with',
    options: { Landlord: 'the landlord', 'Housing authority': 'the housing authority', Provider: 'the provider', 'Benefits agency': 'the benefits agency' },
    say: (p, v) =>
      choose(v, [`${TERMS.cm} advocated on the ${TERMS.client}'s behalf with ${joinList(p)}.`, `${TERMS.cm} advocated with ${joinList(p)} on the ${TERMS.client}'s behalf.`]),
  },
  {
    id: 'followed_up',
    label: 'Followed up on',
    options: { Application: 'the application', Referral: 'the referral', Documents: 'documents', Request: 'the request' },
    say: (p, v) => choose(v, [`${TERMS.cm} followed up on ${joinList(p)}.`, `${TERMS.cm} completed follow-up on ${joinList(p)}.`]),
  },
];

// ---- result, response, next step ------------------------------------------

export const RESULTS: Record<string, string[]> = {
  Completed: ['The task was completed.', 'This was completed.'],
  'Progress made': ['Progress was made.', 'Progress was made toward the goal.'],
  Pending: ['The matter remains pending.', 'This is pending at this time.'],
  'No change': ['There was no change at this time.', 'No change was noted at this time.'],
  'Unable to complete': [`${TERMS.cm} was unable to complete the task at this time.`, 'The task could not be completed at this time.'],
};

/** Barriers that affected the housing goal, as each reads in the note. */
export const BARRIER_LIST: Record<string, string> = {
  'Financial barrier': 'a financial barrier',
  'Missing documents': 'missing documents',
  'Eligibility barrier': 'an eligibility barrier',
  'Housing availability': 'housing availability',
  'Transportation barrier': 'a transportation barrier',
  'Legal barrier': 'a legal barrier',
  'Behavioral health concern': 'a behavioral health concern',
  'Waiting for a third-party response': 'waiting for a third-party response',
  'Member unavailable': `the ${TERMS.client} was unavailable`,
  'Member declined assistance': `the ${TERMS.client} declined assistance`,
  'Other barrier': '',
};

export const BARRIER_ANSWERS = ['Yes', 'No', 'Not assessed'] as const;

/** Older drafts: a barrier picked as the result. */
export const BARRIERS: Record<string, string> = {
  'Missing documents': 'missing documents',
  'Waiting on a third party': 'waiting on a third party',
  Eligibility: 'eligibility',
  Cost: 'cost',
  Transportation: 'transportation',
  Availability: 'availability',
  'Client unavailable': `the ${TERMS.client} was unavailable`,
  'Client declined': `the ${TERMS.client} declined`,
  Other: '',
};

export const RESPONSES: Record<string, string[]> = {
  'Engaged in the discussion': [`${TERMS.Client} engaged in the discussion.`, `${TERMS.Client} took part in the discussion.`],
  'Agreed with the plan': [`${TERMS.Client} agreed with the plan.`, `${TERMS.Client} agreed to the plan.`],
  'Requested assistance': [`${TERMS.Client} requested assistance.`, `${TERMS.Client} asked for assistance.`],
  'Asked questions': [`${TERMS.Client} asked questions.`, `${TERMS.Client} had questions.`],
  'Expressed concern': [`${TERMS.Client} expressed concern.`, `${TERMS.Client} voiced concern.`],
  'Declined assistance': [`${TERMS.Client} declined assistance.`, `${TERMS.Client} declined the assistance offered.`],
  'Reported no additional needs': [`${TERMS.Client} reported no additional needs.`, `${TERMS.Client} reported no further needs at this time.`],
  'Response not observed': [`${TERMS.Client}'s response was not observed.`, `No response from the ${TERMS.client} was observed.`],
  // Older drafts.
  'Agreed with plan': [`${TERMS.Client} agreed with the plan.`, `${TERMS.Client} agreed to the plan.`],
  'Requested help': [`${TERMS.Client} requested assistance.`, `${TERMS.Client} asked for assistance.`],
  'Declined help': [`${TERMS.Client} declined assistance.`, `${TERMS.Client} declined the assistance offered.`],
  'Has questions': [`${TERMS.Client} had questions.`, `${TERMS.Client} asked questions.`],
  Concerned: [`${TERMS.Client} expressed concern.`, `${TERMS.Client} voiced concern.`],
  'No additional needs': [`${TERMS.Client} reported no additional needs.`, `${TERMS.Client} reported no further needs at this time.`],
  'Other response': [],
  Other: [],
};

/** The response choices offered now (the rest are kept for older drafts). */
export const RESPONSE_CHOICES = [
  'Engaged in the discussion',
  'Agreed with the plan',
  'Requested assistance',
  'Asked questions',
  'Expressed concern',
  'Declined assistance',
  'Reported no additional needs',
  'Response not observed',
  'Other response',
];

/** Who can be responsible for the next step. Several can be picked, except None. */
export const NEXT_WHO = ['CM', 'Consumer', 'Third party', 'None'] as const;

/** How each NEXT_WHO value is labeled in the builder. The values stay as saved. */
export const NEXT_WHO_LABELS: Record<string, string> = { CM: TERMS.cm, Consumer: 'Member', Member: 'Member', Both: 'Both', 'Third party': 'Third party', None: 'No next step' };

/** Who is responsible for one next step. */
export const STEP_WHO = ['CM', 'Member', 'Third party'] as const;

/** When the next contact is planned. */
export const NEXT_CONTACT = ['Specific date', 'Timeframe', 'Not yet scheduled'] as const;
export const NEXT_CONTACT_TIMEFRAMES: Record<string, string> = {
  'In 1 week': 'within one week',
  'In 2 weeks': 'within two weeks',
  'In 1 month': 'within one month',
};

export const NEXT_CM: Record<string, string> = {
  'Follow up': 'follow up',
  'Contact agency': 'contact the agency',
  'Contact provider': 'contact the provider',
  'Contact landlord': 'contact the landlord',
  'Contact property': 'contact the property',
  'Check application': 'check on the application',
  'Submit documents': 'submit documents',
  'Research housing': 'research housing options',
  'Make referral': 'make a referral',
  'Schedule appointment': 'schedule an appointment',
  Other: '',
};

export const NEXT_CONSUMER: Record<string, string> = {
  'Gather documents': 'gather the required documents',
  'Submit documents': 'submit documents',
  'Complete application': 'complete the application',
  'Attend appointment': 'attend the appointment',
  'Contact provider': 'contact the provider',
  'Contact agency': 'contact the agency',
  'Contact landlord': 'contact the landlord',
  'Contact property': 'contact the property',
  'Make payment': 'make a payment',
  'Review options': 'review options',
  Other: '',
};

/** Who the third party is, as it reads in the note. */
export const THIRD_PARTIES: Record<string, string> = {
  Parent: `the ${TERMS.client}'s parent`,
  Guardian: `the ${TERMS.client}'s guardian`,
  'Family member': `a family member`,
  Landlord: 'the landlord',
  Property: 'the property',
  'Housing authority': 'the housing authority',
  Provider: 'the provider',
  MCO: `the ${TERMS.client}'s MCO`,
  'Benefits agency': 'the benefits agency',
  Other: 'a third party',
};

export const NEXT_THIRD: Record<string, (party: string) => string> = {
  Respond: (p) => `a response from ${p}`,
  'Make a decision': (p) => `a decision from ${p}`,
  'Process application': (p) => `processing of the application by ${p}`,
  Schedule: (p) => `scheduling by ${p}`,
  Other: () => '',
};

export const SPECIFIC_DATE = 'On a specific date';

export const TIMING: Record<string, string> = {
  'In 2–3 days': 'within 2–3 days',
  'In 1 week': 'within one week',
  'In 2 weeks': 'within two weeks',
  'At the next scheduled contact': 'at the next scheduled contact',
  'After a third-party response': 'after a response is received',
  [SPECIFIC_DATE]: '',
};

// ---- how the contact happened ---------------------------------------------

/** "CM ___ regarding …" for each contact method. */
export const METHOD_PHRASES: Record<string, string[]> = {
  in_person: [`met with the ${TERMS.client} in person`, `met in person with the ${TERMS.client}`],
  phone: [`contacted the ${TERMS.client} by phone`, `spoke with the ${TERMS.client} by phone`],
  text: [`contacted the ${TERMS.client} by text`, `texted the ${TERMS.client}`],
  email: [`contacted the ${TERMS.client} by email`, `emailed the ${TERMS.client}`],
  virtual: [`met with the ${TERMS.client} by video`, `contacted the ${TERMS.client} by video`],
  other: [`contacted the ${TERMS.client}`, `contacted the ${TERMS.client}`],
};

/** For care coordination, the contact may not have been with the consumer. */
export const METHOD_MEANS: Record<string, string> = {
  in_person: 'in person',
  phone: 'by phone',
  text: 'by text',
  email: 'by email',
  virtual: 'by video',
  other: '',
};
