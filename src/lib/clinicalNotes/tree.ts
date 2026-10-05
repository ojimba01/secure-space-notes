// The note builder’s answer tree: every answer is a button, nothing is typed.
//
// Categories organize the screen and never write note text. Only the specific
// answers beneath them do, and each writes one definite statement. A question
// appears only when an answer above it calls for it ("What is the application
// status?" after an application activity), and some are asked once per picked
// item (each document, each need, each party, each situation).

import { joinList } from './config';

/** One picked item or answer → the sentence it writes. "" writes nothing (it adds nothing new). */
export type Says = Record<string, string>;

export interface TreeQuestion {
  id: string;
  ask: string;
  /** Pick several. */
  multi?: boolean;
  /** Can be left unanswered. */
  optional?: boolean;
  /** Asked when any of these items is picked (any item, when not given). */
  when?: string[];
  /** Asked only when this question has this answer. */
  whenAnswer?: { q: string; is: string };
  /** Asked once for each picked item (limited to `items` when given)… */
  perItem?: boolean;
  items?: string[];
  /** …or once for each answer picked in another question (each document). */
  perAnswerOf?: string;
  /** Each answer’s sentence. In a per-item question, {x} is the item’s phrase. */
  says?: Says;
  /** Or: the answers read as phrases joined into one sentence. */
  phrases?: Record<string, string>;
  sentence?: (joined: string, count: number) => string;
}

export interface TreeItem {
  id: string;
  label: string;
  /** The item’s own sentence ("" when its questions say it all). */
  say: string;
  /** How the item reads inside a per-item sentence ({x}). */
  phrase?: string;
}

export interface Category {
  id: string;
  label: string;
  ask: string;
  items: TreeItem[];
  questions: TreeQuestion[];
}

const CM = 'CM';
const it = (id: string, label: string, say: string, phrase?: string): TreeItem => ({ id, label, say, phrase });

// ---- 1. Housing assistance ---------------------------------------------------

const housingAssistance: Category = {
  id: 'housing_assistance',
  label: 'Housing assistance',
  ask: 'What housing assistance did CM provide?',
  items: [
    it('search', 'Searched for available housing', `${CM} searched for available housing.`),
    it('listings_review', 'Reviewed housing listings', `${CM} reviewed housing listings.`),
    it('listings_share', 'Shared housing listings', `${CM} shared housing listings with the member.`),
    it('property_contact', 'Contacted a property about availability', `${CM} contacted a property about availability.`),
    it('viewing_schedule', 'Scheduled a property viewing', `${CM} scheduled a property viewing.`),
    it('viewing_attend', 'Attended a property viewing', `${CM} attended a property viewing.`),
    it('app_assist', 'Assisted with a housing application', `${CM} assisted the member with a housing application.`),
    it('app_submit', 'Submitted a housing application', `${CM} submitted a housing application.`),
    it('app_follow', 'Followed up on a housing application', `${CM} followed up on a housing application.`),
    it('voucher_assist', 'Assisted with a voucher application', `${CM} assisted the member with a voucher application.`),
    it('voucher_follow', 'Followed up on a voucher', `${CM} followed up on a voucher.`),
    it('sh_discuss', 'Discussed supportive housing', `${CM} discussed supportive housing with the member.`),
    it('sh_referral', 'Made a supportive housing referral', `${CM} made a supportive housing referral.`),
  ],
  questions: [
    {
      id: 'search_status',
      ask: 'What is the search status?',
      when: ['search', 'listings_review', 'listings_share', 'property_contact'],
      says: {
        Started: 'The housing search has started.',
        Ongoing: 'The housing search is ongoing.',
        Paused: 'The housing search is paused.',
        'Unit identified': 'A unit has been identified.',
        'Unit secured': 'A unit has been secured.',
      },
    },
    {
      id: 'viewing_status',
      ask: 'What is the viewing status?',
      when: ['viewing_schedule', 'viewing_attend'],
      says: {
        Scheduled: 'The property viewing is scheduled.',
        Completed: 'The property viewing was completed.',
        Missed: 'The property viewing was missed.',
        Rescheduled: 'The property viewing was rescheduled.',
      },
    },
    {
      id: 'app_status',
      ask: 'What is the application status?',
      when: ['app_assist', 'app_submit', 'app_follow'],
      says: {
        Started: 'The housing application has been started.',
        Completed: 'The housing application has been completed.',
        Submitted: 'The housing application has been submitted.',
        Pending: 'The housing application is pending.',
        Approved: 'The housing application was approved.',
        Denied: 'The housing application was denied.',
        Waitlisted: 'The member is waitlisted for the housing application.',
        Withdrawn: 'The housing application was withdrawn.',
      },
    },
    {
      id: 'voucher_status',
      ask: 'What is the voucher status?',
      when: ['voucher_assist', 'voucher_follow'],
      says: {
        'Application started': 'The voucher application has been started.',
        'Application submitted': 'The voucher application has been submitted.',
        Pending: 'The voucher is pending.',
        Issued: 'The voucher has been issued.',
        Active: 'The voucher is active.',
        Expired: 'The voucher has expired.',
        Denied: 'The voucher was denied.',
      },
    },
    {
      id: 'referral_status',
      ask: 'What is the referral status?',
      when: ['sh_referral'],
      says: {
        Made: '',
        Pending: 'The supportive housing referral is pending.',
        Accepted: 'The supportive housing referral was accepted.',
        Declined: 'The supportive housing referral was declined.',
      },
    },
  ],
};

