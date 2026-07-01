import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Download, Pencil } from 'lucide-react';
import {
  BillingCycle,
  BILLING_STATUSES,
  PAYMENT_STATUSES,
  MCO_OPTIONS,
  billingBadgeClass,
  paymentBadgeClass,
  formatMoney,
  isPastDue,
  monthKey,
  todayAgency,
  daysBetween,
  nextBillDue,
  MAX_CYCLES,
} from '@/lib/billing';
import { BillingClient } from '@/hooks/useBilling';
import { BillingCycleDialog } from '@/components/billing/BillingCycleDialog';
import { EditClientDialog } from '@/components/EditClientDialog';

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  refresh: () => void;
  onOpenTimeline: (clientId: string) => void;
}

type ViewKey =
  | 'master'
  | 'pending'
  | 'approved'
  | 'closed'
  | 'tracker'
  | 'cycles';

const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'master', label: 'Master Case Tracker' },
  { key: 'pending', label: 'Pending Approval' },
  { key: 'approved', label: 'Approved Cases' },
  { key: 'closed', label: 'Closed Cases' },
  { key: 'tracker', label: 'Billing Tracker' },
  { key: 'cycles', label: 'Billing (by cycle)' },
];

const isClosed = (c: BillingClient) => c.status !== 'active';

// Pick the client's "current" cycle: the one whose range contains today, else latest.
function pickCurrentCycle(list: BillingCycle[]): BillingCycle | null {
  if (!list.length) return null;
  const today = todayAgency();
  const containing = list.find(
    (c) => daysBetween(c.cycle_start, today) >= 0 && daysBetween(today, c.cycle_end) >= 0,
  );
  if (containing) return containing;
  return list.reduce<BillingCycle | null>((a, b) => (!a || b.cycle_number > a.cycle_number ? b : a), null);
}

const frozenHead = 'sticky left-0 z-20 bg-muted';
const frozenCell = 'sticky left-0 z-10 bg-background';

