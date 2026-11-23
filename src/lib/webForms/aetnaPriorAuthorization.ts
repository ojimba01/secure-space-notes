// Aetna Better Health's Housing Supports prior authorization request as a web
// form. Every item names the PDF box it fills
// (public/form-templates/aetna-prior-authorization.pdf). The form shares its
// type ("Prior Authorization Request") with Wellpoint's support services
// request, so it opens as this web form only when its boxes are on the PDF.
import type { WebFormItem, WebFormSchema } from './types';

/**
 * The page 2 tables' boxes. The PDF names every column after the ICD-10
 * description, so the column is told apart by its number: 32 is the ICD-10
 * code, 33 its description, 34 the CPT / HCPCS code, 35 its description and
 * 36 the quantity. Rows 2 to 10 carry " - n".
 */
const cell = (column: 32 | 33 | 34 | 35 | 36, row: number) =>
  `${column} ICD10  DSM5 CODES 33 ICD10  DSM5 CODES DESCRIPTION${row > 1 ? ` - ${row}` : ''}`;

const ROWS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** A row shows once the row above it has a code, so the table starts short. */
const diagnosisRow = (n: number): WebFormItem[] => {
  const showIf = n > 1 ? { field: cell(32, n - 1), value: '*' } : undefined;
  return [
    { kind: 'text', field: cell(32, n), label: n === 1 ? 'ICD-10 / DSM-5 code' : `ICD-10 / DSM-5 code ${n}`, showIf },
    { kind: 'text', field: cell(33, n), label: 'Description', showIf },
  ];
};

const serviceRow = (n: number): WebFormItem[] => {
  const showIf = n > 1 ? { field: cell(34, n - 1), value: '*' } : undefined;
  return [
    { kind: 'heading', label: n === 1 ? 'Service' : `Service ${n}`, showIf },
    { kind: 'text', field: cell(34, n), label: 'CPT / HCPCS code', showIf },
    { kind: 'text', field: cell(36, n), label: 'Quantity / units', showIf },
    { kind: 'text', field: cell(35, n), label: 'Description', wide: true, showIf },
  ];
};

export const AETNA_PRIOR_AUTHORIZATION_WEB_FORM: WebFormSchema = [
  {
    title: 'Request',
    items: [
      { kind: 'text', field: 'Text1', label: 'Date of request (MM/DD/YYYY)' },
      { kind: 'checks', label: 'Type of request', options: [{ field: 'Check Box28', label: 'In office' }] },
      {
        kind: 'checks',
        label: 'Urgency (select one)',
        options: [
          { field: 'Check Box11', label: 'Urgent (processed within 72 hours)' },
          { field: 'Check Box12', label: 'Non-urgent standard (processed within 7 days)' },
        ],
      },
    ],
  },
  {
    title: 'Member information',
    items: [
      { kind: 'text', field: '1 LAST NAME', label: '1. Last name' },
      { kind: 'text', field: '2 FIRST NAME', label: '2. First name' },
      { kind: 'text', field: '3 MI', label: '3. Middle initial' },
      { kind: 'text', field: '4 MEMBER ID', label: '4. Member Aetna ID # (required)' },
      { kind: 'text', field: '5 DATE OF BIRTH MMDDYYYY', label: '5. Date of birth (MM/DD/YYYY) (required)' },
      { kind: 'text', field: '6 MEMBERS PCP', label: "6. Member's PCP" },
      { kind: 'text', field: '7 PCP PHONE NUMBER xxxxxxxxxx', label: '7. PCP phone number' },
      { kind: 'text', field: '8 PCP FAX NUMBER xxxxxxxxxx', label: '8. PCP fax number' },
      {
        kind: 'checks',
        label: '9. Gender',
        options: [
          { field: 'Check Box13', label: 'Male' },
          { field: 'Check Box14', label: 'Female' },
          { field: 'Check Box15', label: 'Other' },
        ],
      },
      {
        kind: 'checks',
        label: '10. Is the member pregnant?',
        options: [
          { field: 'Check Box16', label: 'Yes' },
          { field: 'Check Box17', label: 'No' },
        ],
      },
      { kind: 'text', field: '11 DOES THE MEMBER HAVE OTHER INSURANCE ENTER POLICY NUMBER', label: '11. Does the member have other insurance? Enter the policy number', wide: true },
      { kind: 'text', field: '12 OTHER INSURANCE NAME', label: '12. Other insurance name' },
      { kind: 'text', field: '13 PHONE NUMBER xxxxxxxxxx', label: '13. Phone number' },
    ],
  },
  {
    title: 'Ordering / referring provider',
    items: [
      { kind: 'text', field: '14 CONTACT PERSON IN REQUESTING PROVIDERS OFFICE', label: "14. Contact person in the requesting provider's office" },
      { kind: 'text', field: '15 PHONE NUMBER xxxxxxxxxx', label: '15. Phone number' },
      { kind: 'text', field: '16 REQUESTING PROVIDER NAME', label: '16. Ordering / referring provider name', wide: true },
      { kind: 'text', field: '17 PHONE NUMBER xxxxxxxxxx', label: '17. Phone number' },
      { kind: 'text', field: '18 FAX NUMBER xxxxxxxxxx', label: '18. Fax number' },
      { kind: 'text', field: '19 REQUESTING PROVIDER ADDRESS', label: '19. Ordering / referring provider address' },
      { kind: 'text', field: '20 NPI', label: '20. NPI # (required)' },
    ],
  },
  {
    title: 'Servicing provider',
    items: [
      { kind: 'text', field: '21 FACILITY  SERVICING PROVIDER NAME', label: '21. Facility / servicing provider name' },
      { kind: 'text', field: '22 CONTACT NAME', label: '22. Contact name' },
      { kind: 'text', field: '23 PHONE NUMBER xxxxxxxxxx', label: '23. Phone number' },
      { kind: 'text', field: '24 FAX NUMBER xxxxxxxxxx', label: '24. Fax number' },
      { kind: 'text', field: '25 SERVICING PROVIDER ADDRESS', label: '25. Servicing provider address' },
      { kind: 'text', field: '30 NPI', label: '26. NPI # (required)' },
    ],
  },
  {
    title: 'Clinical information',
    items: [
      { kind: 'text', field: 'SERVICE START DATE (MMDDYYYY)', label: 'Service start date (MM/DD/YYYY)' },
      { kind: 'text', field: 'SERVICE END DATE (MMDDYYYY)', label: 'Service end date (MM/DD/YYYY)' },
      { kind: 'heading', label: '27–28. ICD-10 / DSM-5 codes (required)' },
      ...ROWS.flatMap(diagnosisRow),
      { kind: 'heading', label: '29–31. CPT / HCPCS codes (required)' },
      ...ROWS.flatMap(serviceRow),
      { kind: 'text', field: '37 CLINICAL INDICATIONS  RATIONALE FOR REQUEST', label: '32. Clinical indications / rationale for request', multiline: true },
    ],
  },
];