// ---- 2. Housing stability ----------------------------------------------------

const housingStability: Category = {
  id: 'housing_stability',
  label: 'Housing stability',
  ask: 'What housing stability activity took place?',
  items: [
    it('hsp_review', 'Reviewed the housing stabilization plan', `${CM} reviewed the housing stabilization plan.`),
    it('hsp_update', 'Updated the housing stabilization plan', `${CM} updated the housing stabilization plan.`),
    it('goal_progress', 'Reviewed progress toward a housing goal', `${CM} reviewed progress toward a housing goal with the member.`),
    it('barrier', 'Identified a housing barrier', `${CM} identified a housing barrier.`),
    it('rent', 'Discussed a rent balance', `${CM} discussed a rent balance with the member.`),
    it('payment_plan', 'Discussed a payment plan', `${CM} discussed a payment plan with the member.`),
    it('utility', 'Addressed a utility issue', `${CM} addressed a utility issue.`),
    it('safety', 'Completed a home safety check', `${CM} completed a home safety check.`),
    it('concern', 'Followed up on a housing concern', `${CM} followed up on a housing concern.`),
  ],
  questions: [
    {
      id: 'rent_status',
      ask: 'What is the rent status?',
      when: ['rent', 'payment_plan'],
      says: {
        Current: 'Rent is current.',
        Late: 'Rent is late.',
        'Balance owed': 'A rent balance is owed.',
        'Payment plan in place': 'A rent payment plan is in place.',
        'Balance resolved': 'The rent balance has been resolved.',
      },
    },
    {
      id: 'utility_status',
      ask: 'What is the utility status?',
      when: ['utility'],
      says: {
        Current: 'Utilities are current.',
        'Past due': 'The utility account is past due.',
        'Shutoff notice received': 'A utility shutoff notice was received.',
        Disconnected: 'Utility service is disconnected.',
        'Service restored': 'Utility service has been restored.',
      },
    },
    {
      id: 'safety_outcome',
      ask: 'What was the outcome?',
      when: ['safety'],
      says: {
        'No concern identified': 'No home safety concern was identified.',
        'Concern identified': 'A home safety concern was identified.',
        'Follow-up needed': 'Home safety follow-up is needed.',
        'Check not completed': 'The home safety check was not completed.',
      },
    },
    {
      id: 'safety_type',
      ask: 'What type of concern?',
      multi: true,
      whenAnswer: { q: 'safety_outcome', is: 'Concern identified' },
      phrases: { Repairs: 'repairs', Heat: 'heat', Water: 'water', Power: 'power', Pests: 'pests', Accessibility: 'accessibility', Safety: 'safety' },
      sentence: (l) => `The concern involves ${l}.`,
    },
    {
      id: 'concern_status',
      ask: 'What is the concern\'s status?',
      when: ['concern'],
      says: {
        New: 'The housing concern is new.',
        Ongoing: 'The housing concern is ongoing.',
        Improved: 'The housing concern has improved.',
        Resolved: 'The housing concern has been resolved.',
        Worsened: 'The housing concern has worsened.',
      },
    },
  ],
};

// ---- 3. Lease and tenancy -----------------------------------------------------

const contactStatus = (party: string): Says => ({
  Contacted: '',
  'Response received': `A response was received from the ${party}.`,
  'No response': `No response has been received from the ${party}.`,
  'Follow-up needed': `Follow-up with the ${party} is needed.`,
});

