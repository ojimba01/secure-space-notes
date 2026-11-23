// Wellpoint's Housing Support Services Request as a web form. Every item names
// the PDF box it fills (public/form-templates/wellpoint-support-services-request.pdf).
// The form shares its type ("Prior Authorization Request") with Aetna's prior
// authorization request; the boxes on the PDF opened decide which web form
// shows (webFormFor). The signature is drawn, added with Add signature.
import type { WebFormSchema } from './types';

export const WELLPOINT_SUPPORT_SERVICES_WEB_FORM: WebFormSchema = [
  {
    title: 'This form is',
    items: [
      {
        kind: 'checks',
        label: 'Select one',
        options: [
          { field: 'New', label: 'New' },
          { field: 'Redetermination Select if request was previously denied', label: 'Redetermination (request was previously denied)' },
        ],
      },
    ],
  },
  {
    title: 'Member information',
    items: [
      { kind: 'text', field: 'Name', label: 'Name', wide: true },
      { kind: 'text', field: 'Current address', label: 'Current address', wide: true },
      { kind: 'text', field: 'Mailing address', label: 'Mailing address', wide: true },
      { kind: 'text', field: 'Member ID', label: 'Member ID' },
      { kind: 'text', field: 'SSN', label: 'SSN' },
      { kind: 'text', field: 'DOB', label: 'Date of birth' },
      { kind: 'text', field: 'Phone', label: 'Phone' },
      {
        kind: 'checks',
        label: 'Gender',
        options: [
          // The PDF's names for these two boxes are "undefined".
          { field: 'undefined', label: 'Male' },
          { field: 'undefined_2', label: 'Female' },
        ],
      },
      // A box beside Male and Female on the PDF, with no label of its own.
      { kind: 'text', field: 'Male Female', label: 'Gender, if another' },
      { kind: 'text', field: 'Email if applicable', label: 'Email (if applicable)', wide: true },
      {
        kind: 'checks',
        label: 'Living situation',
        options: [
          { field: 'With Family', label: 'With family' },
          { field: 'With caregivers', label: 'With caregivers' },
          { field: 'Boarding home', label: 'Boarding home' },
          { field: 'Hotel', label: 'Hotel' },
          { field: 'Living on the streets', label: 'Living on the streets' },
          { field: 'Car', label: 'Car' },
          { field: 'Shelter', label: 'Shelter' },
          { field: 'Other', label: 'Other' },
        ],
      },
      { kind: 'text', field: 'If translation services are required specify language', label: 'If translation services are required, specify the language', wide: true },
    ],
  },
  {
    title: 'Care provider information',
    items: [
      { kind: 'text', field: 'Housing supports provider', label: 'Housing supports provider', wide: true },
      { kind: 'text', field: 'NJ HMIS ID', label: 'NJ HMIS ID' },
      { kind: 'text', field: 'Wellpoint provider ID', label: 'Wellpoint provider ID' },
      { kind: 'text', field: 'Address', label: 'Address', wide: true },
      { kind: 'text', field: 'Phone_2', label: 'Phone' },
      { kind: 'text', field: 'Fax', label: 'Fax' },
      { kind: 'text', field: 'Contact person', label: 'Contact person', wide: true },
    ],
  },
  {
    title: 'Provider care manager (case manager)',
    items: [
      { kind: 'text', field: 'Name_2', label: 'Name', wide: true },
      { kind: 'text', field: 'Email', label: 'Email', wide: true },
      { kind: 'text', field: 'Phone_3', label: 'Phone' },
      { kind: 'text', field: 'Fax_2', label: 'Fax' },
    ],
  },
  {
    title: 'Housing supports services request',
    items: [
      { kind: 'checks', label: 'Pre-tenancy services (care management)', options: [{ field: 'Pretenancy services care', label: 'Pre-tenancy services' }] },
      {
        kind: 'checks',
        label: 'Pre-tenancy services: level of need',
        showIf: { field: 'Pretenancy services care', value: true },
        options: [
          { field: 'High need', label: 'High need' },
          { field: 'Low need', label: 'Low need' },
        ],
      },
      { kind: 'checks', label: 'Tenancy sustaining services (care management)', options: [{ field: 'Tenancy sustaining services care', label: 'Tenancy sustaining services' }] },
      {
        kind: 'checks',
        label: 'Tenancy sustaining services: level of need',
        showIf: { field: 'Tenancy sustaining services care', value: true },
        options: [
          { field: 'High Need', label: 'High need' },
          { field: 'Low need_3', label: 'Low need' },
        ],
      },
      { kind: 'checks', label: 'Move-in support', options: [{ field: 'Movein support', label: 'Move-in support' }] },
      {
        kind: 'checks',
        label: 'Move-in support: level of need',
        showIf: { field: 'Movein support', value: true },
        options: [
          { field: 'High need_2', label: 'High need' },
          { field: 'Low need_2', label: 'Low need' },
        ],
      },
      { kind: 'checks', label: 'Residential modifications', options: [{ field: 'Residential modifications and', label: 'Residential modifications and remediation services' }] },
    ],
  },
  {
    title: 'Medical / clinical risk criteria (must meet at least one)',
    items: [
      {
        kind: 'checks',
        label: 'Select all that apply',
        options: [
          { field: 'Chronic health condition', label: 'Chronic health condition' },
          { field: 'Mental health condition', label: 'Mental health condition' },
          { field: 'Substance misuse', label: 'Substance misuse' },
          { field: 'Pregnancy', label: 'Pregnancy' },
          { field: 'Complex medical health condition', label: 'Complex medical health condition caused by intellectual or developmental disability' },
          { field: 'Individuals experience intimate partner', label: 'Intimate partner violence, domestic violence, or human trafficking' },
          { field: 'Assistance with activities of daily living', label: 'Assistance with activities of daily living (ADLs) or instrumental ADLs (IADLs)' },
          { field: 'Repeated emergency department use', label: 'Repeated emergency department use or hospital admissions' },
        ],
      },
    ],
  },
  {
    title: 'Social risk criteria (must meet at least one)',
    items: [
      {
        kind: 'checks',
        label: 'Select all that apply',
        options: [
          { field: 'Homeless', label: 'Homeless' },
          { field: 'At risk for homelessness', label: 'At risk for homelessness' },
          { field: 'Initial needs assessment', label: 'Initial needs assessment' },
          { field: 'People at risk of institutionalization who', label: 'At risk of institutionalization and require a new housing arrangement to remain in the community' },
          { field: 'Transitioning from an institution to the', label: 'Transitioning from an institution to the community' },
          { field: 'People released from correctional', label: 'Released from correctional facilities' },
        ],
      },
    ],
  },
  {
    title: 'Housing status',
    items: [
      {
        kind: 'checks',
        label: 'Select one',
        options: [
          { field: 'Homeless for more than one year', label: 'Homeless for more than one year' },
          { field: 'Homeless less than one year', label: 'Homeless less than one year' },
          { field: 'Safely housed for', label: 'Safely housed' },
        ],
      },
      // The blank in "Safely housed for ____ days/weeks/months".
      { kind: 'text', field: 'Suggested attachments', label: 'Safely housed for how long (days, weeks or months)?', showIf: { field: 'Safely housed for', value: true } },
    ],
  },
  {
    title: 'Attestation',
    items: [
      { kind: 'heading', label: 'I attest that the above-named member meets the social and clinical risk criteria. Add the signature with Add signature.' },
      { kind: 'text', field: 'Date', label: 'Date' },
      { kind: 'text', field: 'Referral name print full name', label: 'Referral name (print full name)' },
      { kind: 'text', field: 'Phone_4', label: 'Phone' },
    ],
  },
];
