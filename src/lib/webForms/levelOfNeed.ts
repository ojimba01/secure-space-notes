// The Level of Need (LON) as a web form. Every item names the PDF box it
// fills (public/form-templates/level-of-need-assessment-tool.pdf). Each
// question has its answer and its Score; the total adds itself up from the
// scores (src/lib/pdfLonTotal.ts).
import type { WebFormItem, WebFormSchema } from './types';

const yesNo = (yes: string, no: string) => [
  { value: yes, label: 'Yes' },
  { value: no, label: 'No' },
];

const score = (n: number): WebFormItem => ({ kind: 'select', field: `Score_${n}`, label: 'Score' });

const householdRow = (n: number): WebFormItem[] => [
  { kind: 'heading', label: `Household member ${n}` },
  { kind: 'text', field: `First nameRow${n}`, label: 'First name' },
  { kind: 'text', field: `Last nameRow${n}`, label: 'Last name' },
  { kind: 'text', field: `Medicaid IDRow${n}`, label: 'Medicaid ID' },
  { kind: 'text', field: `MCO IDRow${n}`, label: 'MCO ID' },
  { kind: 'text', field: `AgeRow${n}`, label: 'Age' },
];

export const LEVEL_OF_NEED_WEB_FORM: WebFormSchema = [
  {
    title: 'A. Demographics',
    items: [
      { kind: 'text', field: '1 Name not scored', label: '1. Name (not scored)', wide: true },
      { kind: 'text', field: '2 Date of Birth 1 point if age is less than 18 or more than 60', label: '2. Date of birth (1 point if age is less than 18 or more than 60)' },
      score(2),
      { kind: 'text', field: '3 Medicaid ID not scored but Medicaid and MCO enrollment required for eligibility', label: '3. Medicaid ID (not scored)' },
      { kind: 'text', field: '4 MCO Member ID not scored but Medicaid and MCO enrollment required for eligibility', label: '4. MCO Member ID (not scored)' },
      {
        kind: 'checks',
        label: '5. Number of people in household (including member)',
        options: [
          { field: '2 members 5 points', label: '2+ members (5 points)' },
          { field: '1 member 0 points', label: '1 member (0 points)' },
        ],
      },
      { kind: 'text', field: 'Total number of people in household', label: 'Total number of people in household' },
      score(5),
      ...[1, 2, 3, 4, 5, 6].flatMap(householdRow),
      {
        kind: 'choice',
        field: 'If unemployed 1 point',
        label: '6. Are you employed? (If unemployed: 1 point)',
        options: yesNo('Yes', 'No'),
      },
      score(6),
    ],
  },
  {
    title: 'B. Housing and social history',
    items: [
      {
        kind: 'checks',
        label: '7. Where do you sleep most frequently? (Select only one.)',
        options: [
          { field: 'Unsheltered homeless including areas not meant for human habitation eg', label: 'Unsheltered homeless, including areas not meant for human habitation (5 points)' },
          { field: 'Emergency shelter safe haven or hotelmotel paid for by charity or government1 5', label: 'Emergency shelter, safe haven, or hotel/motel paid for by charity or government (5 points)' },
          { field: 'Other homeless definitions including 5 points 1', label: 'Other homeless definitions (5 points)' },
          { field: 'At risk of homelessness including situations such as couchsurfing facing eviction', label: 'At risk of homelessness, such as couch-surfing or facing eviction (1 point)' },
          { field: 'Living in a physically unsafe home2 1 point', label: 'Living in a physically unsafe home (1 point)' },
          { field: 'Atrisk of institutionalization3 1 point', label: 'At risk of institutionalization (1 point)' },
          { field: 'Transitioning out of institution4 1 point', label: 'Transitioning out of institution (1 point)' },
          { field: 'Recently released within 12 months from correctional facility5 1 point', label: 'Recently released (within 12 months) from correctional facility (1 point)' },
          { field: 'Stably safely housed none of the above 0 points', label: 'Stably, safely housed, none of the above (0 points)' },
        ],
      },
      score(7),
      {
        kind: 'checks',
        label: '8. How long have you been living there? (Select only one.)',
        options: [
          { field: 'Homeless for greater than 1 year 3 points', label: 'Homeless for greater than 1 year (3 points)' },
          { field: 'Homeless for less than 1 year 2 points', label: 'Homeless for less than 1 year (2 points)' },
          { field: 'Unstably housed for greater than 1 year 2 points', label: 'Unstably housed for greater than 1 year (2 points)' },
          { field: 'Unstably housed for less than 1 year 1 point', label: 'Unstably housed for less than 1 year (1 point)' },
          { field: 'Safely housed for', label: 'Stably housed (0 points)' },
        ],
      },
      { kind: 'text', field: 'months', label: 'Stably housed for how many months?', showIf: { field: 'Safely housed for', value: true } },
      score(8),
      {
        kind: 'checks',
        label: '9. How many times have you been homeless (including currently)?',
        options: [
          { field: 'Experienced homelessness at least once in the past year 3 points', label: 'At least once in the past year (3 points)' },
          { field: 'Experienced homelessness at least once in the past 3 years but not in the', label: 'At least once in the past 3 years, but not in the past year (2 points)' },
          { field: 'Experienced homelessness over lifetime but not in the past 3 years 1 point', label: 'Over lifetime, but not in the past 3 years (1 point)' },
          { field: 'Never been homeless 0 points', label: 'Never been homeless (0 points)' },
        ],
      },
      score(9),
      {
        kind: 'checks',
        label: '10. Have you experienced an eviction before?',
        options: [
          { field: 'Yes received an eviction notice and was evicted 3 points', label: 'Yes; received an eviction notice and was evicted (3 points)' },
          { field: 'No either received an eviction notice but avoided eviction or currently in the', label: 'No; received an eviction notice but avoided eviction, or currently in the eviction process (1 point)' },
          { field: 'No never have received an eviction notice 0 points', label: 'No; never have received an eviction notice (0 points)' },
        ],
      },
      score(10),
      {
        kind: 'checks',
        label: '11. Have you been involved with the criminal justice system in any of the following ways?',
        options: [
          { field: 'Yes I have been charged with convicted of imprisoned for or on probation for a', label: 'Yes; charged with, convicted of, imprisoned for, or on probation for a criminal offense in the past twelve months (2 points)' },
          { field: 'Yes I have been charged with convicted of imprisoned for or on probation for a_2', label: 'Yes; all more than twelve months ago, and/or a witness to or victim of a reported criminal offense in the past twelve months (1 point)' },
          { field: 'No none of the above apply to me 0 points', label: 'No; none of the above apply to me (0 points)' },
        ],
      },
      score(11),
    ],
  },
  {
    title: 'C. Health',
    items: [
      { kind: 'heading', label: 'Answers are self-reported or observed by the provider. They do not require a clinical diagnosis.' },
      {
        kind: 'checks',
        label: '12. How many hospitalizations or emergency department visits have you had in the last 6 months?',
        options: [
          { field: 'More than 4 visits 7 points', label: 'More than 4 visits (7 points)' },
          { field: '2 to 3 visits 2 points', label: '2 to 3 visits (2 points)' },
          { field: '1 or no visits 0 point', label: '1 or no visits (0 points)' },
        ],
      },
      score(12),
      {
        kind: 'checks',
        label: '13. Have you faced intimate partner violence or domestic violence?',
        options: [
          { field: 'Within the last 6 months 3 points', label: 'Within the last 6 months (3 points)' },
          { field: 'Within the last 12 months but not within the last 6 months 2 points', label: 'Within the last 12 months, but not the last 6 months (2 points)' },
          { field: 'At some point during lifetime but not in the last 12 months 1 points', label: 'At some point during lifetime, but not the last 12 months (1 point)' },
          { field: 'No None of the above apply to me 0 points', label: 'No; none of the above apply to me (0 points)' },
        ],
      },
      score(13),
      {
        kind: 'choice',
        field: '5 points if yes',
        label: '14. Do you have any substance misuse (drug or alcohol) issues that make it difficult for you to maintain stable housing? (5 points if yes)',
        options: yesNo('Yes_2', 'No_2'),
      },
      score(14),
      {
        kind: 'choice',
        field: '2 points if yes',
        label: '15. Do you have any mental health conditions that make it difficult for you to maintain stable housing? (2 points if yes)',
        options: yesNo('Yes_3', 'No_3'),
      },
      score(15),
      {
        kind: 'choice',
        field: '8 points if yes',
        label: '16. Do you have any intellectual or developmental disabilities that make it difficult for you to maintain stable housing? (8 points if yes)',
        options: yesNo('Yes_4', 'No_4'),
      },
      score(16),
      {
        kind: 'checks',
        label: '17. Are you currently or have you been pregnant in the last 12 months?',
        options: [
          { field: 'Currently pregnant 1 point', label: 'Currently pregnant (1 point)' },
          { field: 'Not currently pregnant but have been pregnant within the last 12 months', label: 'Not currently pregnant, but pregnant within the last 12 months (1 point)' },
          { field: 'Not currently pregnant nor pregnant in the last 12 months 0 points', label: 'Not pregnant now or in the last 12 months (0 points)' },
        ],
      },
      score(17),
      {
        kind: 'choice',
        field: '1 point if yes',
        label: '18. Do you have any chronic health conditions? (1 point if yes)',
        options: yesNo('Yes_5', 'No_5'),
      },
      score(18),
      {
        kind: 'checks',
        label: '19. Do you need assistance with activities of daily living (ADLs) or instrumental ADLs (IADLs)? Check all that apply.',
        options: [
          { field: 'Require assistance with at least 1 ADL eg bathing dressing eating using', label: 'Assistance with at least 1 ADL, such as bathing, dressing, eating or using the toilet (1 point)' },
          { field: 'Require assistance with at least 3 IADLs eg cooking shopping', label: 'Assistance with at least 3 IADLs, with a behavioral health condition or cognitive impairment (1 point)' },
          { field: 'No None of the above apply to me 0 points_2', label: 'No; none of the above apply to me (0 points)' },
        ],
      },
      score(19),
    ],
  },
  {
    title: 'Total score',
    items: [
      { kind: 'text', field: 'Please add up all the scores and provide the total score below TOTAL SCORE', label: 'Total score (adds itself up from the scores)' },
      { kind: 'select', field: 'Level of Need category', label: 'Level of need category' },
    ],
  },
  {
    title: 'Case manager',
    items: [
      { kind: 'text', field: 'Name of case manager who completed assessment', label: 'Name of case manager who completed the assessment', wide: true },
      { kind: 'text', field: 'Provider organization name', label: 'Provider organization name' },
      { kind: 'text', field: 'Date of completion', label: 'Date of completion' },
      { kind: 'select', field: 'Dropdown1', label: 'Service requested' },
      {
        kind: 'checks',
        label: 'Reason for authorization request',
        options: [
          { field: 'Continue members authorization past the first 30 days of services by extending the first', label: 'Continue the authorization past the first 30 days, extending it by 150 days to 180 days in total' },
          { field: 'Reauthorization for an additional 180 days of service to continue services after current', label: 'Re-authorization for an additional 180 days after the current authorization ends' },
          { field: 'Authorization request to switch members provider', label: "Switch member's provider" },
          { field: 'Authorization request to update level of need', label: 'Update level of need' },
          { field: 'Authorization request to change type of services eg PreTenancy Services to Tenancy', label: 'Change type of services' },
          { field: 'Authorization request due to member switching MCOs', label: 'Member switching MCOs' },
          { field: 'Other please specify below', label: 'Other' },
        ],
      },
    ],
  },
];
