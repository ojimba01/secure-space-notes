// Made-up people for the Help guide screenshots. None of them are real.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Tables } from './query';

const day = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const at = (n: number, h = 10) => `${day(n)}T${String(h).padStart(2, '0')}:00:00.000Z`;

export const ADMIN = { user: 'u-admin', profile: 'p-admin' };
export const STAFF = { user: 'u-staff', profile: 'p-staff' };

const staff = [
  { id: 'p-admin', user_id: 'u-admin', first_name: 'Jordan', last_name: 'Price', email: 'jordan.price@example.org', role: 'superadmin' },
  { id: 'p-staff', user_id: 'u-staff', first_name: 'Taylor', last_name: 'Brooks', email: 'taylor.brooks@example.org', role: 'employee' },
  { id: 'p-riley', user_id: 'u-riley', first_name: 'Riley', last_name: 'Chen', email: 'riley.chen@example.org', role: 'employee' },
  { id: 'p-morgan', user_id: 'u-morgan', first_name: 'Morgan', last_name: 'Diaz', email: 'morgan.diaz@example.org', role: 'employee' },
  // A deactivated account, for the reactivate guide.
  { id: 'p-sam', user_id: 'u-sam', first_name: 'Sam', last_name: 'Ellis', email: 'sam.ellis@example.org', role: 'employee', active: false },
];

interface C { f: string; l: string; mco: string; mem: string; owner: string; start: number; level?: string; status?: string; approval?: string; lapsed?: boolean }
const people: C[] = [
  { f: 'Dana', l: 'Whitfield', mco: 'Horizon', mem: '70114238', owner: 'p-staff', start: -140, level: 'Low Level' },
  { f: 'Marcus', l: 'Bell', mco: 'Aetna', mem: '042219388101', owner: 'p-staff', start: -95, level: 'Low Level' },
  { f: 'Renee', l: 'Park', mco: 'Wellpoint', mem: 'WP88210473', owner: 'p-staff', start: -25, approval: 'Submitted' },
  { f: 'Kwame', l: 'Asante', mco: 'Aetna', mem: '042300571902', owner: 'p-staff', start: -200, level: 'High Level' },
  { f: 'Priya', l: 'Nair', mco: 'Wellpoint', mem: 'WP90012288', owner: 'p-riley', start: -60, level: 'Low Level' },
  { f: 'Luis', l: 'Ortega', mco: 'Horizon', mem: '70281190', owner: 'p-riley', start: -170, level: 'Low Level' },
  { f: 'Anita', l: 'Rowe', mco: 'UnitedHealthcare', mem: 'UH4410078', owner: 'p-morgan', start: -120, level: 'Low Level' },
  { f: 'Samuel', l: 'Otieno', mco: 'Horizon', mem: '70331876', owner: 'p-morgan', start: -12 },
  { f: 'Helen', l: 'Brooks', mco: 'Wellpoint', mem: 'WP90550127', owner: 'p-riley', start: -75, level: 'Low Level', lapsed: true },
  { f: 'Carla', l: 'Mendes', mco: 'Aetna', mem: '031550982201', owner: 'p-staff', start: -300, level: 'Low Level', status: 'closed' },
];