const leaseTenancy: Category = {
  id: 'lease_tenancy',
  label: 'Lease and tenancy',
  ask: 'What lease or tenancy activity took place?',
  items: [
    it('lease_review', 'Reviewed lease terms', `${CM} reviewed lease terms with the member.`),
    it('lease_sign', 'Supported lease signing', `${CM} supported the member with lease signing.`),
    it('renewal', 'Discussed lease renewal', `${CM} discussed lease renewal with the member.`),
    it('rights', 'Provided tenant rights education', `${CM} provided tenant rights education.`),
    it('landlord', 'Contacted the landlord', `${CM} contacted the landlord.`),
    it('pm', 'Contacted the property manager', `${CM} contacted the property manager.`),
    it('maint', 'Discussed a maintenance concern', `${CM} discussed a maintenance concern with the member.`),
    it('accom_req', 'Requested an accommodation', `${CM} requested an accommodation on the member's behalf.`),
    it('accom_follow', 'Followed up on an accommodation request', `${CM} followed up on an accommodation request.`),
  ],
  questions: [
    {
      id: 'lease_status',
      ask: 'What is the lease status?',
      when: ['lease_review', 'lease_sign', 'renewal'],
      says: {
        'Under review': 'The lease is under review.',
        Signed: 'The lease has been signed.',
        'Renewal due': 'Lease renewal is due.',
        'Renewal completed': 'Lease renewal has been completed.',
        'Issue identified': 'An issue with the lease was identified.',
      },
    },
    {
      id: 'rights_topic',
      ask: 'What topic did CM cover?',
      multi: true,
      when: ['rights'],
      // Education about rights, never legal advice.
      phrases: {
        'Lease terms': 'lease terms',
        'Rent responsibilities': 'rent responsibilities',
        'Maintenance requests': 'maintenance requests',
        'Eviction notices': 'eviction notices',
        'Accommodation requests': 'accommodation requests',
      },
      sentence: (l) => `The education covered ${l}.`,
    },
    { id: 'landlord_status', ask: 'What happened with the landlord?', when: ['landlord'], says: contactStatus('landlord') },
    { id: 'pm_status', ask: 'What happened with the property manager?', when: ['pm'], says: contactStatus('property manager') },
    {
      id: 'maint_status',
      ask: 'What is the maintenance status?',
      when: ['maint'],
      says: {
        Reported: 'The maintenance concern has been reported.',
        'Followed up': 'The maintenance concern was followed up on.',
        'Repair scheduled': 'A repair has been scheduled.',
        'Repair completed': 'The repair has been completed.',
        Unresolved: 'The maintenance concern is unresolved.',
      },
    },
    {
      id: 'accom_status',
      ask: 'What is the request status?',
      when: ['accom_req', 'accom_follow'],
      says: {
        Requested: '',
        Pending: 'The accommodation request is pending.',
        Approved: 'The accommodation request was approved.',
        Denied: 'The accommodation request was denied.',
      },
    },
  ],
};

// ---- 4. Move-in support -------------------------------------------------------

const moveIn: Category = {
  id: 'move_in_support',
  label: 'Move-in support',
  ask: 'What move-in support did CM provide?',
  items: [
    it('date', 'Coordinated a move-in date', `${CM} coordinated a move-in date.`),
    it('landlord', 'Contacted the landlord about move-in', `${CM} contacted the landlord about move-in.`),
    it('pm', 'Contacted the property manager about move-in', `${CM} contacted the property manager about move-in.`),
    it('reqs', 'Reviewed move-in requirements', `${CM} reviewed move-in requirements with the member.`),
    it('inspection', 'Coordinated a unit inspection', `${CM} coordinated a unit inspection.`),
    it('resources', 'Assisted with move-in resources', `${CM} assisted the member with move-in resources.`),
    it('delay', 'Followed up on a move-in delay', `${CM} followed up on a move-in delay.`),
  ],
  questions: [
    {
      id: 'movein_status',
      ask: 'What is the move-in status?',
      says: {
        'Not yet scheduled': 'Move-in is not yet scheduled.',
        Scheduled: 'Move-in is scheduled.',
        Completed: 'Move-in has been completed.',
        Delayed: 'Move-in is delayed.',
      },
    },
    {
      id: 'inspection_status',
      ask: 'What is the inspection status?',
      when: ['inspection'],
      says: {
        Scheduled: 'The unit inspection is scheduled.',
        Pending: 'The unit inspection is pending.',
        Passed: 'The unit passed inspection.',
        Failed: 'The unit failed inspection.',
      },
    },
  ],
};

// ---- 5. Benefits and documents ------------------------------------------------

const DOCS: Record<string, string> = {
  'Photo ID': 'Photo ID',
  'Birth certificate': 'The birth certificate',
  'Income verification': 'Income verification',
  'Benefits verification': 'Benefits verification',
  'Bank statement': 'The bank statement',
  'Rental history': 'Rental history',
  'Disability documentation': 'Disability documentation',
};

