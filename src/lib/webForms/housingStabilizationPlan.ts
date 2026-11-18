// The Housing Stabilization Plan (HSP) as a web form. Every item names the
// PDF box it fills (public/form-templates/housing-stabilization-plan.pdf).
// Each section holds four goals of three actions; the next goal or action
// shows once the one before it has an answer. Signatures are added with Add
// signature.
import type { WebFormItem, WebFormSchema } from './types';

/** The four goals of one section ('' for i, '_2' for ii, '_3' for iii). */
const goals = (suffix: string): WebFormItem[] =>
  [1, 2, 3, 4].flatMap((g) => {
    const goalField = `GoalsRow${g}${suffix}`;
    const goalShown = g === 1 ? undefined : { field: `GoalsRow${g - 1}${suffix}`, value: '*' as const };
    return [
      { kind: 'heading', label: `Goal ${g}`, showIf: goalShown },
      { kind: 'text', field: goalField, label: 'Goal', multiline: true, showIf: goalShown },
      ...[1, 2, 3].flatMap((a): WebFormItem[] => {
        const row = (g - 1) * 3 + a;
        const shown = a === 1 ? { field: goalField, value: '*' as const } : { field: `ActionsRow${row - 1}${suffix}`, value: '*' as const };
        return [
          { kind: 'text', field: `ActionsRow${row}${suffix}`, label: `Action ${a}`, multiline: true, showIf: shown },
          { kind: 'text', field: `Person ResponsibleRow${row}${suffix}`, label: 'Person responsible', showIf: shown },
          { kind: 'text', field: `Target Date to CompleteRow${row}${suffix}`, label: 'Target date to complete', showIf: shown },
          { kind: 'text', field: `Progress updateRow${row}${suffix}`, label: 'Progress update', multiline: true, showIf: shown },
          { kind: 'text', field: `Date CompletedRow${row}${suffix}`, label: 'Date completed', showIf: shown },
        ];
      }),
    ];
  });

export const HOUSING_STABILIZATION_PLAN_WEB_FORM: WebFormSchema = [
  {
    title: 'Member and provider',
    items: [
      { kind: 'text', field: 'Member Name', label: 'Member name' },
      { kind: 'text', field: 'Date1_af_date', label: 'Date' },
      { kind: 'text', field: 'Medicaid ID', label: 'Medicaid ID' },
      { kind: 'text', field: 'Date2_af_date', label: 'Next scheduled review' },
      { kind: 'text', field: 'NJ HMIS ID', label: 'NJ HMIS ID' },
      { kind: 'text', field: 'Housing Supports Provider', label: 'Housing Supports provider' },
      { kind: 'text', field: 'Provider Case Manager Name', label: 'Provider case manager name' },
      { kind: 'text', field: 'Provider Case Manager Phone', label: 'Provider case manager phone' },
      { kind: 'text', field: 'Provider Case Manager Email', label: 'Provider case manager email', wide: true },
      {
        kind: 'checks',
        label: 'This plan is focused on the following general goal (select one)',
        options: [
          { field: 'Helping memy family find safe stable housing Pretenancy Services', label: 'Helping me/my family find safe, stable housing (Pre-tenancy Services)' },
          { field: 'Helping memy family stabilize in new or current housing once secured Tenancy', label: 'Helping me/my family stabilize in new or current housing once secured (Tenancy Sustaining Services)' },
        ],
      },
      {
        kind: 'text',
        field: 'What is your overall goal for housing Required field please limit to couple of sentencesRow1',
        label: 'What is your overall goal for housing? (Required, a couple of sentences)',
        multiline: true,
      },
    ],
  },
  {
    title: 'i. Housing search, stabilization and retention',
    items: [
      {
        kind: 'text',
        field: 'What are your next steps for obtaining housing or immediate stabilization where you are living Please include any relevant actions from individuals across the householdRow1',
        label: 'What are your next steps for obtaining housing or immediate stabilization where you are living? Include relevant actions from anyone in the household.',
        multiline: true,
      },
      ...goals(''),
    ],
  },
  {
    title: 'ii. Income, expenses and other resources',
    items: [
      {
        kind: 'text',
        field: 'What is your overall monthly income goal Please enter a dollar amount Please enter both your individual goal and the total goal of the entire household individual goal may be 0 if other household members are expected to earn incomeRow1',
        label: 'What is your overall monthly income goal? Enter both your individual goal and the household total, in dollars.',
        multiline: true,
      },
      ...goals('_2'),
    ],
  },
  {
    title: 'iii. Health needs',
    items: [
      {
        kind: 'text',
        field: 'What health needs including mental health and substance use help do you need assistance with to be successful in obtaining a home stabilizing your living situation andor meet other important needs Please include any relevant needs from individuals across the household that may impact ability to obtain and maintain housingRow1',
        label: 'What health needs, including mental health and substance use, do you need help with to obtain a home, stabilize your living situation or meet other important needs?',
        multiline: true,
      },
      ...goals('_3'),
    ],
  },
  {
    title: 'Notes and signatures',
    items: [
      { kind: 'text', field: 'NotesRow1', label: 'Notes', multiline: true },
      { kind: 'text', field: 'Date3_af_date', label: 'Member signature date' },
      { kind: 'text', field: 'Date4_af_date', label: 'Parent/guardian signature date' },
      { kind: 'text', field: 'Date5_af_date', label: 'Case manager signature date' },
    ],
  },
];