export const BillingMasterList: React.FC<Props> = ({ clients: approvedClients, cycles, refresh, onOpenTimeline }) => {
  const [view, setView] = useState<ViewKey>('master');
  const [search, setSearch] = useState('');
  const [mco, setMco] = useState('all');
  const [phase, setPhase] = useState('all');
  const [billing, setBilling] = useState('all');
  const [payment, setPayment] = useState('all');
  const [due, setDue] = useState('all');
  const [staff, setStaff] = useState('all');
  const [editing, setEditing] = useState<BillingCycle | null>(null);
  const [open, setOpen] = useState(false);

  // Case-tracker views need ALL clients (pending/denied/closed), not just Approved.
  const [allClients, setAllClients] = useState<BillingClient[]>([]);
  const [editClient, setEditClient] = useState<Record<string, unknown> | null>(null);
  const [editClientOpen, setEditClientOpen] = useState(false);

  const loadAll = useCallback(async () => {
    const { data: cls } = await supabase
      .from('clients')
      .select(
        'id, first_name, last_name, insurance, member_id, level_of_need, status, approval_status, auth_150_start, auth_150_end, auth_180_start, auth_180_end, assigned_employee_id, phone, intake_date, assessment_due_date, mco_housing_manager, auth_30_number, auth_30_start, auth_30_end, hsp_due_date, auth_150_number, auth_180_number, next_action_due_date, closed_date, reason_closed, notes',
      )
      .order('last_name');
    const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name, email');
    const nameById = new Map(
      (profs ?? []).map((p) => {
        const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        return [p.id, full || p.email] as const;
      }),
    );
    const mapped = ((cls as Array<Omit<BillingClient, 'assigned_staff_name'>>) ?? []).map((c) => ({
      ...c,
      assigned_staff_name: c.assigned_employee_id ? nameById.get(c.assigned_employee_id) ?? null : null,
    }));
    setAllClients(mapped as BillingClient[]);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll, approvedClients]);

  const refreshAll = () => {
    refresh();
    loadAll();
  };

  const openEditClient = async (clientId: string) => {
    const { data, error } = await supabase.from('clients').select('*').eq('id', clientId).single();
    if (error || !data) {
      toast.error('Could not load client');
      return;
    }
    setEditClient(data as Record<string, unknown>);
    setEditClientOpen(true);
  };

  // Cycles grouped by client
  const cyclesByClient = useMemo(() => {
    const m = new Map<string, BillingCycle[]>();
    cycles.forEach((c) => {
      const arr = m.get(c.client_id) ?? [];
      arr.push(c);
      m.set(c.client_id, arr);
    });
    m.forEach((arr) => arr.sort((a, b) => a.cycle_number - b.cycle_number));
    return m;
  }, [cycles]);

  const clientMap = useMemo(() => new Map(approvedClients.map((c) => [c.id, c])), [approvedClients]);

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    allClients.forEach((c) => {
      if (c.assigned_employee_id && c.assigned_staff_name) map.set(c.assigned_employee_id, c.assigned_staff_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allClients]);

  const thisMonth = monthKey(todayAgency());
  const today = todayAgency();

  // Shared client-level filter (Search / MCO / Staff)
  const matchesShared = useCallback(
    (cl: BillingClient) => {
      if (search) {
        const name = `${cl.first_name} ${cl.last_name}`.toLowerCase();
        if (!name.includes(search.toLowerCase()) && !(cl.member_id ?? '').toLowerCase().includes(search.toLowerCase()))
          return false;
      }
      if (mco !== 'all' && cl.insurance !== mco) return false;
      if (staff !== 'all') {
        if (staff === '__unassigned__' ? !!cl.assigned_employee_id : cl.assigned_employee_id !== staff) return false;
      }
      return true;
    },
    [search, mco, staff],
  );

  // ---- per-client context for computed columns ----
  const ctxFor = useCallback(
    (cl: BillingClient) => {
      const cyc = cyclesByClient.get(cl.id) ?? [];
      const cur = pickCurrentCycle(cyc);
      const dud = cl.next_action_due_date ? daysBetween(today, cl.next_action_due_date) : null;
      const overdue = dud != null && dud < 0 && !isClosed(cl);
      return { cl, cyc, cur, dud, overdue };
    },
    [cyclesByClient, today],
  );

  const billChip = (cur: BillingCycle | null) =>
    cur ? <Badge className={billingBadgeClass(cur.billing_status)}>{cur.billing_status}</Badge> : <span className="text-muted-foreground">—</span>;
  const payChip = (cur: BillingCycle | null) =>
    cur ? <Badge className={paymentBadgeClass(cur.payment_status)}>{cur.payment_status}</Badge> : <span className="text-muted-foreground">—</span>;

  const dv = (v: string | null | undefined) => (v ? v : '—');

  // ================= per-cycle view (unchanged behavior) =================
  const cycleRows = useMemo(() => {
    return cycles
      .filter((c) => {
        const cl = clientMap.get(c.client_id);
        if (!cl) return false;
        if (!matchesShared(cl)) return false;
        if (phase !== 'all' && c.phase !== phase) return false;
        if (billing !== 'all' && c.billing_status !== billing) return false;
        if (payment !== 'all' && c.payment_status !== payment) return false;
        if (due === 'this_month' && monthKey(c.cycle_end) !== thisMonth) return false;
        if (due === 'overdue' && !isPastDue(c)) return false;
        return true;
      })
      .map((c) => ({ cycle: c, client: clientMap.get(c.client_id)! }));
  }, [cycles, clientMap, matchesShared, phase, billing, payment, due, thisMonth]);

  const updateField = async (id: string, patch: Partial<BillingCycle>) => {
    const { error } = await supabase.from('billing_cycles').update({ ...patch, is_auto_generated: false }).eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Updated');
    refresh();
  };

  // ================= client-row views =================
  const clientRows = useMemo(() => {
    let base = allClients.filter(matchesShared);
    if (view === 'pending') {
      base = base.filter((c) => !isClosed(c) && ['Not Submitted', 'Submitted', 'Denied'].includes(c.approval_status ?? 'Not Submitted'));
    } else if (view === 'approved') {
      base = base.filter((c) => !isClosed(c) && c.approval_status === 'Approved');
    } else if (view === 'closed') {
      base = base.filter((c) => isClosed(c));
    }
    return base;
  }, [allClients, matchesShared, view]);

  // ---- CSV export ----
  const download = (header: string[], lines: (string | number)[][], name: string) => {
    const csv = [header, ...lines].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${todayAgency()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    if (view === 'cycles') {
      download(
        ['Client', 'MCO', 'Member ID', 'Phase', 'Cycle', 'Start', 'End', 'Amount', 'Paid', 'Billing Status', 'Payment Status'],
        cycleRows.map(({ cycle: c, client: cl }) => [
          `${cl.first_name} ${cl.last_name}`, cl.insurance ?? '', cl.member_id ?? '', c.phase, c.cycle_number,
          c.cycle_start, c.cycle_end, c.billed_amount ?? '', c.paid_amount ?? 0, c.billing_status, c.payment_status,
        ]),
        'billing-by-cycle',
      );
      return;
    }
    if (view === 'master') {
      download(
        ['Client', 'MCO', 'Member ID', 'Phone', 'Intake Date', 'Assessment Due', 'Assigned Staff', 'MCO Housing Manager',
          '30-Day Auth #', '30-Day Start', '30-Day End', 'HSP Due Date', 'Approval Status', '150-Day Auth #', '150-Day Start',
          '150-Day End', '180-Day Auth #', '180-Day Start', '180-Day End', 'Next Action Due', 'Days Until Due', 'Overdue?',
          'Billing Status', 'Payment Status', 'Closed Date', 'Reason Closed', 'Notes'],
        clientRows.map((cl) => {
          const x = ctxFor(cl);
          return [
            `${cl.first_name} ${cl.last_name}`, cl.insurance ?? '', cl.member_id ?? '', cl.phone ?? '', cl.intake_date ?? '',
            cl.assessment_due_date ?? '', cl.assigned_staff_name ?? '', cl.mco_housing_manager ?? '', cl.auth_30_number ?? '',
            cl.auth_30_start ?? '', cl.auth_30_end ?? '', cl.hsp_due_date ?? '', cl.approval_status ?? '', cl.auth_150_number ?? '',
            cl.auth_150_start ?? '', cl.auth_150_end ?? '', cl.auth_180_number ?? '', cl.auth_180_start ?? '', cl.auth_180_end ?? '',
            cl.next_action_due_date ?? '', x.dud ?? '', x.overdue ? 'Yes' : 'No', x.cur?.billing_status ?? '', x.cur?.payment_status ?? '',
            cl.closed_date ?? '', cl.reason_closed ?? '', cl.notes ?? '',
          ];
        }),
        'master-case-tracker',
      );
      return;
    }
    if (view === 'pending') {
      download(
        ['Client', 'MCO', 'Member ID', 'Phone', 'Intake Date', 'Assessment Due', 'Assigned Staff', 'MCO Housing Manager', 'Approval Status', 'Notes'],
        clientRows.map((cl) => [`${cl.first_name} ${cl.last_name}`, cl.insurance ?? '', cl.member_id ?? '', cl.phone ?? '',
          cl.intake_date ?? '', cl.assessment_due_date ?? '', cl.assigned_staff_name ?? '', cl.mco_housing_manager ?? '', cl.approval_status ?? '', cl.notes ?? '']),
        'pending-approval',
      );
      return;
    }
    if (view === 'approved') {
      download(
        ['Client', 'MCO', 'Member ID', 'Phone', '30-Day End', 'HSP Due Date', 'Approval Status', '150-Day End', '180-Day Start',
          '180-Day End', 'Next Action Due', 'Days Until Due', 'Overdue?', 'Billing Status', 'Payment Status'],
        clientRows.map((cl) => {
          const x = ctxFor(cl);
          return [`${cl.first_name} ${cl.last_name}`, cl.insurance ?? '', cl.member_id ?? '', cl.phone ?? '', cl.auth_30_end ?? '',
            cl.hsp_due_date ?? '', cl.approval_status ?? '', cl.auth_150_end ?? '', cl.auth_180_start ?? '', cl.auth_180_end ?? '',
            cl.next_action_due_date ?? '', x.dud ?? '', x.overdue ? 'Yes' : 'No', x.cur?.billing_status ?? '', x.cur?.payment_status ?? ''];
        }),
        'approved-cases',
      );
      return;
    }
    if (view === 'closed') {
      download(
        ['Client', 'MCO', 'Member ID', 'Closed Date', 'Reason Closed', 'Billing Status', 'Payment Status', 'Notes'],
        clientRows.map((cl) => {
          const x = ctxFor(cl);
          return [`${cl.first_name} ${cl.last_name}`, cl.insurance ?? '', cl.member_id ?? '', cl.closed_date ?? '',
            cl.reason_closed ?? '', x.cur?.billing_status ?? '', x.cur?.payment_status ?? '', cl.notes ?? ''];
        }),
        'closed-cases',
      );
      return;
    }
    if (view === 'tracker') {
      const header = ['Client', 'MCO', 'Member ID', 'Current Phase', 'Next Bill Due'];
      for (let n = 1; n <= MAX_CYCLES; n++) header.push(`${n} Start`, `${n} End`);
      download(
        header,
        clientRows.map((cl) => {
          const cyc = cyclesByClient.get(cl.id) ?? [];
          const cur = pickCurrentCycle(cyc);
          const phaseLabel = cl.auth_150_start && cur ? cur.phase : 'Not started';
          const nbd = nextBillDue(cyc, cl.auth_150_start) ?? '';
          const row: (string | number)[] = [`${cl.first_name} ${cl.last_name}`, cl.insurance ?? '', cl.member_id ?? '', phaseLabel, nbd];
          for (let n = 1; n <= MAX_CYCLES; n++) {
            const c = cyc.find((x) => x.cycle_number === n);
            row.push(c?.cycle_start ?? '', c?.cycle_end ?? '');
          }
          return row;
        }),
        'billing-tracker',
      );
      return;
    }
  };

  const th = (label: string, extra = '') => <TableHead className={extra}>{label}</TableHead>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Search client or member ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Select value={mco} onValueChange={setMco}><SelectTrigger className="w-40"><SelectValue placeholder="MCO" /></SelectTrigger><SelectContent><SelectItem value="all">All MCOs</SelectItem>{MCO_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
        <Select value={staff} onValueChange={setStaff}><SelectTrigger className="w-44"><SelectValue placeholder="Staff" /></SelectTrigger><SelectContent><SelectItem value="all">All staff</SelectItem><SelectItem value="__unassigned__">Unassigned</SelectItem>{staffOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
        {view === 'cycles' && (
          <>
            <Select value={phase} onValueChange={setPhase}><SelectTrigger className="w-32"><SelectValue placeholder="Phase" /></SelectTrigger><SelectContent><SelectItem value="all">All phases</SelectItem><SelectItem value="150-Day">150-Day</SelectItem><SelectItem value="180-Day">180-Day</SelectItem></SelectContent></Select>
            <Select value={billing} onValueChange={setBilling}><SelectTrigger className="w-40"><SelectValue placeholder="Billing" /></SelectTrigger><SelectContent><SelectItem value="all">All billing</SelectItem>{BILLING_STATUSES.filter((s) => s !== 'Ready to Bill').map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            <Select value={payment} onValueChange={setPayment}><SelectTrigger className="w-36"><SelectValue placeholder="Payment" /></SelectTrigger><SelectContent><SelectItem value="all">All payments</SelectItem>{PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            <Select value={due} onValueChange={setDue}><SelectTrigger className="w-40"><SelectValue placeholder="Due" /></SelectTrigger><SelectContent><SelectItem value="all">Any due date</SelectItem><SelectItem value="this_month">Due this month</SelectItem><SelectItem value="overdue">Overdue</SelectItem></SelectContent></Select>
          </>
        )}
        <Button variant="outline" onClick={exportCsv} className="gap-2"><Download className="h-4 w-4" />Export CSV</Button>
      </div>

      {/* View switcher */}
      <div className="flex flex-wrap gap-1 border rounded-md p-1 w-fit">
        {VIEWS.map((v) => (
          <Button key={v.key} size="sm" variant={view === v.key ? 'default' : 'ghost'} onClick={() => setView(v.key)}>
            {v.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {view === 'cycles' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  {th('Client', frozenHead)}
                  <TableHead>Assigned Staff</TableHead><TableHead>MCO</TableHead><TableHead>Member ID</TableHead>
                  <TableHead>Phase</TableHead><TableHead>#</TableHead><TableHead>Start</TableHead><TableHead>End</TableHead>
                  <TableHead>Amount</TableHead><TableHead>Paid</TableHead><TableHead>Billing</TableHead><TableHead>Payment</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycleRows.length === 0 && (
                  <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">No cycles match these filters.</TableCell></TableRow>
                )}
                {cycleRows.map(({ cycle: c, client: cl }) => {
                  const pastDue = isPastDue(c);
                  return (
                    <TableRow key={c.id} onClick={() => onOpenTimeline(c.client_id)} className={`cursor-pointer ${pastDue ? 'outline outline-1 outline-red-500' : ''}`}>
                      <TableCell className={`font-medium whitespace-nowrap ${frozenCell}`}>{cl.first_name} {cl.last_name}</TableCell>
                      <TableCell className="whitespace-nowrap">{cl.assigned_staff_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                      <TableCell>{cl.insurance ?? '—'}</TableCell>
                      <TableCell>{cl.member_id ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline">{c.phase}</Badge></TableCell>
                      <TableCell>{c.cycle_number}</TableCell>
                      <TableCell className="whitespace-nowrap">{c.cycle_start}</TableCell>
                      <TableCell className="whitespace-nowrap">{c.cycle_end}{pastDue && <span className="text-red-600 text-xs ml-1">⚠</span>}</TableCell>
                      <TableCell>{formatMoney(c.billed_amount)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Input type="number" className="h-8 w-20" defaultValue={c.paid_amount}
                          onBlur={(e) => { const v = Number(e.target.value); if (v !== c.paid_amount) updateField(c.id, { paid_amount: v }); }} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select value={c.billing_status} onValueChange={(v) => {
                          const patch: Partial<BillingCycle> = { billing_status: v as BillingCycle['billing_status'] };
                          if (v === 'Submitted' && !c.submitted_date) patch.submitted_date = todayAgency();
                          updateField(c.id, patch);
                        }}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>{BILLING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Select value={c.payment_status} onValueChange={(v) => {
                          const patch: Partial<BillingCycle> = { payment_status: v as BillingCycle['payment_status'] };
                          if (v === 'Paid') {
                            if (!c.paid_amount) patch.paid_amount = c.billed_amount ?? 0;
                            if (!c.paid_date) patch.paid_date = todayAgency();
                          }
                          updateField(c.id, patch);
                        }}>
                          <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                          <SelectContent>{PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {th('Client', `${frozenHead}${view === 'master' || view === 'pending' || view === 'tracker' ? ' w-40 min-w-40 max-w-40' : ''}`)}
                  {view === 'master' && <>
                    {th('MCO')}{th('Member ID')}{th('Phone')}{th('Intake Date')}{th('Assessment Due')}{th('Assigned Staff')}{th('MCO Housing Mgr')}
                    {th('30-Day Auth #')}{th('30-Day Start')}{th('30-Day End')}{th('HSP Due')}{th('Approval')}{th('150-Day Auth #')}{th('150-Day Start')}
                    {th('150-Day End')}{th('180-Day Auth #')}{th('180-Day Start')}{th('180-Day End')}{th('Next Action Due')}{th('Days Until Due')}
                    {th('Overdue?')}{th('Billing')}{th('Payment')}{th('Closed Date')}{th('Reason Closed')}{th('Notes')}
                  </>}
                  {view === 'pending' && <>{th('MCO')}{th('Member ID')}{th('Phone')}{th('Intake Date')}{th('Assessment Due')}{th('Assigned Staff')}{th('MCO Housing Mgr')}{th('Approval')}{th('Notes')}</>}
                  {view === 'approved' && <>{th('MCO')}{th('Member ID')}{th('Phone')}{th('30-Day End')}{th('HSP Due')}{th('Approval')}{th('150-Day End')}{th('180-Day Start')}{th('180-Day End')}{th('Next Action Due')}{th('Days Until Due')}{th('Overdue?')}{th('Billing')}{th('Payment')}</>}
                  {view === 'closed' && <>{th('MCO')}{th('Member ID')}{th('Closed Date')}{th('Reason Closed')}{th('Billing')}{th('Payment')}{th('Notes')}</>}
                  {view === 'tracker' && <>{th('MCO')}{th('Member ID')}{th('Current Phase')}{th('Next Bill Due')}{Array.from({ length: MAX_CYCLES }, (_, i) => <React.Fragment key={i}>{th(`${i + 1} Start`)}{th(`${i + 1} End`)}</React.Fragment>)}</>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientRows.length === 0 && (
                  <TableRow><TableCell colSpan={30} className="text-center text-muted-foreground py-8">No clients match these filters.</TableCell></TableRow>
                )}
                {clientRows.map((cl) => {
                  const x = ctxFor(cl);
                  const denied = cl.approval_status === 'Denied';
                  const nameCell = <TableCell className={`font-medium ${view === 'master' || view === 'pending' || view === 'tracker' ? 'w-40 min-w-40 max-w-40 whitespace-normal break-words' : 'whitespace-nowrap'} ${frozenCell} ${denied && view === 'pending' ? 'text-red-600' : ''}`}>{cl.first_name} {cl.last_name}</TableCell>;
                  const dudCell = (
                    <TableCell className={x.overdue ? 'text-red-600 font-medium' : ''}>{x.dud ?? '—'}</TableCell>
                  );
                  const overdueCell = <TableCell>{x.overdue ? <span className="text-red-600 font-medium">Yes</span> : 'No'}</TableCell>;
                  return (
                    <TableRow key={cl.id} className="cursor-pointer" onClick={() => openEditClient(cl.id)}>
                      {nameCell}
                      {view === 'master' && <>
                        <TableCell>{dv(cl.insurance)}</TableCell><TableCell>{dv(cl.member_id)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.phone)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.intake_date)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.assessment_due_date)}</TableCell>
                        <TableCell className="whitespace-nowrap">{cl.assigned_staff_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.mco_housing_manager)}</TableCell>
                        <TableCell>{dv(cl.auth_30_number)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.auth_30_start)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.auth_30_end)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.hsp_due_date)}</TableCell><TableCell>{dv(cl.approval_status)}</TableCell>
                        <TableCell>{dv(cl.auth_150_number)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.auth_150_start)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.auth_150_end)}</TableCell>
                        <TableCell>{dv(cl.auth_180_number)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.auth_180_start)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.auth_180_end)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.next_action_due_date)}</TableCell>{dudCell}{overdueCell}
                        <TableCell>{billChip(x.cur)}</TableCell><TableCell>{payChip(x.cur)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.closed_date)}</TableCell><TableCell>{dv(cl.reason_closed)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{dv(cl.notes)}</TableCell>
                      </>}
                      {view === 'pending' && <>
                        <TableCell>{dv(cl.insurance)}</TableCell><TableCell>{dv(cl.member_id)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.phone)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.intake_date)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.assessment_due_date)}</TableCell>
                        <TableCell className="whitespace-nowrap">{cl.assigned_staff_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.mco_housing_manager)}</TableCell>
                        <TableCell className={denied ? 'text-red-600 font-medium' : ''}>{dv(cl.approval_status)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{dv(cl.notes)}</TableCell>
                      </>}
                      {view === 'approved' && <>
                        <TableCell>{dv(cl.insurance)}</TableCell><TableCell>{dv(cl.member_id)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.phone)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.auth_30_end)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.hsp_due_date)}</TableCell><TableCell>{dv(cl.approval_status)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.auth_150_end)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.auth_180_start)}</TableCell><TableCell className="whitespace-nowrap">{dv(cl.auth_180_end)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.next_action_due_date)}</TableCell>{dudCell}{overdueCell}
                        <TableCell>{billChip(x.cur)}</TableCell><TableCell>{payChip(x.cur)}</TableCell>
                      </>}
                      {view === 'closed' && <>
                        <TableCell>{dv(cl.insurance)}</TableCell><TableCell>{dv(cl.member_id)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dv(cl.closed_date)}</TableCell><TableCell>{dv(cl.reason_closed)}</TableCell>
                        <TableCell>{billChip(x.cur)}</TableCell><TableCell>{payChip(x.cur)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{dv(cl.notes)}</TableCell>
                      </>}
                      {view === 'tracker' && (() => {
                        const cyc = x.cyc;
                        const cur = x.cur;
                        const phaseLabel = cl.auth_150_start && cur ? cur.phase : 'Not started';
                        const nbd = nextBillDue(cyc, cl.auth_150_start);
                        const nbdPast = nbd && daysBetween(nbd, today) > 0 && cur?.billing_status !== 'Submitted';
                        return <>
                          <TableCell>{dv(cl.insurance)}</TableCell><TableCell>{dv(cl.member_id)}</TableCell>
                          <TableCell className="whitespace-nowrap">{phaseLabel}</TableCell>
                          <TableCell className={`whitespace-nowrap ${nbdPast ? 'text-red-600 font-medium' : ''}`}>{nbd ?? '—'}</TableCell>
                          {Array.from({ length: MAX_CYCLES }, (_, i) => {
                            const n = i + 1;
                            const c = cyc.find((cc) => cc.cycle_number === n);
                            const isCur = cur?.cycle_number === n;
                            return (
                              <React.Fragment key={n}>
                                <TableCell className={`whitespace-nowrap ${isCur ? 'bg-muted' : ''}`}>{c?.cycle_start ?? ''}</TableCell>
                                <TableCell className={`whitespace-nowrap ${isCur ? 'bg-muted' : ''}`}>{c?.cycle_end ?? ''}</TableCell>
                              </React.Fragment>
                            );
                          })}
                        </>;
                      })()}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">{view === 'cycles' ? cycleRows.length : clientRows.length} rows</div>

      <BillingCycleDialog cycle={editing} open={open} onOpenChange={setOpen} onSaved={refresh} />
      {editClient && (
        <EditClientDialog
          open={editClientOpen}
          onOpenChange={setEditClientOpen}
          client={editClient as never}
          onClientUpdated={() => { refreshAll(); }}
        />
      )}
    </div>
  );
};
