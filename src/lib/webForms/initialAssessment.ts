// The Initial Assessment Tool (IAT) as a web form. Every item names the PDF
// box it fills (public/form-templates/initial-assessment-tool.pdf). The
// signature boxes are drawn signatures, added with Add signature.
import type { WebFormItem, WebFormSchema } from './types';

/** The household table's First name boxes are not numbered in order on the PDF. */
const FIRST_NAME = ['First name', 'First name_2', 'First name3', 'First name_4', 'First name_5', 'First name_6', 'First name_7', 'First name_8', 'First name_10', 'First name_9'];

const householdRow = (n: number): WebFormItem[] => {
  return [
    { kind: 'heading', label: `Household member ${n}` },
    { kind: 'text', field: FIRST_NAME[n - 1], label: 'First name' },
    { kind: 'text', field: `Last name${n}`, label: 'Last name' },
    { kind: 'text', field: `Medicaid ID if applicable${n}`, label: 'Medicaid ID (if applicable)' },
    { kind: 'text', field: `MCO ID if applicable${n}`, label: 'MCO ID (if applicable)' },
    { kind: 'text', field: `Age${n}`, label: 'Age' },
  ];
};

export const INITIAL_ASSESSMENT_WEB_FORM: WebFormSchema = [
  {
    title: 'A. Member information',
    items: [
      { kind: 'text', field: '1 Name as written on Medicaid ID', label: '1. Name (as written on Medicaid ID)', wide: true },
      { kind: 'text', field: '2 Date of birth MMDDYYYY', label: '2. Date of birth (MM/DD/YYYY)' },
      { kind: 'text', field: '3 Phone Number if applicable', label: '3. Phone number (if applicable)' },
      { kind: 'text', field: '4 Email address if applicable', label: '4. Email address (if applicable)', wide: true },
      { kind: 'text', field: '5 Medicaid ID', label: '5. Medicaid ID' },
      { kind: 'text', field: '6 Managed Care Organization MCO', label: '6. Managed Care Organization (MCO)' },
      { kind: 'text', field: '7 MCO Member ID optional', label: '7. MCO Member ID (optional)' },
      { kind: 'text', field: '8 Location county', label: '8. Location (county)' },
    ],
  },
  {
    title: 'B. Social risk criteria',
    items: [
      {
        kind: 'checks',
        label: '1. Do you/does the member meet any social risk criteria?',
        options: [
          { field: 'Currently experiencing homelessness1', label: 'Currently experiencing homelessness' },
          { field: 'At risk of homelessness2', label: 'At risk of homelessness' },
          { field: 'Atrisk of institutionalization and requiring a new housing arrangement3', label: 'At risk of institutionalization and requiring a new housing arrangement' },
          { field: 'Transitioning from an institution to the community4', label: 'Transitioning from an institution to the community' },
          { field: 'Recently released from correctional facilities5', label: 'Recently released from correctional facilities' },
        ],
      },
    ],
  },
  {
    title: 'C. Clinical risk criteria',
    items: [
      {
        kind: 'checks',
        label: '1. Do you/does the member meet any clinical risk criteria? (Self-reported or observed. No clinical diagnosis is required.)',
        options: [
          { field: 'Chronic health condition6', label: 'Chronic health condition' },
          { field: 'Mental health condition7', label: 'Mental health condition' },
          { field: 'Substance misuse8', label: 'Substance misuse' },
          { field: 'Pregnancy9', label: 'Pregnancy' },
          { field: 'Complex mental health condition from intellectual or developmental disability10', label: 'Complex mental health condition from intellectual or developmental disability' },
          { field: 'Victims of intimate partner violence domestic violence or human trafficking11', label: 'Victim of intimate partner violence, domestic violence, or human trafficking' },
          { field: 'Requires assistance with activities of daily living ADLs or instrumental ADLs IADLs12', label: 'Requires assistance with activities of daily living (ADLs) or instrumental ADLs (IADLs)' },
          { field: 'Repeated emergency department or hospital use13', label: 'Repeated emergency department or hospital use' },
        ],
      },
    ],
  },
  {
    title: 'D. Services needed',
    items: [
      {
        kind: 'checks',
        label: '1. What services do you/does the member need? (Pre-tenancy and tenancy sustaining services cannot be delivered at the same time.)',
        options: [
          { field: 'Pretenancy Services14 services that support in obtaining housing', label: 'Pre-tenancy services (support in obtaining housing)' },
          { field: 'Tenancy Sustaining Services15 services that support maintaining safe and stable housing', label: 'Tenancy sustaining services (support maintaining safe and stable housing)' },
          { field: 'Movein Supports16 onetime transitional expenses', label: 'Move-in supports (one-time transitional expenses)' },
          { field: 'Residential Modifications and Remediation Services17 services necessary to ensure the', label: 'Residential modifications and remediation services' },
        ],
      },
      {
        kind: 'checks',
        label: '2. Please confirm that you/the member or other members of the household are not currently receiving duplicate Medicaid-funded housing services.',
        options: [
          { field: 'Confirm', label: 'Confirm' },
          { field: 'Unsure', label: 'Unsure' },
          { field: 'Do not confirm receiving duplicate services', label: 'Do not confirm, receiving duplicate services' },
        ],
      },
      { kind: 'text', field: 'Name of Provider', label: '3. Name of the NJFamilyCare Housing Supports provider the member would like to work with', wide: true },
    ],
  },
  {
    title: 'E. Requester information',
    items: [
      { kind: 'text', field: '1 Name', label: '1. Name' },
      { kind: 'text', field: '2 Relation to Member', label: '2. Relation to member' },
      { kind: 'text', field: '3 Roletitle in organization if applicable', label: '3. Role/title in organization (if applicable)' },
      { kind: 'text', field: '4 Organization Name if applicable', label: '4. Organization name (if applicable)' },
      { kind: 'text', field: '5 Phone Number', label: '5. Phone number' },
      { kind: 'text', field: '6 Email address', label: '6. Email address' },
    ],
  },
  {
    title: 'F. Household information',
    items: [
      { kind: 'text', field: 'undefined', label: '1. Total number of people in the household (including the member)' },
      { kind: 'heading', label: '2. Additional household members' },
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap(householdRow),
    ],
  },
  {
    title: 'G. Statement of truth',
    items: [
      { kind: 'text', field: 'Member Name', label: 'Member name', wide: true },
      { kind: 'text', field: 'Member Signature Verbal Consent', label: 'Member signature: verbal consent', wide: true },
      { kind: 'text', field: 'ParentGuardian Name', label: 'Parent/guardian name (members under 18)', wide: true },
      { kind: 'text', field: 'Date', label: 'Date' },
    ],
  },
];