export function seed(): Tables {
  const clients = people.map((p, i) => {
    // A lapsed client never got past the 30-day authorization.
    const has150 = p.start < -35 && !p.lapsed;
    return {
      id: `c-${i + 1}`,
      first_name: p.f,
      last_name: p.l,
      insurance: p.mco,
      member_id: p.mem,
      medicaid_id: `77700014${String(4229 + i * 37).padStart(6, '0')}`,
      njhmis_id: i === 0 ? null : String(51200 + i * 13),
      date_of_birth: `19${70 + i}-0${(i % 9) + 1}-1${i % 9}`,
      phone: `(609) 555-01${String(10 + i).padStart(2, '0')}`,
      email: null,
      address: `${12 + i * 7} Grove St, Trenton, NJ 08618`,
      assigned_employee_id: p.owner,
      status: p.status ?? 'active',
      workflow_stage: p.status === 'closed' ? 'closed' : has150 ? 'active_authorization' : 'initial_30_active',
      approval_status: p.approval ?? 'Approved',
      level_of_need: p.level ?? null,
      auth_30_start: day(p.start),
      auth_30_end: day(p.start + 29),
      auth_30_number: `${p.mco.slice(0, 2).toUpperCase()}-77${i}0321`,
      auth_150_start: has150 ? day(p.start + 30) : null,
      auth_150_end: has150 ? day(p.start + 179) : null,
      auth_150_number: has150 ? `${p.mco.slice(0, 2).toUpperCase()}-78${i}0398` : null,
      auth_180_start: null,
      auth_180_end: null,
      auth_180_number: null,
      auth_180_approved: false,
      hsp_submitted: has150,
      intake_date: day(p.start - 2),
      iat_date: day(p.start),
      diagnosis_code: 'Z59.811',
      billing_tracking_start: day(p.start),
      intake_status: 'complete',
      closed_date: p.status === 'closed' ? day(-20) : null,
      reason_closed: p.status === 'closed' ? 'Housed' : null,
      notes: null,
      deleted_at: null,
      created_at: at(p.start - 5),
      updated_at: at(-1),
      county: 'Mercer',
      field_sources: null,
      subscriber_relationship: 'Self',
    };
  });

  const authorizations = clients.flatMap((c) => [
    { id: `a30-${c.id}`, client_id: c.id, authorization_type: 'initial_30', sequence_number: 1, start_date: c.auth_30_start, end_date: c.auth_30_end, authorization_number: c.auth_30_number, status: 'active', mco: c.insurance, level_of_need: c.level_of_need },
    ...(c.auth_150_start
      ? [{ id: `a150-${c.id}`, client_id: c.id, authorization_type: 'continuation_150', sequence_number: 1, start_date: c.auth_150_start, end_date: c.auth_150_end, authorization_number: c.auth_150_number, status: 'active', mco: c.insurance, level_of_need: c.level_of_need }]
      : []),
  ]);

  // Thirty-day cycles from the start of each authorization.
  const cycles: any[] = [];
  clients.forEach((c) => {
    const start = c.auth_30_start;
    for (let k = 0; k < 6; k++) {
      const s = new Date(`${start}T12:00:00Z`);
      s.setUTCDate(s.getUTCDate() + k * 30);
      const e = new Date(s);
      e.setUTCDate(e.getUTCDate() + 29);
      if (s > new Date()) break;
      const billed = k < 2 && c.status !== 'closed';
      cycles.push({
        id: `y-${c.id}-${k + 1}`,
        client_id: c.id,
        cycle_number: k + 1,
        phase: k === 0 ? 'Initial 30-Day' : '150-Day',
        cycle_start: s.toISOString().slice(0, 10),
        cycle_end: e.toISOString().slice(0, 10),
        billed_amount: c.level_of_need === 'High Level' ? 640 : c.level_of_need ? 320 : null,
        paid_amount: k === 0 && billed ? 320 : 0,
        billing_status: billed ? 'Submitted' : 'Not Billed',
        payment_status: k === 0 && billed ? 'Paid' : 'Unpaid',
        claim_number: billed ? `CLM${4400 + k}` : null,
        submitted_date: billed ? day(-40 + k * 10) : null,
        paid_date: k === 0 && billed ? day(-20) : null,
        is_auto_generated: true,
        is_active: true,
        notes: null,
        approval_state: null,
      });
    }
  });

  const contacts = [
    { client: 'c-1', d: -3, m: 'in_person', t: 'housing_application', n: 'Met at the library. Reviewed two listings and booked a viewing for Friday.' },
    { client: 'c-2', d: -5, m: 'phone', t: 'general_checkin', n: 'Checked in by phone. Income documents are ready for the voucher application.' },
    { client: 'c-4', d: -2, m: 'in_person', t: 'landlord_tenant', n: 'Joined the landlord call about the lease start date.' },
    { client: 'c-5', d: -4, m: 'virtual', t: 'benefits_income', n: 'Video call to complete the SNAP recertification.' },
  ].map((x, i) => ({
    id: `k-${i}`, client_id: x.client, employee_id: clients.find((c) => c.id === x.client)!.assigned_employee_id,
    contact_date: day(x.d), modality: x.m, touchpoint_type: x.t, notes: x.n, created_at: at(x.d, 15), entered_by: null, duration_minutes: 45,
  }));

  // Scheduled touchpoints: two a client, one this week and one later.
  const events = clients.filter((c) => c.status === 'active').flatMap((c, i) =>
    [-(i % 6) - 1, (i % 3), 8 + (i % 6)].map((d, k) => ({
      id: `e-${c.id}-${k}`, client_id: c.id, employee_id: c.assigned_employee_id,
      title: `${k === 1 ? 'Phone call' : 'Visit'}: ${c.first_name} ${c.last_name}`,
      start_time: at(d, 13 + (i % 4)), end_time: at(d, 14 + (i % 4)), event_type: 'touch_point', status: 'scheduled',
      modality: k === 1 ? 'phone' : 'in_person', touchpoint_type: 'general_checkin', is_auto_generated: false, is_manually_adjusted: true,
      description: null, note_id: null,
    })),
  );

  const forms = [
    { client: 'c-1', type: 'Client Intake', status: 'submitted', d: -142, by: 'p-staff', src: 'created_in_app' },
    { client: 'c-1', type: 'Initial Assessment (IAT)', status: 'submitted', d: -140, by: 'p-staff', src: 'created_in_app', ext: 'accepted' },
    { client: 'c-1', type: 'Level of Need (LON)', status: 'submitted', d: -120, by: 'p-staff', src: 'created_in_app' },
    { client: 'c-1', type: 'Housing Stabilization Plan (HSP)', status: 'draft', d: -1, by: 'p-staff', src: 'created_in_app' },
    { client: 'c-1', type: 'Approval Letter', status: 'submitted', d: -110, by: 'p-riley', src: 'manual_upload', title: 'Approval letter · 150-day', fields: { field_njhmis_id: '51277', fields_extracted_at: at(-110) } },
    { client: 'c-2', type: 'Initial Assessment (IAT)', status: 'submitted', d: -94, by: 'p-staff', src: 'created_in_app' },
  ].map((f, i) => ({
    id: `f-${i}`, client_id: f.client, employee_id: f.by, form_type: f.type, title: f.title ?? f.type, status: f.status,
    file_path: `forms/${f.client}/f-${i}/form.pdf`, original_file_path: null, external_status: f.ext ?? 'not_sent',
    sent_to_mco_at: null, mco_response_at: null, due_date: null, workflow_purpose: null, source: f.src, source_filename: null,
    template_version: null, authorization_id: null, signature_name: null, signed_at: null, approved_at: null, review_note: null,
    created_at: at(f.d, 11), processing_status: 'done', processing_error: null, text_char_count: 1200, page_count: 4,
    ocr_applied: false, text_truncated: false, ...((f as any).fields ?? {}),
  }));

  return {
    profiles: staff.map(({ role: _r, ...p }) => ({ active: true, ...p, created_at: at(-400), touchpoint_tutorial_acknowledged_at: at(-300), touchpoint_go_live_date: day(-300) })),
    user_roles: staff.map((s) => ({ id: `r-${s.id}`, user_id: s.user_id, role: s.role })),
    clients,
    client_authorizations: authorizations,
    billing_cycles: cycles,
    client_contacts: contacts,
    calendar_events: events,
    client_forms: forms,
    compliance_settings: [],
    user_tutorial_progress: staff.map((s) => ({ user_id: s.user_id, completed: true, current_step: 10 })),
    user_onboarding: staff.map((s) => ({ id: `o-${s.id}`, user_id: s.user_id, completed_at: at(-300) })),
    onboarding_content: [],
    tutorial_steps: [],
    touchpoint_reminders: [
      { id: 'tr-1', client_id: 'c-1', employee_id: 'p-staff', sent_by: 'p-admin', note: 'Please complete the in-person visit this week.', created_at: at(-1, 16), snoozed_until: null, completed_at: null, completed_how: null },
      { id: 'tr-2', client_id: 'c-2', employee_id: 'p-staff', sent_by: 'p-admin', note: null, created_at: at(-1, 16), snoozed_until: null, completed_at: null, completed_how: null },
    ],
    support_tickets: [],
    support_ticket_messages: [],
    client_assignments_history: [],
    case_logs: [],
    staff_activity: [],
    audit_logs: [],
    signatures: [],
    staff_signatures: [
      { id: 'sig-1', profile_id: STAFF.profile, label: 'Taylor Brooks', kind: 'signature', image_path: 'p-staff/sig-1.png', is_default: true, created_at: '2026-05-01T12:00:00Z' },
      { id: 'sig-2', profile_id: STAFF.profile, label: 'TB', kind: 'initial', image_path: 'p-staff/sig-2.png', is_default: false, created_at: '2026-05-02T12:00:00Z' },
    ],
    form_template_registry: [],
    client_form_checklist: [],
    client_intakes: [],
    client_visit_availability: [],
    availity_provider_settings: [],
    billing_workbook_layout: [],
  };
}
