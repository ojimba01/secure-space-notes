// Compliance cron: monthly generation, daily status recompute, month-end emergency
// stop-gate, and weekly fair-rotation audit. Invoke with { job }.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TZ = 'America/New_York';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// ---- date helpers ----
const toDate = (s: string) => new Date(`${s}T12:00:00Z`);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86400000);
const firstOfMonth = (s: string) => `${s.slice(0, 7)}-01`;
const lastOfMonth = (s: string) => { const d = toDate(firstOfMonth(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return fmt(d); };
const todayAgency = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

const reqForTier = (tier: string) =>
  tier === 'High Level'
    ? { requiredContacts: 4, requiredInPerson: 2, requiredActivities: 2 }
    : { requiredContacts: 2, requiredInPerson: 0, requiredActivities: 0 };

function jitter(base: string, range: number) {
  return addDays(base, Math.floor(Math.random() * (range * 2 + 1)) - range);
}
function generatePlanDates(tier: string, monthStart: string, startFrom?: string) {
  const monthEnd = lastOfMonth(monthStart);
  const begin = startFrom && daysBetween(monthStart, startFrom) > 0 ? startFrom : addDays(monthStart, 2);
  const clamp = (d: string) => (daysBetween(d, monthEnd) < 0 ? monthEnd : d);
  const out: any[] = [];
  if (tier === 'High Level') {
    [0, 1, 2, 3].forEach((i) =>
      out.push({ date: clamp(jitter(addDays(begin, i * 7), 2)), modality: i % 2 === 0 ? 'in_person' : 'phone', suggested: true }));
  } else {
    out.push({ date: clamp(jitter(addDays(begin, 3), 2)), modality: 'phone', suggested: true });
    out.push({ date: clamp(jitter(addDays(begin, 17), 2)), modality: 'phone', suggested: true });
  }
  return out;
}

function distinctDays(contacts: any[]) { return Array.from(new Set(contacts.map((c) => c.contact_date))).sort(); }
function spacedInPerson(contacts: any[]) {
  const dates = Array.from(new Set(contacts.filter((c) => c.modality === 'in_person').map((c) => c.contact_date))).sort();
  const kept: string[] = [];
  for (const d of dates) if (!kept.length || daysBetween(kept[kept.length - 1], d) >= 7) kept.push(d);
  return kept;
}
function isComplete(req: any, contacts: any[], activities: string[], note: string | null) {
  return distinctDays(contacts).length >= req.requiredContacts &&
    spacedInPerson(contacts).length >= req.requiredInPerson &&
    activities.length >= req.requiredActivities &&
    (req.requiredActivities === 0 || (!!note && note.trim().length > 0));
}
function isFeasible(req: any, contacts: any[], today: string) {
  const monthEnd = lastOfMonth(today);
  if (daysBetween(today, monthEnd) < 0) return true;
  const used = new Set(distinctDays(contacts));
  const remaining = Math.max(0, req.requiredContacts - used.size);
  let free = 0;
  for (let d = today; daysBetween(d, monthEnd) >= 0; d = addDays(d, 1)) if (!used.has(d)) free++;
  if (remaining > free) return false;
  const spaced = spacedInPerson(contacts);
  const ipRem = Math.max(0, req.requiredInPerson - spaced.length);
  if (ipRem > 0) {
    let earliest = today;
    if (spaced.length) { const c = addDays(spaced[spaced.length - 1], 7); if (daysBetween(today, c) > 0) earliest = c; }
    if (daysBetween(addDays(earliest, (ipRem - 1) * 7), monthEnd) < 0) return false;
  }
  return true;
}

async function activeClients() {
  const { data } = await supabase
    .from('clients')
    .select('id, first_name, last_name, level_of_need, assigned_employee_id, created_at, status')
    .eq('status', 'active');
  return data ?? [];
}

async function adminEmails() {
  const { data: roles } = await supabase.from('user_roles').select('user_id').in('role', ['admin', 'superadmin']);
  const ids = (roles ?? []).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: profs } = await supabase.from('profiles').select('email').in('user_id', ids);
  return (profs ?? []).map((p) => p.email).filter(Boolean);
}

async function sendEmail(subject: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) { console.log('RESEND_API_KEY not set; skipping email:', subject); return; }
  const to = await adminEmails();
  if (!to.length) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'Compliance <compliance@resend.dev>', to, subject, html }),
    });
  } catch (e) { console.error('email error', e); }
}