const benefitsDocs: Category = {
  id: 'benefits_docs',
  label: 'Benefits and documents',
  ask: 'What assistance did CM provide?',
  items: [
    it('benefits_review', 'Reviewed benefits status', `${CM} reviewed the member's benefits status.`),
    it('benefits_assist', 'Assisted with a benefits application', `${CM} assisted the member with a benefits application.`),
    it('benefits_submit', 'Submitted a benefits application', `${CM} submitted a benefits application.`),
    it('agency', 'Contacted a benefits agency', `${CM} contacted a benefits agency.`),
    it('recert_assist', 'Assisted with recertification', `${CM} assisted the member with recertification.`),
    it('recert_notice', 'Reviewed a recertification notice', `${CM} reviewed a recertification notice.`),
    it('docs_gather', 'Gathered documents', `${CM} gathered documents.`),
    it('docs_submit', 'Submitted documents', `${CM} submitted documents.`),
    it('docs_follow', 'Followed up on missing documents', `${CM} followed up on missing documents.`),
  ],
  questions: [
    {
      id: 'benefit_types',
      ask: 'Which benefit was involved?',
      multi: true,
      optional: true,
      when: ['benefits_review', 'benefits_assist', 'benefits_submit', 'agency', 'recert_assist', 'recert_notice'],
      phrases: { SSI: 'SSI', SSDI: 'SSDI', SNAP: 'SNAP', WFNJ: 'WFNJ', Medicaid: 'Medicaid', 'Unemployment benefits': 'unemployment benefits' },
      sentence: (l, n) => `The ${n === 1 ? 'benefit involved was' : 'benefits involved were'} ${l}.`,
    },
    {
      id: 'doc_types',
      ask: 'Which document was involved?',
      multi: true,
      optional: true,
      when: ['docs_gather', 'docs_submit', 'docs_follow', 'benefits_assist', 'benefits_submit', 'recert_assist'],
      phrases: Object.fromEntries(Object.keys(DOCS).map((d) => [d, ''])),
    },
    {
      id: 'doc_status',
      ask: 'What is this document\'s status?',
      perAnswerOf: 'doc_types',
      says: { Needed: '{X} is needed.', Gathered: '{X} has been gathered.', Submitted: '{X} has been submitted.', Missing: '{X} is missing.' },
    },
    {
      id: 'recert_status',
      ask: 'What is the recertification status?',
      when: ['recert_assist', 'recert_notice'],
      says: {
        'Notice received': 'A recertification notice was received.',
        'Documents needed': 'Documents are needed for recertification.',
        Submitted: 'The recertification has been submitted.',
        Pending: 'The recertification is pending.',
        Approved: 'The recertification was approved.',
        'Deadline missed': 'The recertification deadline was missed.',
        Completed: 'The recertification has been completed.',
      },
    },
  ],
};

/** How a picked document reads at the start of a sentence. */
export const DOC_SUBJECT = DOCS;

// ---- 6. Basic needs ---------------------------------------------------------

const basicNeeds: Category = {
  id: 'basic_needs',
  label: 'Basic needs',
  ask: 'What need did CM address?',
  // A need alone says nothing; what CM did about it does.
  items: [
    it('food', 'Food', '', 'food'),
    it('clothing', 'Clothing', '', 'clothing'),
    it('furniture', 'Furniture', '', 'furniture'),
    it('utilities', 'Utilities', '', 'utility'),
    it('transportation', 'Transportation', '', 'transportation'),
    it('phone', 'Phone', '', 'phone service'),
    it('internet', 'Internet', '', 'internet service'),
    it('household', 'Household items', '', 'household item'),
    it('identification', 'Identification', '', 'identification'),
  ],
  questions: [
    {
      id: 'need_action',
      ask: 'What did CM do?',
      multi: true,
      perItem: true,
      says: {
        'Discussed the need': `${CM} discussed {x} needs with the member.`,
        'Provided a resource': `${CM} provided a resource for {x}.`,
        'Made a referral': `${CM} made a referral for {x} assistance.`,
        'Assisted with an application': `${CM} assisted the member with an application for {x} assistance.`,
        'Confirmed assistance was obtained': `${CM} confirmed that {x} assistance was obtained.`,
        'Follow-up needed': 'Follow-up on {x} assistance is needed.',
      },
    },
    {
      id: 'transport_for',
      ask: 'What was the transportation needed for?',
      perItem: true,
      items: ['transportation'],
      says: {
        'Medical appointment': 'Transportation was needed for a medical appointment.',
        'Housing appointment': 'Transportation was needed for a housing appointment.',
        Employment: 'Transportation was needed for employment.',
        'Other appointment': 'Transportation was needed for another appointment.',
      },
    },
    {
      id: 'transport_help',
      ask: 'What transportation assistance was needed?',
      multi: true,
      perItem: true,
      items: ['transportation'],
      says: { 'Bus pass': 'A bus pass was needed.', 'Fare assistance': 'Fare assistance was needed.', 'Ride coordination': 'Ride coordination was needed.' },
    },
  ],
};

// ---- 7. Employment and finances ---------------------------------------------

