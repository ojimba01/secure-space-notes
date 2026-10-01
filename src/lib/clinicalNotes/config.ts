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
export const TERMS = { cm: 'CM', client: 'consumer', Client: 'Consumer' } as const;

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
  /** Asked once for the whole topic, before its items (optional). */
  context?: Question;
  items: Item[];
  /** Ask for a few words of free text, which buttons cannot capture well. */
  encourageFreeText?: boolean;
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
function other(fallback: string): Item {
  return {
    id: 'other',
    label: 'Other',
    questions: [{ key: 'text', label: 'Briefly, what?', options: [], text: true, optional: true }],
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
function documents(forWhat: string): Item {
  return {
    id: 'documents',
    label: 'Documents',
    questions: [
      { key: 'type', label: 'Document type', options: Object.keys(DOC_TYPES) },
      { key: 'status', label: 'Status', options: ['Needed', 'Gathered', 'Submitted', 'Missing'] },
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
  return simple(id, label, 'What happened?', {
    Contacted: [`The ${party} was contacted.`, `Contact was made with the ${party}.`],
    'Received response': [`A response was received from the ${party}.`, `The ${party} responded.`],
    'No response': [`No response has been received from the ${party}.`, `The ${party} has not responded.`],
    'Follow-up needed': [`Follow-up with the ${party} is needed.`, `The ${party} requires follow-up.`],
  });
}

/** How an area of the consumer's life stands. */
function areaStatus(id: string, label: string, noun: string): Item {
  const N = cap(noun);
  return simple(id, label, 'Status', {
    'No change': [`No change in ${noun} was noted.`, `${N} is unchanged.`],
    'New concern': [`A new ${noun} concern was identified.`, `A new concern regarding ${noun} was identified.`],
    'Ongoing concern': [`The ${noun} concern is ongoing.`, `A ${noun} concern remains ongoing.`],
    Improved: [`The ${noun} concern has improved.`, `There has been improvement in the ${noun} concern.`],
    Resolved: [`The ${noun} concern has been resolved.`, `The ${noun} concern is resolved.`],
  });
}

const NEW_ISSUE_STATUS = ['New', 'Ongoing', 'Improved', 'Resolved', 'Worsened'];

// ---- topics -------------------------------------------------------------

const checkIn: Topic = {
  id: 'checkin',
  label: 'Check-in',
  touchpointType: 'general_checkin',
  purpose: 'a housing stability check-in',
  items: [
    simple('housing', 'Housing', 'Housing status', {
      Stable: [`${TERMS.Client}'s housing remains stable.`, `${TERMS.Client}'s housing is stable.`],
      Searching: [`${TERMS.Client} is currently searching for housing.`, `${TERMS.Client} is searching for housing.`],
      Temporary: [`${TERMS.Client} is in temporary housing.`, `${TERMS.Client} is currently in temporary housing.`],
      Shelter: [`${TERMS.Client} is staying in shelter.`, `${TERMS.Client} is currently staying in shelter.`],
      'With family/friends': [`${TERMS.Client} is staying with family or friends.`, `${TERMS.Client} is currently staying with family or friends.`],
      'At risk': [`${TERMS.Client}'s housing is at risk.`, `${TERMS.Client}'s current housing is at risk.`],
      Other: ['Housing status was reviewed.', `${TERMS.Client}'s housing status was reviewed.`],
    }),
    simple('rent', 'Rent', 'Rent', {
      Current: ['Rent is current.', 'Rent remains current.'],
      Late: ['Rent is late.', 'Rent is currently late.'],
      'Balance owed': [`${TERMS.Client} has a rent balance owed.`, 'A rent balance is owed.'],
      'Payment plan': [`${TERMS.Client} is on a rent payment plan.`, 'A rent payment plan is in place.'],
      Other: ['Rent was reviewed.', 'Rent was addressed.'],
    }),
    simple('utilities', 'Utilities', 'Utilities', {
      Current: ['Utilities are current.', 'Utility accounts are current.'],
      'Past due': ['Utilities are past due.', 'A utility balance is past due.'],
      'Shutoff notice': ['A utility shutoff notice was received.', `${TERMS.Client} has a utility shutoff notice.`],
      Disconnected: ['Utilities are disconnected.', 'A utility service is disconnected.'],
      Other: ['Utilities were reviewed.', 'Utilities were addressed.'],
    }),
    simple('landlord', 'Landlord', 'Landlord', {
      'No concerns': ['No landlord concerns were identified.', 'No concerns regarding the landlord were identified.'],
      'Concern raised': ['A landlord concern was raised.', 'A concern regarding the landlord was raised.'],
      'Contact needed': ['Contact with the landlord is needed.', 'The landlord needs to be contacted.'],
      Other: ['Landlord matters were reviewed.', 'Landlord matters were addressed.'],
    }),
    {
      id: 'unit',
      label: 'Unit',
      questions: [
        { key: 'concern', label: 'Unit concern', options: ['Maintenance', 'Utilities', 'Safety', 'Accessibility', 'Other'] },
        { key: 'status', label: 'Status', options: NEW_ISSUE_STATUS },
      ],
      say: (a, v) => {
        const c = one(a, 'concern').toLowerCase();
        if (!c) return [];
        const what = c === 'other' ? 'unit concern' : `unit ${c} concern`;
        const s: Record<string, string[]> = {
          New: [`A new ${what} was identified.`, `A new ${what} was noted.`],
          Ongoing: [`The ${what} is ongoing.`, `A ${what} remains ongoing.`],
          Improved: [`The ${what} has improved.`, `There has been improvement in the ${what}.`],
          Resolved: [`The ${what} has been resolved.`, `The ${what} is resolved.`],
          Worsened: [`The ${what} has worsened.`, `The ${what} is worse.`],
        };
        const list = s[one(a, 'status')];
        return list ? [choose(v, list)] : [];
      },
    },
    areaStatus('benefits', 'Benefits', 'benefits'),
    areaStatus('health', 'Health', 'health'),
    areaStatus('employment', 'Employment', 'employment'),
    areaStatus('transportation', 'Transportation', 'transportation'),
    areaStatus('food', 'Food', 'food'),
    areaStatus('safety', 'Safety', 'safety'),
    other('Other matters were addressed during the check-in.'),
  ],
};

const housingSearch: Topic = {
  id: 'housing_search',
  label: 'Housing search',
  touchpointType: 'housing_application',
  purpose: 'the housing search',
  items: [
    simple('search', 'Search', 'Search', {
      Started: ['The housing search was started.', 'A housing search began.'],
      Ongoing: ['The housing search is ongoing.', 'The housing search continues.'],
      Paused: ['The housing search is paused.', 'The housing search has been paused.'],
    }),
    simple('listings', 'Listings', 'Listings', {
      Reviewed: ['Housing listings were reviewed.', 'Available listings were reviewed.'],
      Shared: [`Housing listings were shared with the ${TERMS.client}.`, `Listings were provided to the ${TERMS.client}.`],
      'Property contacted': ['A property from the listings was contacted.', 'Contact was made with a listed property.'],
    }),
    simple('viewing', 'Viewing', 'Viewing', {
      Scheduled: ['A unit viewing was scheduled.', 'A viewing was scheduled.'],
      Completed: ['A unit viewing was completed.', 'A viewing took place.'],
      Missed: ['A scheduled viewing was missed.', 'A unit viewing was missed.'],
      Rescheduled: ['A unit viewing was rescheduled.', 'A viewing was rescheduled.'],
    }),
    simple('unit', 'Unit found', 'Unit', {
      Identified: ['A unit was identified.', 'A potential unit was identified.'],
      'Pending approval': ['A unit is pending approval.', 'A unit was identified and is pending approval.'],
      Secured: ['A unit was secured.', 'A unit has been secured.'],
    }),
    simple('barrier', 'Barrier', 'Barrier', {
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
    simple('work', 'Application work', 'Application', {
      Started: ['The housing application was started.', 'A housing application was started.'],
      Completed: ['The housing application was completed.', 'The housing application has been completed.'],
      Submitted: ['The housing application was submitted.', 'The housing application has been submitted.'],
      Updated: ['The housing application was updated.', 'Updates were made to the housing application.'],
    }),
    simple('status', 'Status', 'Application status', {
      Pending: ['The housing application is pending.', 'The housing application remains pending.'],
      Approved: ['The housing application was approved.', 'The housing application has been approved.'],
      Denied: ['The housing application was denied.', 'The housing application has been denied.'],
      Waitlisted: [`The ${TERMS.client} was placed on the waitlist.`, 'The housing application is waitlisted.'],
      Withdrawn: ['The housing application was withdrawn.', 'The housing application has been withdrawn.'],
    }),
    documents('application'),
    communication('property', 'Property contact', 'property'),
    simple('appointment', 'Appointment', 'Appointment', {
      Scheduled: ['An application appointment was scheduled.', 'An appointment for the application was scheduled.'],
      Attended: ['The application appointment was attended.', 'The appointment for the application took place.'],
      Missed: ['The application appointment was missed.', 'The appointment for the application was missed.'],
      Rescheduled: ['The application appointment was rescheduled.', 'The appointment for the application was rescheduled.'],
    }),
    simple('barrier', 'Barrier', 'Barrier', {
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
    simple('rent', 'Rent', 'Rent', {
      Current: ['Rent is current.', 'Rent remains current.'],
      Late: ['Rent is late.', 'Rent is currently late.'],
      'Balance owed': ['A rent balance is owed.', `${TERMS.Client} has a rent balance owed.`],
      'Payment plan': ['A rent payment plan is in place.', `${TERMS.Client} is on a rent payment plan.`],
      Resolved: ['The rent issue has been resolved.', 'The rent issue is resolved.'],
    }),
    simple('maintenance', 'Maintenance', 'Maintenance', {
      Reported: ['A maintenance issue was reported to the landlord.', 'A maintenance request was reported.'],
      'Followed up': ['The maintenance request was followed up on.', 'Follow-up was made on the maintenance request.'],
      Scheduled: ['The maintenance repair was scheduled.', 'A maintenance repair has been scheduled.'],
      Completed: ['The maintenance repair was completed.', 'The maintenance request has been completed.'],
      Unresolved: ['The maintenance issue remains unresolved.', 'The maintenance issue is unresolved.'],
    }),
    simple('lease', 'Lease', 'Lease', {
      Reviewed: ['The lease was reviewed.', 'Lease terms were reviewed.'],
      Signed: ['The lease was signed.', 'The lease has been signed.'],
      'Renewal due': ['The lease is due for renewal.', 'A lease renewal is due.'],
      Issue: ['A lease issue was identified.', 'An issue with the lease was identified.'],
    }),
    simple('complaint', 'Complaint', 'Complaint', {
      Received: ['A complaint was received.', 'A complaint has been received.'],
      Discussed: ['The complaint was discussed.', 'The complaint was addressed.'],
      Ongoing: ['The complaint is ongoing.', 'The complaint remains open.'],
      Resolved: ['The complaint was resolved.', 'The complaint has been resolved.'],
    }),
    simple('accommodation', 'Accommodation', 'Accommodation', {
      Requested: ['A reasonable accommodation was requested.', 'An accommodation request was made.'],
      Pending: ['The accommodation request is pending.', 'The accommodation request remains pending.'],
      Approved: ['The accommodation request was approved.', 'The accommodation request has been approved.'],
      Denied: ['The accommodation request was denied.', 'The accommodation request has been denied.'],
    }),
    simple('movein', 'Move-in', 'Move-in', {
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
    simple('application', 'Application', 'Voucher application', {
      Started: ['The voucher application was started.', 'A voucher application was started.'],
      Submitted: ['The voucher application was submitted.', 'The voucher application has been submitted.'],
      Pending: ['The voucher application is pending.', 'The voucher application remains pending.'],
      Approved: ['The voucher application was approved.', 'The voucher application has been approved.'],
      Denied: ['The voucher application was denied.', 'The voucher application has been denied.'],
    }),
    documents('voucher'),
    communication('authority', 'Housing authority', 'housing authority'),
    simple('search', 'Housing search', 'Housing search', {
      Ongoing: ['The voucher housing search is ongoing.', 'The search for a voucher unit continues.'],
      'Unit identified': ['A unit was identified for the voucher.', 'A voucher unit was identified.'],
      Paused: ['The voucher housing search is paused.', 'The search for a voucher unit has been paused.'],
    }),
    simple('extension', 'Extension', 'Extension', {
      Requested: ['A voucher extension was requested.', 'An extension of the voucher was requested.'],
      Pending: ['The voucher extension request is pending.', 'The extension request remains pending.'],
      Approved: ['The voucher extension was approved.', 'The extension of the voucher was approved.'],
      Denied: ['The voucher extension was denied.', 'The extension of the voucher was denied.'],
    }),
    simple('inspection', 'Inspection', 'Inspection', {
      Scheduled: ['The unit inspection was scheduled.', 'A unit inspection has been scheduled.'],
      Passed: ['The unit passed inspection.', 'The unit inspection was passed.'],
      Failed: ['The unit failed inspection.', 'The unit did not pass inspection.'],
      Pending: ['The unit inspection is pending.', 'The inspection remains pending.'],
    }),
    simple('status', 'Status', 'Voucher status', {
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
    simple('notice', 'Notice', 'Notice', {
      Received: ['A recertification notice was received.', 'The recertification notice has been received.'],
      Reviewed: ['The recertification notice was reviewed.', 'The recertification notice was gone over.'],
    }),
    documents('recertification'),
    simple('submission', 'Submission', 'Submission', {
      Submitted: ['The recertification was submitted.', 'The recertification has been submitted.'],
      Pending: ['The recertification submission is pending.', 'Submission of the recertification is pending.'],
      'Not yet submitted': ['The recertification has not yet been submitted.', 'The recertification is not yet submitted.'],
    }),
    simple('deadline', 'Deadline', 'Deadline', {
      Upcoming: ['The recertification deadline is upcoming.', 'A recertification deadline is approaching.'],
      Met: ['The recertification deadline was met.', 'The recertification was completed by the deadline.'],
      Missed: ['The recertification deadline was missed.', 'The recertification deadline has passed.'],
    }),
    simple('lease', 'Lease renewal', 'Lease renewal', {
      Pending: ['The lease renewal is pending.', 'Lease renewal remains pending.'],
      Completed: ['The lease renewal was completed.', 'The lease has been renewed.'],
      Issue: ['An issue with the lease renewal was identified.', 'The lease renewal has an issue.'],
    }),
    simple('subsidy', 'Subsidy renewal', 'Subsidy renewal', {
      Pending: ['The subsidy renewal is pending.', 'Subsidy renewal remains pending.'],
      Completed: ['The subsidy renewal was completed.', 'The subsidy has been renewed.'],
      Issue: ['An issue with the subsidy renewal was identified.', 'The subsidy renewal has an issue.'],
    }),
    simple('status', 'Status', 'Recertification status', {
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
    label: 'Benefit type (optional)',
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
      questions: [{ key: 'v', label: 'Application', options: ['Started', 'Submitted', 'Pending', 'Approved', 'Denied'] }],
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
      questions: [{ key: 'v', label: 'Eligibility', options: ['Reviewed', 'Eligible', 'Not eligible', 'Pending'] }],
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

const NEEDS: Record<string, { noun: string; plural?: boolean }> = {
  Food: { noun: 'food' },
  Clothing: { noun: 'clothing' },
  Furniture: { noun: 'furniture' },
  Utilities: { noun: 'utilities', plural: true },
  Transportation: { noun: 'transportation' },
  'Phone/internet': { noun: 'phone/internet service' },
  'Household items': { noun: 'household items', plural: true },
  Identification: { noun: 'identification' },
  Other: { noun: 'other basic needs', plural: true },
};

const basicNeeds: Topic = {
  id: 'basic_needs',
  label: 'Basic needs',
  touchpointType: 'basic_needs',
  purpose: 'basic needs',
  items: Object.entries(NEEDS).map(([label, { noun, plural }]) => ({
    id: label.toLowerCase().replace(/[^a-z]+/g, '_'),
    label,
    questions: [
      { key: 'v', label: 'Assistance', options: ['Discussed', 'Resource provided', 'Referral made', 'Application completed', 'Obtained', 'Pending'] },
    ],
    say: (a: Answers, v: number) => {
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

const CARE_PARTIES: Record<string, string> = {
  MCO: `the ${TERMS.client}'s MCO`,
  'Medical provider': 'a medical provider',
  'Behavioral health': 'a behavioral health provider',
  'Housing provider': 'a housing provider',
  Shelter: 'the shelter',
  'Housing authority': 'the housing authority',
  'Benefits agency': 'the benefits agency',
  'Family/support': `the ${TERMS.client}'s family or support person`,
  Other: 'another party',
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
  items: Object.keys(CARE_PARTIES).map((label) => ({
    id: label.toLowerCase().replace(/[^a-z]+/g, '_'),
    label,
    questions: [
      { key: 'purpose', label: 'Purpose', options: Object.keys(CARE_PURPOSES) },
      { key: 'result', label: 'Result', options: Object.keys(CARE_RESULTS) },
    ],
    say: (a: Answers, v: number) => {
      const party = CARE_PARTIES[label];
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
  items: Object.keys(LEGAL_ISSUES).map((label) => ({
    id: label.toLowerCase().replace(/[^a-z]+/g, '_'),
    label,
    questions: [{ key: 'actions', label: `${TERMS.cm} action`, options: Object.keys(LEGAL_ACTIONS), multi: true }],
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
    simple('option', 'Discussed option', 'Option', {
      Discussed: ['Supportive housing was discussed as an option.', 'Supportive housing options were discussed.'],
    }),
    simple('referral', 'Referral', 'Referral', {
      Made: ['A referral for supportive housing was made.', 'A supportive housing referral was made.'],
      Pending: ['The supportive housing referral is pending.', 'The supportive housing referral remains pending.'],
      Accepted: ['The supportive housing referral was accepted.', 'The supportive housing referral has been accepted.'],
      Declined: ['The supportive housing referral was declined.', 'The supportive housing referral has been declined.'],
    }),
    simple('application', 'Application', 'Application', {
      Started: ['A supportive housing application was started.', 'The supportive housing application was started.'],
      Submitted: ['The supportive housing application was submitted.', 'The supportive housing application has been submitted.'],
      Pending: ['The supportive housing application is pending.', 'The supportive housing application remains pending.'],
      Approved: ['The supportive housing application was approved.', 'The supportive housing application has been approved.'],
      Denied: ['The supportive housing application was denied.', 'The supportive housing application has been denied.'],
    }),
    simple('eligibility', 'Eligibility', 'Eligibility', {
      Reviewed: ['Eligibility for supportive housing was reviewed.', 'Supportive housing eligibility was reviewed.'],
      Eligible: [`${TERMS.Client} is eligible for supportive housing.`, 'Eligibility for supportive housing was confirmed.'],
      'Not eligible': [`${TERMS.Client} is not eligible for supportive housing.`, `${TERMS.Client} was found not eligible for supportive housing.`],
      Pending: ['Eligibility for supportive housing is pending.', 'The supportive housing eligibility determination is pending.'],
    }),
    simple('assessment', 'Assessment', 'Assessment', {
      Scheduled: ['A supportive housing assessment was scheduled.', 'An assessment for supportive housing was scheduled.'],
      Completed: ['The supportive housing assessment was completed.', 'The assessment for supportive housing was completed.'],
      Pending: ['The supportive housing assessment is pending.', 'The assessment for supportive housing is pending.'],
    }),
    simple('interview', 'Interview', 'Interview', {
      Scheduled: ['A supportive housing interview was scheduled.', 'An interview for supportive housing was scheduled.'],
      Completed: ['The supportive housing interview was completed.', 'The interview for supportive housing took place.'],
      Missed: ['The supportive housing interview was missed.', 'The interview for supportive housing was missed.'],
    }),
    simple('status', 'Status', 'Status', {
      Pending: ['Supportive housing status is pending.', 'The supportive housing status remains pending.'],
      Waitlisted: [`The ${TERMS.client} is waitlisted for supportive housing.`, 'The supportive housing application is waitlisted.'],
      Approved: ['Supportive housing was approved.', 'Supportive housing has been approved.'],
      Denied: ['Supportive housing was denied.', 'Supportive housing has been denied.'],
    }),
    simple('placement', 'Placement', 'Placement', {
      Offered: ['A supportive housing placement was offered.', 'A placement was offered.'],
      Accepted: ['The supportive housing placement was accepted.', 'The placement was accepted.'],
      Declined: ['The supportive housing placement was declined.', 'The placement was declined.'],
      Pending: ['The supportive housing placement is pending.', 'The placement remains pending.'],
    }),
    simple('movein', 'Move-in', 'Move-in', {
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
  items: Object.keys(CRISIS_EVENTS).map((label) => ({
    id: label.toLowerCase().replace(/[^a-z]+/g, '_'),
    label,
    questions: [
      { key: 'status', label: 'Current status', options: Object.keys(CRISIS_STATUS) },
      { key: 'actions', label: `${TERMS.cm} action`, options: Object.keys(CRISIS_ACTIONS), multi: true, optional: true },
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
  items: [other('Other matters were addressed.')],
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
];

export const topicById = (id: string) => TOPICS.find((t) => t.id === id);

// ---- what CM did --------------------------------------------------------

export interface ActionGroup {
  id: string;
  label: string;
  /** Second-level choices, with how each reads after the verb. */
  options: Record<string, string>;
  /** The sentence for the chosen phrases. */
  say: (phrases: string[], v: number) => string;
}

export const ACTIONS: ActionGroup[] = [
  {
    id: 'reviewed',
    label: 'Reviewed',
    options: { Documents: 'documents', Application: 'the application', Lease: 'the lease', Benefits: 'benefits', 'Housing plan': 'the housing plan', 'Next steps': 'next steps' },
    say: (p, v) => choose(v, [`${TERMS.cm} reviewed ${joinList(p)}.`, `${TERMS.cm} went over ${joinList(p)}.`]),
  },
  {
    id: 'assisted',
    label: 'Assisted',
    options: { Application: 'the application', Documents: 'documents', 'Phone call': 'a phone call', Scheduling: 'scheduling', 'Housing search': 'the housing search' },
    say: (p, v) =>
      choose(v, [
        `${TERMS.cm} assisted the ${TERMS.client} with ${joinList(p)}.`,
        `${TERMS.cm} supported the ${TERMS.client} with ${joinList(p)}.`,
      ]),
  },
  {
    id: 'contacted',
    label: 'Contacted',
    options: { Landlord: 'the landlord', Property: 'the property', 'Housing authority': 'the housing authority', Provider: 'the provider', 'Benefits agency': 'the benefits agency', MCO: `the ${TERMS.client}'s MCO` },
    say: (p, v) => choose(v, [`${TERMS.cm} contacted ${joinList(p)}.`, `${TERMS.cm} reached out to ${joinList(p)}.`]),
  },
  {
    id: 'provided',
    label: 'Provided',
    options: { Information: 'information', Resource: 'a resource', Education: 'education', Documentation: 'documentation' },
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
    label: 'Referred',
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
    label: 'Coordinated',
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
    label: 'Advocated',
    options: { 'With landlord': 'the landlord', 'With housing authority': 'the housing authority', 'With provider': 'the provider', 'With benefits agency': 'the benefits agency' },
    say: (p, v) =>
      choose(v, [`${TERMS.cm} advocated on the ${TERMS.client}'s behalf with ${joinList(p)}.`, `${TERMS.cm} advocated with ${joinList(p)} on the ${TERMS.client}'s behalf.`]),
  },
  {
    id: 'followed_up',
    label: 'Followed up',
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
  Barrier: [],
  'Unable to complete': [`${TERMS.cm} was unable to complete the task at this time.`, 'The task could not be completed at this time.'],
};

export const BARRIERS: Record<string, string> = {
  'Missing documents': 'missing documents',
  'Waiting on third party': 'waiting on a third party',
  Eligibility: 'eligibility',
  Cost: 'cost',
  Transportation: 'transportation',
  Availability: 'availability',
  'Consumer unavailable': `the ${TERMS.client} was unavailable`,
  'Consumer declined': `the ${TERMS.client} declined`,
  Other: '',
};

export const RESPONSES: Record<string, string[]> = {
  'Agreed with plan': [`${TERMS.Client} agreed with the plan.`, `${TERMS.Client} agreed to the plan.`],
  'Requested help': [`${TERMS.Client} requested assistance.`, `${TERMS.Client} asked for assistance.`],
  'Declined help': [`${TERMS.Client} declined assistance.`, `${TERMS.Client} declined the assistance offered.`],
  'Has questions': [`${TERMS.Client} had questions.`, `${TERMS.Client} asked questions.`],
  Concerned: [`${TERMS.Client} expressed concern.`, `${TERMS.Client} voiced concern.`],
  'No additional needs': [`${TERMS.Client} reported no additional needs.`, `${TERMS.Client} reported no further needs at this time.`],
  Other: [],
};

export const NEXT_WHO = ['CM', 'Consumer', 'Both', 'Third party', 'None'] as const;

export const NEXT_CM: Record<string, string> = {
  'Follow up': 'follow up',
  'Contact agency/provider': 'contact the agency or provider',
  'Contact landlord/property': 'contact the landlord or property',
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
  'Contact provider/agency': 'contact the provider or agency',
  'Contact landlord/property': 'contact the landlord or property',
  'Make payment': 'make a payment',
  'Review options': 'review options',
  Other: '',
};

export const NEXT_THIRD: Record<string, string> = {
  Respond: 'a response from the third party',
  'Make a decision': 'a decision from the third party',
  'Process application': 'processing of the application',
  Schedule: 'scheduling by the third party',
  Other: '',
};

export const TIMING: Record<string, string> = {
  '2–3 days': 'within 2–3 days',
  '1 week': 'within one week',
  '2 weeks': 'within two weeks',
  'Next scheduled contact': 'at the next scheduled contact',
  'After third-party response': 'after a response is received',
  'Specific date': '',
};

// ---- how the contact happened ---------------------------------------------

/** "CM ___ regarding …" for each contact method. */
export const METHOD_PHRASES: Record<string, string[]> = {
  in_person: [`met with the ${TERMS.client} in person`, `met in person with the ${TERMS.client}`],
  phone: [`spoke with the ${TERMS.client} by phone`, `had a phone contact with the ${TERMS.client}`],
  text: [`communicated with the ${TERMS.client} by text`, `exchanged text messages with the ${TERMS.client}`],
  email: [`corresponded with the ${TERMS.client} by email`, `communicated with the ${TERMS.client} by email`],
  virtual: [`met with the ${TERMS.client} by video`, `had a video contact with the ${TERMS.client}`],
  other: [`had contact with the ${TERMS.client}`, `was in contact with the ${TERMS.client}`],
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
