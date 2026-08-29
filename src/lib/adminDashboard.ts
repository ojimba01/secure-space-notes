import { supabase } from '@/integrations/supabase/client';
import { todayAgency } from '@/lib/compliance';

/**
 * The three questions Shade opens this page to answer.
 *
 * Recorded from her on 2026-08-28: are staff doing their touchpoints, which
 * billing cycles are running out of time to submit, and are Housing
 * Stabilization Plans going in on time.
 */

/**
 * `profiles.touchpoint_go_live_date` and `clients.hsp_submitted_at` are newer
 * than the generated types, which Lovable regenerates only after the migration
 * is applied. Narrowed here so nothing else loses its typing.
 */
const loosely = supabase as unknown as {
  from: (t: string) => ReturnType<typeof supabase.from>;
};

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

export interface ExpiringClaim {
  id: string;
  clientId: string;
  clientName: string;
  cycleNumber: number | null;
  cycleEnd: string | null;
  deadline: string;
  amount: number | null;
  daysLeft: number;
}

/**
 * Cycles that can still be billed, soonest deadline first.
 *
 * A claim has six months from the end of its cycle to be filed. After that the
 * money is gone, and nothing else on this page is irreversible in that way,
 * which is why it sits at the top.
 *
 * Only cycles nobody has dealt with: submitted, paid and cycles marked filed
 * outside this app are all already handled.
 */
export async function loadExpiringClaims(withinDays = 60): Promise<ExpiringClaim[]> {
  const today = todayAgency();
  const { data, error } = await supabase
    .from('billing_cycles')
    .select('id, client_id, cycle_number, cycle_end, final_deadline, billed_amount, clients:client_id (first_name, last_name, assigned_employee_id)')
    .is('submitted_date', null)
    .not('final_deadline', 'is', null)
    .lte('final_deadline', addDays(today, withinDays))
    .or('approval_state.is.null,approval_state.eq.Open')
    .order('final_deadline', { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);

  return (data ?? [])
    // A cycle with no case manager is Shade's own work, not a staff failure,
    // and she asked for it to stay off this page.
    .filter((r: any) => r.clients?.assigned_employee_id)
    .map((r: any) => ({
      id: r.id,
      clientId: r.client_id,
      clientName: `${r.clients?.last_name ?? ''}, ${r.clients?.first_name ?? ''}`.trim(),
      cycleNumber: r.cycle_number,
      cycleEnd: r.cycle_end,
      deadline: r.final_deadline,
      amount: r.billed_amount,
      daysLeft: Math.round(
        (new Date(`${r.final_deadline}T00:00:00`).getTime() -
          new Date(`${today}T00:00:00`).getTime()) /
          86_400_000,
      ),
    }));
}

export interface HspRow {
  id: string;
  clientName: string;
  staffId: string | null;
  dueDate: string;
  daysLate: number;
}

export interface HspPicture {
  /** Past the 25th day and still not submitted. */
  overdue: HspRow[];
  /** Due within five days and still not submitted. */
  dueSoon: HspRow[];
  /** Submitted, but after the due date. Only measurable from 2026-08-29. */
  submittedLate: HspRow[];
  /** Submitted before the timestamp existed, so punctuality is unknown. */
  unknownDate: number;
}

/**
 * Whether plans are going in by day 25 of the initial authorization.
 *
 * A 150-day or 180-day authorization number proves the plan was submitted, so
 * a client holding one is never chased, whatever the flag says.
 */
export async function loadHspPicture(): Promise<HspPicture> {
  const today = todayAgency();
  const { data, error } = await loosely
    .from('clients')
    .select(
      'id, first_name, last_name, assigned_employee_id, hsp_due_date, hsp_submitted, hsp_submitted_at, auth_150_number, auth_180_number',
    )
    .is('deleted_at', null)
    .eq('status', 'active')
    .not('hsp_due_date', 'is', null)
    .not('assigned_employee_id', 'is', null);
  if (error) throw new Error(error.message);

  const picture: HspPicture = { overdue: [], dueSoon: [], submittedLate: [], unknownDate: 0 };
  const soon = addDays(today, 5);

  for (const c of (data ?? []) as any[]) {
    const submitted =
      c.hsp_submitted === true ||
      !!(c.auth_150_number ?? '').trim() ||
      !!(c.auth_180_number ?? '').trim();
    const row: HspRow = {
      id: c.id,
      clientName: `${c.last_name ?? ''}, ${c.first_name ?? ''}`.trim(),
      staffId: c.assigned_employee_id,
      dueDate: c.hsp_due_date,
      daysLate: Math.round(
        (new Date(`${today}T00:00:00`).getTime() -
          new Date(`${c.hsp_due_date}T00:00:00`).getTime()) /
          86_400_000,
      ),
    };

    if (!submitted) {
      if (c.hsp_due_date < today) picture.overdue.push(row);
      else if (c.hsp_due_date <= soon) picture.dueSoon.push(row);
      continue;
    }

    const submittedOn = (c.hsp_submitted_at ?? '').slice(0, 10);
    if (!submittedOn) picture.unknownDate += 1;
    else if (submittedOn > c.hsp_due_date) {
      picture.submittedLate.push({
        ...row,
        daysLate: Math.round(
          (new Date(`${submittedOn}T00:00:00`).getTime() -
            new Date(`${c.hsp_due_date}T00:00:00`).getTime()) /
            86_400_000,
        ),
      });
    }
  }

  picture.overdue.sort((a, b) => b.daysLate - a.daysLate);
  picture.dueSoon.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  picture.submittedLate.sort((a, b) => b.daysLate - a.daysLate);
  return picture;
}

export interface StaffTouchpointRow {
  profileId: string;
  name: string;
  /** Null until an administrator starts them. */
  goLive: string | null;
  acknowledgedAt: string | null;
  clients: number;
  overdueClients: number;
}

/** Case managers, whether they have started, and how far behind they are. */
export async function loadStaffTouchpointRows(
  overdueByStaff: Map<string, number>,
): Promise<StaffTouchpointRow[]> {
  const { data: profiles, error } = await loosely
    .from('profiles')
    .select('id, first_name, last_name, email, active, touchpoint_go_live_date, touchpoint_tutorial_acknowledged_at')
    .eq('active', true);
  if (error) throw new Error(error.message);

  const { data: counts } = await supabase
    .from('clients')
    .select('assigned_employee_id')
    .is('deleted_at', null)
    .eq('status', 'active')
    .not('assigned_employee_id', 'is', null);

  const caseload = new Map<string, number>();
  for (const row of counts ?? []) {
    const id = row.assigned_employee_id as string;
    caseload.set(id, (caseload.get(id) ?? 0) + 1);
  }

  return ((profiles ?? []) as any[])
    .map((p) => ({
      profileId: p.id,
      name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email,
      goLive: p.touchpoint_go_live_date ?? null,
      acknowledgedAt: p.touchpoint_tutorial_acknowledged_at ?? null,
      clients: caseload.get(p.id) ?? 0,
      overdueClients: overdueByStaff.get(p.id) ?? 0,
    }))
    .filter((r) => r.clients > 0)
    .sort((a, b) => b.overdueClients - a.overdueClients || a.name.localeCompare(b.name));
}

/** Admin only. Null starts them today; a date starts them then. */
export async function setStaffGoLive(profileId: string, date: string | null): Promise<void> {
  const { error } = await loosely
    .from('profiles')
    .update({ touchpoint_go_live_date: date } as never)
    .eq('id', profileId);
  if (error) throw new Error(error.message);
}