const employmentFinances: Category = {
  id: 'employment_finances',
  label: 'Employment and finances',
  ask: 'What support did CM provide?',
  items: [
    it('emp_status', 'Discussed employment status', `${CM} discussed employment status with the member.`),
    it('emp_goals', 'Discussed employment goals', `${CM} discussed employment goals with the member.`),
    it('emp_resource', 'Shared an employment resource', `${CM} shared an employment resource.`),
    it('emp_referral', 'Made an employment referral', `${CM} made an employment referral.`),
    it('emp_app', 'Assisted with an employment application', `${CM} assisted the member with an employment application.`),
    it('budget', 'Reviewed a rent budget', `${CM} reviewed a rent budget with the member.`),
    it('expenses', 'Reviewed expenses', `${CM} reviewed expenses with the member.`),
    it('payplan', 'Discussed a payment plan', `${CM} discussed a payment plan with the member.`),
    it('fin_lit', 'Provided financial literacy coaching', `${CM} provided financial literacy coaching.`),
  ],
  questions: [
    {
      id: 'work_status',
      ask: 'What is the member\'s employment status?',
      when: ['emp_status'],
      says: {
        Working: 'The member is working.',
        'Seeking work': 'The member is seeking work.',
        'Not working': 'The member is not working.',
        'Started a job': 'The member started a job.',
        'Lost a job': 'The member lost a job.',
      },
    },
    {
      id: 'fin_topic',
      ask: 'What topic was covered?',
      multi: true,
      when: ['fin_lit'],
      phrases: { 'Understanding bills': 'understanding bills', 'Tracking expenses': 'tracking expenses', 'Planning payments': 'planning payments', 'Credit education': 'credit' },
      sentence: (l) => `The coaching covered ${l}.`,
    },
  ],
};

// ---- 8. Care coordination ----------------------------------------------------

const careCoordination: Category = {
  id: 'care_coordination',
  label: 'Care coordination',
  ask: 'Who did CM coordinate with?',
  items: [
    it('mco', 'MCO', '', 'the member\'s MCO'),
    it('housing_specialist', 'Housing specialist', '', 'the housing specialist'),
    it('housing_authority', 'Housing authority', '', 'the housing authority'),
    it('housing_provider', 'Housing provider', '', 'a housing provider'),
    it('medical', 'Medical provider', '', 'a medical provider'),
    it('behavioral', 'Behavioral health provider', '', 'a behavioral health provider'),
    it('shelter', 'Shelter', '', 'the shelter'),
    it('benefits_agency', 'Benefits agency', '', 'the benefits agency'),
    it('family', 'Family member', '', 'a family member'),
    it('support', 'Support person', '', 'the member\'s support person'),
  ],
  questions: [
    {
      id: 'purpose',
      ask: 'What was the purpose?',
      perItem: true,
      // "Contacted", not "coordinated": the outcome may be no response.
      says: {
        'Status update': `${CM} contacted {x} regarding a status update.`,
        Referral: `${CM} contacted {x} regarding a referral.`,
        Documentation: `${CM} contacted {x} regarding documentation.`,
        Appointment: `${CM} contacted {x} regarding an appointment.`,
        'Housing barrier': `${CM} contacted {x} regarding a housing barrier.`,
        'Discharge planning': `${CM} contacted {x} regarding discharge planning.`,
        'Service coordination': `${CM} contacted {x} regarding service coordination.`,
      },
    },
    {
      id: 'outcome',
      ask: 'What was the outcome?',
      perItem: true,
      says: {
        'Contact completed': 'Contact with {x} was completed.',
        'Response received': 'A response was received from {x}.',
        'No response': 'No response has been received from {x}.',
        Pending: 'The request to {x} is pending.',
        'Follow-up needed': 'Follow-up with {x} is needed.',
      },
    },
  ],
};

// ---- 9. Crisis support -----------------------------------------------------------

