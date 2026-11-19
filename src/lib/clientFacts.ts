// What the app already knows about a client, for filling in a form.
//
// The client record comes first. Where it has nothing, the details read off
// the client's other filed documents (an approval letter's Medicaid ID, an
// IAT's date of birth) and their intake fill the gap, so a form started for a
// client never asks for something one of their papers already says.
import { supabase } from '@/integrations/supabase/client';
import { extractPdfFieldValues, type AutofillCaseManager, type AutofillClient } from '@/lib/formAutofill';
import { loadAvailitySettings } from '@/lib/availity';

export interface ClientFacts extends AutofillClient {
  id: string;
  assigned_employee_id: string | null;
  household_size: number | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  preferred_delivery: string | null;
}

const CLIENT_COLUMNS =
  'id, first_name, last_name, date_of_birth, phone, email, member_id, medicaid_id, address, insurance, county, njhmis_id, move_in_date, new_address, new_city_state_zip, apartment_complex_name, landlord_name, landlord_phone, landlord_email, realtor_name, realtor_phone, realtor_email, assigned_employee_id, household_size, emergency_contact_name, emergency_contact_phone, preferred_delivery';

const blank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && !v.trim());

/** The newest non-empty value of a column across the client's documents. */
function newest<T extends Record<string, unknown>>(rows: T[], key: keyof T): string | null {
  for (const r of rows) if (!blank(r[key])) return String(r[key]).trim();
  return null;
}

export async function loadClientFacts(clientId: string): Promise<ClientFacts> {
  // Newer than the generated types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const [clientRes, docsRes, intakeRes] = await Promise.all([
    db.from('clients').select(CLIENT_COLUMNS).eq('id', clientId).maybeSingle(),
    db
      .from('client_forms')
      .select('form_type, file_path, field_medicaid_id, field_member_id, field_member_dob, field_njhmis_id, created_at, updated_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false }),
    db
      .from('client_intakes')
      .select('id, emergency_contact_name, emergency_contact_phone, medicaid_number, mco_number, updated_at')
      .eq('client_id', clientId)
      .order('updated_at', { ascending: false })
      .limit(1),
  ]);
  if (clientRes.error) throw new Error(clientRes.error.message);
  if (!clientRes.data) throw new Error('Client not found.');
  const facts = { ...(clientRes.data as ClientFacts) };

  const docs = (docsRes.data ?? []) as Record<string, unknown>[];
  if (blank(facts.medicaid_id)) facts.medicaid_id = newest(docs, 'field_medicaid_id');
  if (blank(facts.member_id)) facts.member_id = newest(docs, 'field_member_id');
  if (blank(facts.date_of_birth)) facts.date_of_birth = newest(docs, 'field_member_dob');
  if (blank(facts.njhmis_id)) facts.njhmis_id = newest(docs, 'field_njhmis_id');

  const intake = ((intakeRes.data ?? []) as Record<string, string | null>[])[0];
  if (intake) {
    if (blank(facts.medicaid_id)) facts.medicaid_id = intake.medicaid_number;
    if (blank(facts.member_id)) facts.member_id = intake.mco_number;
    if (blank(facts.emergency_contact_name)) facts.emergency_contact_name = intake.emergency_contact_name;
    if (blank(facts.emergency_contact_phone)) facts.emergency_contact_phone = intake.emergency_contact_phone;
    if (facts.household_size == null) {
      const { count } = await db
        .from('client_intake_household_members')
        .select('id', { count: 'exact', head: true })
        .eq('intake_id', intake.id);
      // The members listed are the people living with the member.
      if (count) facts.household_size = count + 1;
    }
  }
  // Still missing: the numbers typed on the client's newest intake form, a
  // draft included, so the IAT and LON carry what the intake says.
  if (blank(facts.medicaid_id) || blank(facts.member_id)) {
    const intakeForm = docs
      .filter((d) => d.form_type === 'Client Intake' && d.file_path)
      .sort((a, b) => String(b.updated_at ?? b.created_at).localeCompare(String(a.updated_at ?? a.created_at)))[0];
    if (intakeForm) {
      const values = await readIntakeIds(String(intakeForm.file_path));
      if (blank(facts.medicaid_id) && values.medicaid_number) facts.medicaid_id = values.medicaid_number;
      if (blank(facts.member_id) && values.mco_number) facts.member_id = values.mco_number;
    }
  }
  return facts;
}

async function readIntakeIds(path: string): Promise<Record<string, string>> {
  try {
    const { data } = await supabase.storage.from('client-files').download(path);
    if (!data) return {};
    const values = await extractPdfFieldValues(await data.arrayBuffer());
    return { medicaid_number: (values.medicaid_number ?? '').trim(), mco_number: (values.mco_number ?? '').trim() };
  } catch {
    return {};
  }
}

/**
 * The case manager written on a form: the client's assigned case manager when
 * there is one, otherwise the person filling it in, with the agency's name.
 */
export async function loadCaseManagerFacts(profileId: string | null | undefined): Promise<AutofillCaseManager> {
  const [profile, agency] = await Promise.all([
    profileId
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any).from('profiles').select('first_name, last_name, email, phone').eq('id', profileId).maybeSingle()
      : Promise.resolve({ data: null }),
    loadAvailitySettings().catch(() => null),
  ]);
  const p = profile.data as { first_name: string | null; last_name: string | null; email: string; phone: string | null } | null;
  return {
    name: p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || null : null,
    email: p?.email ?? null,
    phone: p?.phone || agency?.phone || null,
    organization: agency?.organization || agency?.providerName || null,
  };
}