// ---- jobs ----
// keep lighter "suggested" touch-point calendar entries in sync with plan_dates
async function syncSuggested(clientId: string, employeeId: string | null, plan: any[], contacts: any[], clientName: string) {
  if (!employeeId) return;
  await supabase.from('calendar_events').delete().eq('client_id', clientId).eq('event_type', 'touchpoint_suggested');
  const today = todayAgency();
  const rows = (plan ?? [])
    .filter((p) => p.date && daysBetween(today, p.date) >= 0 && !contacts.some((c) => c.contact_date === p.date))
    .map((p) => {
      const iso = `${p.date}T12:00:00.000Z`;
      return {
        title: `Suggested ${p.modality === 'in_person' ? 'in-person' : p.modality} touch-point — ${clientName}`,
        event_type: 'touchpoint_suggested',
        employee_id: employeeId,
        client_id: clientId,
        start_time: iso,
        end_time: iso,
      };
    });
  if (rows.length) await supabase.from('calendar_events').insert(rows);
}

async function monthlyGenerate() {
  const today = todayAgency();
  const month = firstOfMonth(today);
  const clients = await activeClients();
  let created = 0;
  for (const c of clients) {
    const tier = c.level_of_need === 'High Level' ? 'High Level' : 'Low Level';
    const req = reqForTier(tier);
    const { data: existing } = await supabase
      .from('client_month_compliance').select('id').eq('client_id', c.id).eq('month', month).maybeSingle();
    if (existing) continue;
    const isNew = !!c.created_at && daysBetween('2026-07-01', c.created_at.slice(0, 10)) >= 0 &&
      firstOfMonth(c.created_at.slice(0, 10)) === month;
    const plan = generatePlanDates(tier, month);
    await supabase.from('client_month_compliance').insert({
      client_id: c.id, employee_id: c.assigned_employee_id, month, lon_tier: tier,
      required_contacts: req.requiredContacts, required_in_person: req.requiredInPerson,
      required_activities: req.requiredActivities, is_new_client: isNew,
      plan_dates: plan,
    });
    await syncSuggested(c.id, c.assigned_employee_id, plan, [], `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim());
    created++;
  }
  return { created };
}

async function dailyRecompute() {
  const today = todayAgency();
  const month = firstOfMonth(today);
  const { data: rows } = await supabase.from('client_month_compliance').select('*').eq('month', month);
  let updated = 0;
  for (const r of rows ?? []) {
    const req = { requiredContacts: r.required_contacts, requiredInPerson: r.required_in_person, requiredActivities: r.required_activities };
    const { data: cts } = await supabase.from('client_contacts').select('contact_date, modality').eq('client_id', r.client_id).gte('contact_date', month);
    const contacts = cts ?? [];
    const acts = Array.isArray(r.activities_done) ? r.activities_done : [];
    // refresh passed suggested plan dates
    const plan = (Array.isArray(r.plan_dates) ? r.plan_dates : []).map((p: any) => {
      const logged = contacts.some((ct) => ct.contact_date === p.date);
      if (!logged && daysBetween(p.date, today) > 0) {
        const next = addDays(today, p.modality === 'in_person' ? 7 : 3);
        return { ...p, date: daysBetween(next, lastOfMonth(today)) < 0 ? lastOfMonth(today) : next };
      }
      return p;
    });
    let status: string;
    if (isComplete(req, contacts, acts, r.summary_note)) status = 'complete';
    else if (r.is_new_client && daysBetween(r.month, today) < 7) status = 'on_track';
    else status = isFeasible(req, contacts, today) ? 'on_track' : 'behind';
    await supabase.from('client_month_compliance').update({ status, plan_dates: plan }).eq('id', r.id);
    const { data: cl } = await supabase.from('clients').select('first_name, last_name').eq('id', r.client_id).maybeSingle();
    await syncSuggested(r.client_id, r.employee_id, plan, contacts, `${cl?.first_name ?? ''} ${cl?.last_name ?? ''}`.trim());
    updated++;
  }
  return { updated };
}

async function monthlyEmergency() {
  const today = todayAgency();
  const prevMonthEnd = addDays(firstOfMonth(today), -1);
  const month = firstOfMonth(prevMonthEnd);
  if (daysBetween('2026-07-01', month) < 0) return { skipped: 'before enforcement' };
  const { data: rows } = await supabase.from('client_month_compliance').select('*').eq('month', month);
  let flagged = 0;
  for (const r of rows ?? []) {
    const req = { requiredContacts: r.required_contacts, requiredInPerson: r.required_in_person, requiredActivities: r.required_activities };
    const { data: cts } = await supabase.from('client_contacts').select('contact_date, modality').eq('client_id', r.client_id).gte('contact_date', month).lte('contact_date', prevMonthEnd);
    const contacts = cts ?? [];
    const acts = Array.isArray(r.activities_done) ? r.activities_done : [];
    if (isComplete(req, contacts, acts, r.summary_note)) continue;
    const outstanding = {
      contacts: `${distinctDays(contacts).length}/${req.requiredContacts}`,
      in_person: `${spacedInPerson(contacts).length}/${req.requiredInPerson}`,
      activities: `${acts.length}/${req.requiredActivities}`,
      note: req.requiredActivities > 0 && !(r.summary_note && r.summary_note.trim()) ? 'missing' : 'ok',
    };
    const { data: dup } = await supabase.from('compliance_escalations')
      .select('id').eq('kind', 'emergency_incomplete').eq('client_id', r.client_id).eq('period', month).maybeSingle();
    if (!dup) {
      await supabase.from('compliance_escalations').insert({
        employee_id: r.employee_id, client_id: r.client_id, kind: 'emergency_incomplete',
        period: month, outstanding, status: 'open',
      });
      flagged++;
    }
    await supabase.from('client_month_compliance').update({ status: 'incomplete_escalated' }).eq('id', r.id);
  }
  if (flagged) await sendEmail(`URGENT: ${flagged} client(s) ended ${month.slice(0, 7)} incomplete`,
    `<p>${flagged} client(s) did not meet their monthly touch-point requirements for ${month.slice(0, 7)}. Reach out to the assigned case managers. Open the app to review.</p>`);
  return { flagged };
}

async function weeklyAudit() {
  const { data: setting } = await supabase.from('compliance_settings').select('value').eq('key', 'weekly_audit_enabled').maybeSingle();
  if (setting && setting.value === false) return { skipped: 'audit disabled' };

  const today = todayAgency();
  // candidate case managers = active profiles with active clients, excluding superadmins
  const clients = await activeClients();
  const candidateIds = Array.from(new Set(clients.map((c) => c.assigned_employee_id).filter(Boolean)));
  if (!candidateIds.length) return { skipped: 'no case managers' };
  const { data: roles } = await supabase.from('user_roles').select('user_id').eq('role', 'superadmin');
  const superUserIds = new Set((roles ?? []).map((r) => r.user_id));
  const { data: profs } = await supabase.from('profiles').select('id, user_id, first_name, last_name, email').in('id', candidateIds);
  const candidates = (profs ?? []).filter((p) => !superUserIds.has(p.user_id));
  if (!candidates.length) return { skipped: 'no eligible case managers' };

  // fair rotation from recent weekly_audit escalations
  const { data: past } = await supabase.from('compliance_escalations')
    .select('employee_id, created_at').eq('kind', 'weekly_audit').order('created_at', { ascending: false }).limit(50);
  const history = (past ?? []).map((p) => p.employee_id);
  const lastAudited = history[0] ?? null;
  // current rotation = most recent audits until we'd repeat someone
  const seen = new Set<string>();
  for (const id of history) {
    if (seen.has(id)) break;
    seen.add(id);
  }
  let pool = candidates.filter((c) => !seen.has(c.id));
  if (!pool.length) pool = candidates.slice(); // new rotation
  pool = pool.filter((c) => c.id !== lastAudited);
  if (!pool.length) pool = candidates.filter((c) => c.id !== lastAudited);
  if (!pool.length) pool = candidates.slice();
  const pick = pool[Math.floor(Math.random() * pool.length)];

  // gather outstanding + claimed-complete for this person this month
  const month = firstOfMonth(today);
  const { data: rows } = await supabase.from('client_month_compliance').select('*').eq('employee_id', pick.id).eq('month', month);
  const outstanding: any[] = [];
  const claimed: any[] = [];
  for (const r of rows ?? []) {
    const req = { requiredContacts: r.required_contacts, requiredInPerson: r.required_in_person, requiredActivities: r.required_activities };
    const { data: cts } = await supabase.from('client_contacts').select('contact_date, modality').eq('client_id', r.client_id).gte('contact_date', month);
    const contacts = cts ?? [];
    const acts = Array.isArray(r.activities_done) ? r.activities_done : [];
    const item = { client_id: r.client_id, contacts: `${distinctDays(contacts).length}/${req.requiredContacts}`, in_person: `${spacedInPerson(contacts).length}/${req.requiredInPerson}`, activities: acts.length };
    if (isComplete(req, contacts, acts, r.summary_note)) claimed.push(item);
    else outstanding.push(item);
  }

  await supabase.from('compliance_escalations').insert({
    employee_id: pick.id, kind: 'weekly_audit', period: today,
    outstanding, claimed_complete: claimed, status: 'open',
  });
  await sendEmail(`Weekly audit: ${pick.first_name ?? ''} ${pick.last_name ?? ''}`.trim(),
    `<p>This week's randomly selected case manager for HMIS verification is <b>${pick.first_name ?? ''} ${pick.last_name ?? ''}</b>.</p>
     <p>${claimed.length} item(s) marked complete — please log into HMIS and confirm the records were actually entered. ${outstanding.length} item(s) still outstanding. Open the app for details.</p>`);
  return { picked: pick.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { job } = await req.json().catch(() => ({ job: '' }));
    let result;
    switch (job) {
      case 'monthly_generate': result = await monthlyGenerate(); break;
      case 'daily_recompute': result = await dailyRecompute(); break;
      case 'monthly_emergency': result = await monthlyEmergency(); break;
      case 'weekly_audit': result = await weeklyAudit(); break;
      default: return new Response(JSON.stringify({ error: 'unknown job' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, job, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