const crisisSupport: Category = {
  id: 'crisis_support',
  label: 'Crisis support',
  ask: 'What situation did CM address?',
  items: [
    it('eviction_risk', 'Risk of eviction', `${CM} addressed the risk of eviction.`, 'the risk of eviction'),
    it('eviction_notice', 'Eviction notice', `${CM} addressed an eviction notice.`, 'the eviction notice'),
    it('housing_loss', 'Housing loss', `${CM} addressed housing loss.`, 'the housing loss'),
    it('shutoff_risk', 'Utility shutoff risk', `${CM} addressed the risk of a utility shutoff.`, 'the utility shutoff risk'),
    it('disconnection', 'Utility disconnection', `${CM} addressed a utility disconnection.`, 'the utility disconnection'),
    it('unsafe', 'Unsafe housing condition', `${CM} addressed an unsafe housing condition.`, 'the unsafe housing condition'),
    it('discharge', 'Hospital discharge', `${CM} addressed a hospital discharge.`, 'the hospital discharge'),
    it('shelter_need', 'Shelter need', `${CM} addressed a shelter need.`, 'the shelter need'),
    it('safety', 'Immediate safety concern', `${CM} addressed an immediate safety concern.`, 'the immediate safety concern'),
    it('bh_event', 'Behavioral health event', `${CM} addressed a behavioral health event.`, 'the behavioral health event'),
  ],
  questions: [
    {
      id: 'crisis_action',
      ask: 'What did CM do?',
      multi: true,
      optional: true,
      perItem: true,
      says: {
        'Assessed immediate need': `${CM} assessed the member's immediate needs.`,
        'Confirmed current location': `${CM} confirmed the member's current location.`,
        'Contacted a provider': `${CM} contacted a provider.`,
        'Contacted the MCO': `${CM} contacted the member's MCO.`,
        'Connected the member to a resource': `${CM} connected the member to a resource.`,
        'Reviewed next steps': `${CM} reviewed next steps with the member.`,
        'Scheduled follow-up': `${CM} scheduled follow-up.`,
      },
    },
    {
      id: 'crisis_status',
      ask: 'What is the situation\'s current status?',
      perItem: true,
      says: { Ongoing: '{X} is ongoing.', Stabilized: '{X} has stabilized.', Resolved: '{X} has been resolved.' },
    },
    {
      id: 'crisis_support_needed',
      ask: 'What support is still needed?',
      perItem: true,
      optional: true,
      says: {
        'Temporary plan in place': 'A temporary plan is in place.',
        'Additional assistance needed': 'Additional assistance is needed.',
        'No further assistance identified': 'No further assistance was identified.',
      },
    },
  ],
};

// ---- 10. Other service ---------------------------------------------------------

export const NOT_LISTED = 'not_listed';

const otherService: Category = {
  id: 'other_service',
  label: 'Other service',
  ask: 'Which service?',
  items: [
    it('legal_ref', 'Legal resource referral', `${CM} made a legal resource referral.`),
    it('medical_ref', 'Medical resource referral', `${CM} made a medical resource referral.`),
    it('bh_ref', 'Behavioral health referral', `${CM} made a behavioral health referral.`),
    it('housing_ref', 'Housing program referral', `${CM} made a housing program referral.`),
    it('followup', 'Follow-up contact', `${CM} completed a follow-up contact.`),
    // Nothing is written for it: there is no honest sentence without a button.
    it(NOT_LISTED, 'Service not listed', ''),
  ],
  questions: [],
};

export const CATEGORIES: Category[] = [
  housingAssistance,
  housingStability,
  leaseTenancy,
  moveIn,
  benefitsDocs,
  basicNeeds,
  employmentFinances,
  careCoordination,
  crisisSupport,
  otherService,
];

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);

/** The touchpoint type each category records as. */
export const TOUCHPOINT_TYPE: Record<string, string> = {
  housing_assistance: 'housing_application',
  housing_stability: 'general_checkin',
  lease_tenancy: 'landlord_tenant',
  move_in_support: 'landlord_tenant',
  benefits_docs: 'benefits_income',
  basic_needs: 'basic_needs',
  employment_finances: 'benefits_income',
  care_coordination: 'care_coordination',
  crisis_support: 'crisis_followup',
  other_service: 'other',
};


// ---- 2–5. Goal, prompt, housing status, result ------------------------------

/** "This contact supported the member’s goal to ___." */
export const GOALS: Record<string, string> = {
  'Find housing': 'find housing',
  'Apply for housing': 'apply for housing',
  'Obtain a voucher': 'obtain a voucher',
  'Secure a unit': 'secure a unit',
  'Complete move-in': 'complete move-in',
  'Maintain current housing': 'maintain current housing',
  'Prevent housing loss': 'prevent housing loss',
  'Resolve a rent issue': 'resolve a rent issue',
  'Resolve a utility issue': 'resolve a utility issue',
  'Address a safety concern': 'address a safety concern',
  'Complete recertification': 'complete recertification',
  'Maintain benefits that support housing': 'maintain benefits that support housing',
  'Reduce a barrier to housing': 'reduce a barrier to housing',
  'Review progress on the housing stabilization plan': 'review progress on the housing stabilization plan',
};

/** "The contact was prompted by ___." */
export const PROMPTS: Record<string, string> = {
  'Scheduled follow-up': 'a scheduled follow-up',
  'Member requested assistance': 'the member\'s request for assistance',
  'Housing search update': 'a housing search update',
  'Application update': 'an application update',
  'Property viewing': 'a property viewing',
  'Lease deadline': 'a lease deadline',
  'Move-in preparation': 'move-in preparation',
  'Rent concern': 'a rent concern',
  'Utility concern': 'a utility concern',
  'Maintenance concern': 'a maintenance concern',
  'Housing notice received': 'a housing notice',
  'Recertification deadline': 'a recertification deadline',
  'Document request': 'a document request',
  'Benefits change': 'a benefits change',
  'Referral follow-up': 'referral follow-up',
  'Provider request': 'a provider request',
  'Landlord response': 'a response from the landlord',
  'Property manager response': 'a response from the property manager',
  'Change in employment': 'a change in employment',
  'Change in housing status': 'a change in housing status',
  'Crisis follow-up': 'crisis follow-up',
};

