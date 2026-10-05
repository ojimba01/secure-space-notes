// Shared wording for clinical notes: the terms, list joining, the opening
// sentence for each contact method, and what CM did.
//
// Sentences use nothing but the selections. Several wordings per fact let
// "Regenerate wording" vary the phrasing without changing what is said.

/** Terms used in notes. Change here if the organization changes them. */
export const TERMS = { cm: 'CM', client: 'member', Client: 'The member' } as const;

/** Wording variant `v` of a list. */
export const choose = <T,>(v: number, list: T[]): T => list[((v % list.length) + list.length) % list.length];

/** "a, b and c" */
export const joinList = (parts: string[]) =>
  parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

/** "visit" only when the contact was in person; "contact" otherwise. */
export const contactWord = (method?: string | null) => (method === 'in_person' ? 'visit' : 'contact');

// ---- how the contact happened ---------------------------------------------

/** "CM ___." for each contact method. */
export const METHOD_PHRASES: Record<string, string[]> = {
  in_person: [`met with the ${TERMS.client} in person`, `met in person with the ${TERMS.client}`],
  phone: [`contacted the ${TERMS.client} by phone`, `spoke with the ${TERMS.client} by phone`],
  text: [`contacted the ${TERMS.client} by text`, `texted the ${TERMS.client}`],
  email: [`contacted the ${TERMS.client} by email`, `emailed the ${TERMS.client}`],
  virtual: [`met with the ${TERMS.client} by video`, `contacted the ${TERMS.client} by video`],
  other: [`contacted the ${TERMS.client}`, `contacted the ${TERMS.client}`],
};

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