export const HOUSING: Record<string, string> = {
  'Stably housed': 'The member is stably housed.',
  'At risk of losing housing': 'The member is at risk of losing housing.',
  'Experiencing homelessness': 'The member is experiencing homelessness.',
  'Staying in a shelter': 'The member is staying in a shelter.',
  'Staying with family': 'The member is staying with family.',
  'Staying with friends': 'The member is staying with friends.',
  'In temporary housing': 'The member is in temporary housing.',
  'Transitioning into housing': 'The member is transitioning into housing.',
  'Status not confirmed': 'The member\'s housing status was not confirmed.',
};

export const HOUSING_CHANGE: Record<string, string> = {
  'No change': 'The member\'s housing status has not changed since the last contact.',
  Improved: 'The member\'s housing status has improved since the last contact.',
  Worsened: 'The member\'s housing status has worsened since the last contact.',
  'Changed, status unclear': 'The member\'s housing status has changed since the last contact, and the current status is unclear.',
  'Not assessed': 'Change in housing status since the last contact was not assessed.',
};

export const RESULT: Record<string, string> = {
  'Activity completed': 'The activity was completed.',
  'Progress made': 'Progress was made.',
  'Pending third-party response': 'The outcome is pending a third-party response.',
  'Pending member action': 'The outcome is pending action by the member.',
  'Follow-up needed': 'Follow-up is needed.',
  'No change': 'There was no change.',
  'Unable to complete': 'The activity could not be completed.',
};

/** "The activity could not be completed because ___." */
export const UNABLE_BECAUSE: Record<string, string> = {
  'Missing documents': 'documents were missing',
  'Member unavailable': 'the member was unavailable',
  'Member declined': 'the member declined',
  'Eligibility issue': 'of an eligibility issue',
  Cost: 'of cost',
  Transportation: 'of transportation',
  'Housing unavailable': 'housing was unavailable',
  'Third party unavailable': 'the third party was unavailable',
};

export const RESPONSE: Record<string, string> = {
  'Participated in the discussion': 'The member participated in the discussion.',
  'Agreed with the plan': 'The member agreed with the plan.',
  'Requested assistance': 'The member requested assistance.',
  'Asked questions': 'The member asked questions.',
  'Expressed concern': 'The member expressed concern.',
  'Declined assistance': 'The member declined assistance.',
  'Reported no additional needs': 'The member reported no additional needs.',
  'Response not observed': 'The member\'s response was not observed.',
};

/** Each barrier as it reads in a list; the two "none" answers stand alone. */
export const BARRIER: Record<string, string> = {
  'No barrier identified': '',
  'Financial barrier': 'a financial barrier',
  'Missing documents': 'missing documents',
  'Eligibility issue': 'an eligibility issue',
  'Limited housing availability': 'limited housing availability',
  'Transportation barrier': 'a transportation barrier',
  'Legal issue': 'a legal issue',
  'Housing safety issue': 'a housing safety issue',
  'Waiting for a third party': 'waiting for a third party',
  'Member unavailable': 'the member being unavailable',
  'Member declined assistance': 'the member declining assistance',
  'Barrier not assessed': '',
};
export const BARRIER_ALONE = ['No barrier identified', 'Barrier not assessed'];

// ---- 10. What happens next ---------------------------------------------------

/** Who is responsible → how they read at the start of a sentence. */
export const OWNER: Record<string, string> = {
  CM: 'CM',
  Member: 'The member',
  Landlord: 'The landlord',
  'Property manager': 'The property manager',
  'Housing authority': 'The housing authority',
  MCO: 'The member\'s MCO',
  'Housing specialist': 'The housing specialist',
  Provider: 'The provider',
  'Benefits agency': 'The benefits agency',
  'Family member': 'A family member',
};

export const OWNER_ACTIONS: Record<'CM' | 'Member' | 'Third party', Record<string, string>> = {
  CM: {
    'Follow up on application': 'follow up on the application',
    'Contact landlord': 'contact the landlord',
    'Contact property manager': 'contact the property manager',
    'Contact housing authority': 'contact the housing authority',
    'Submit documents': 'submit documents',
    'Research housing': 'research housing options',
    'Make referral': 'make a referral',
    'Schedule appointment': 'schedule an appointment',
    'Review housing plan': 'review the housing stabilization plan',
  },
  Member: {
    'Gather documents': 'gather documents',
    'Submit documents': 'submit documents',
    'Complete application': 'complete the application',
    'Attend appointment': 'attend the appointment',
    'Review housing options': 'review housing options',
    'Make payment': 'make a payment',
    'Contact provider': 'contact the provider',
  },
  'Third party': {
    Respond: 'respond',
    'Review request': 'review the request',
    'Process application': 'process the application',
    'Make a decision': 'make a decision',
    'Schedule appointment': 'schedule an appointment',
    'Complete repair': 'complete the repair',
  },
};
export const actionsFor = (owner: string) => OWNER_ACTIONS[owner === 'CM' || owner === 'Member' ? owner : 'Third party'];

export const STEP_TIMING: Record<string, string> = {
  'Within 2–3 days': ' within 2–3 days',
  'Within 1 week': ' within one week',
  'Within 2 weeks': ' within two weeks',
  'At next contact': ' at the next contact',
  'After third-party response': ' after a third-party response',
  'Date already scheduled': ' on the scheduled date',
  'Timing not confirmed': '',
};

export const NEXT_CONTACT: Record<string, string> = {
  'Within 2–3 days': 'Next contact is planned within 2–3 days.',
  'Within 1 week': 'Next contact is planned within one week.',
  'Within 2 weeks': 'Next contact is planned within two weeks.',
  'At scheduled appointment': 'Next contact is planned at the scheduled appointment.',
  'After third-party response': 'Next contact is planned after a third-party response.',
  'Not yet scheduled': 'Next contact is not yet scheduled.',
};

// ---- answers --------------------------------------------------------------------

export type TreeAnswers = Record<string, string | string[] | undefined>;

export interface TreeState {
  /** Categories opened, in the order picked. They write nothing. */
  categories: string[];
  /** Items picked under each category. */
  picks: Record<string, string[]>;
  /** Question answers, keyed by answerKey. */
  answers: TreeAnswers;
}

export const emptyTree = (): TreeState => ({ categories: [], picks: {}, answers: {} });

/** "cat.q", or "cat.q.item" for a question asked per item or per answer. */
export const answerKey = (cat: string, q: string, per?: string) => (per ? `${cat}.${q}.${per}` : `${cat}.${q}`);

const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** Each time a question is asked for these picks: [] when not asked, [undefined] when asked once. */
export function askedFor(c: Category, q: TreeQuestion, picks: string[], answers: TreeAnswers): (string | undefined)[] {
  if (!picks.length) return [];
  if (q.when && !q.when.some((w) => picks.includes(w))) return [];
  if (q.whenAnswer && answers[answerKey(c.id, q.whenAnswer.q)] !== q.whenAnswer.is) return [];
  if (q.perAnswerOf) return asList(answers[answerKey(c.id, q.perAnswerOf)]);
  if (q.perItem) return picks.filter((p) => !q.items || q.items.includes(p));
  return [undefined];
}

/** Whether every required question for a category is answered. */
export function categoryComplete(t: TreeState, catId: string): boolean {
  const c = categoryById(catId);
  const picks = t.picks[catId] ?? [];
  if (!c || !picks.length) return false;
  return c.questions.every((q) =>
    askedFor(c, q, picks, t.answers).every((per) => q.optional || asList(t.answers[answerKey(c.id, q.id, per)]).length > 0),
  );
}

const fill = (s: string, x: string) => s.replace('{x}', x).replace('{X}', x ? x[0].toUpperCase() + x.slice(1) : x);

/** The sentences a category’s answers write, in order: each item with its own questions, then the rest. */
export function categorySentences(t: TreeState, catId: string): string[] {
  const c = categoryById(catId);
  if (!c) return [];
  const picks = (t.picks[catId] ?? []).filter((p) => c.items.some((i) => i.id === p));
  const out: string[] = [];
  const ofQuestion = (q: TreeQuestion, per: string | undefined, x: string) => {
    const picked = asList(t.answers[answerKey(c.id, q.id, per)]);
    if (q.phrases && q.sentence) {
      const ph = picked.map((p) => q.phrases![p]).filter(Boolean);
      return ph.length ? [q.sentence(joinList(ph), ph.length)] : [];
    }
    return picked.map((p) => (q.says?.[p] ? fill(q.says[p], x) : '')).filter(Boolean);
  };
  for (const p of picks) {
    const item = c.items.find((i) => i.id === p)!;
    if (item.say) out.push(item.say);
    // This item’s own questions, right after it.
    for (const q of c.questions.filter((q) => q.perItem && askedFor(c, q, picks, t.answers).includes(p))) {
      out.push(...ofQuestion(q, p, item.phrase ?? item.label.toLowerCase()));
    }
  }
  for (const q of c.questions.filter((q) => !q.perItem)) {
    for (const per of askedFor(c, q, picks, t.answers)) out.push(...ofQuestion(q, per, per ? DOC_SUBJECT[per] ?? per : ''));
  }
  return out;
}
