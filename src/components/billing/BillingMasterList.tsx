import React, { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Download, Pencil, Eye } from 'lucide-react';
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
} from '@/lib/billing';
import { BillingClient } from '@/hooks/useBilling';
import { BillingCycleDialog } from '@/components/billing/BillingCycleDialog';

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  refresh: () => void;
  onOpenTimeline: (clientId: string) => void;
}

export const BillingMasterList: React.FC<Props> = ({ clients, cycles, refresh, onOpenTimeline }) => {
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const [search, setSearch] = useState('');
  const [mco, setMco] = useState('all');
  const [phase, setPhase] = useState('all');
  const [billing, setBilling] = useState('all');
  const [payment, setPayment] = useState('all');
  const [due, setDue] = useState('all');
  const [staff, setStaff] = useState('all');
  const [editing, setEditing] = useState<BillingCycle | null>(null);
  const [open, setOpen] = useState(false);

  const staffOptions = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => {
      if (c.assigned_employee_id && c.assigned_staff_name) map.set(c.assigned_employee_id, c.assigned_staff_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [clients]);

  const thisMonth = monthKey(todayAgency());

  const rows = useMemo(() => {
    return cycles
      .filter((c) => {
        const cl = clientMap.get(c.client_id);
        if (!cl) return false;
        if (search) {
          const name = `${cl.first_name} ${cl.last_name}`.toLowerCase();
          if (!name.includes(search.toLowerCase()) && !(cl.member_id ?? '').toLowerCase().includes(search.toLowerCase())) return false;
        }
        if (mco !== 'all' && cl.insurance !== mco) return false;
        if (phase !== 'all' && c.phase !== phase) return false;
        if (billing !== 'all' && c.billing_status !== billing) return false;
        if (payment !== 'all' && c.payment_status !== payment) return false;
        if (staff !== 'all') {
          if (staff === '__unassigned__' ? !!cl.assigned_employee_id : cl.assigned_employee_id !== staff) return false;
        }
        if (due === 'this_month' && monthKey(c.cycle_end) !== thisMonth) return false;
        if (due === 'overdue' && !isPastDue(c)) return false;
        return true;
      })
      .map((c) => ({ cycle: c, client: clientMap.get(c.client_id)! }));
  }, [cycles, clientMap, search, mco, phase, billing, payment, due, staff, thisMonth]);

  const updateField = async (id: string, patch: Partial<BillingCycle>) => {
    const { error } = await supabase
      .from('billing_cycles')
      .update({ ...patch, is_auto_generated: false })
      .eq('id', id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Updated');
    refresh();
  };

  const exportCsv = () => {
    const header = ['Client', 'MCO', 'Member ID', 'Phase', 'Cycle', 'Start', 'End', 'Billed', 'Paid', 'Billing Status', 'Payment Status'];
    const lines = rows.map(({ cycle: c, client: cl }) =>
      [
        `${cl.first_name} ${cl.last_name}`,
        cl.insurance ?? '',
        cl.member_id ?? '',
        c.phase,
        c.cycle_number,
        c.cycle_start,
        c.cycle_end,
        c.billed_amount ?? '',
        c.paid_amount ?? 0,
        c.billing_status,
        c.payment_status,
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(','),
    );
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billing-cycles-${todayAgency()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input placeholder="Search client or member ID…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
        <Select value={mco} onValueChange={setMco}><SelectTrigger className="w-40"><SelectValue placeholder="MCO" /></SelectTrigger><SelectContent><SelectItem value="all">All MCOs</SelectItem>{MCO_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
        <Select value={phase} onValueChange={setPhase}><SelectTrigger className="w-32"><SelectValue placeholder="Phase" /></SelectTrigger><SelectContent><SelectItem value="all">All phases</SelectItem><SelectItem value="150-Day">150-Day</SelectItem><SelectItem value="180-Day">180-Day</SelectItem></SelectContent></Select>
        <Select value={billing} onValueChange={setBilling}><SelectTrigger className="w-40"><SelectValue placeholder="Billing" /></SelectTrigger><SelectContent><SelectItem value="all">All billing</SelectItem>{BILLING_STATUSES.filter((s) => s !== 'Ready to Bill').map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Select value={payment} onValueChange={setPayment}><SelectTrigger className="w-36"><SelectValue placeholder="Payment" /></SelectTrigger><SelectContent><SelectItem value="all">All payments</SelectItem>{PAYMENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Select value={staff} onValueChange={setStaff}><SelectTrigger className="w-44"><SelectValue placeholder="Staff" /></SelectTrigger><SelectContent><SelectItem value="all">All staff</SelectItem><SelectItem value="__unassigned__">Unassigned</SelectItem>{staffOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select>
        <Select value={due} onValueChange={setDue}><SelectTrigger className="w-40"><SelectValue placeholder="Due" /></SelectTrigger><SelectContent><SelectItem value="all">Any due date</SelectItem><SelectItem value="this_month">Due this month</SelectItem><SelectItem value="overdue">Overdue</SelectItem></SelectContent></Select>
        <Button variant="outline" onClick={exportCsv} className="gap-2"><Download className="h-4 w-4" />Export CSV</Button>
        <span className="text-sm text-muted-foreground ml-auto">{rows.length} rows</span>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Assigned Staff</TableHead>
                <TableHead>MCO</TableHead>
                <TableHead>Member ID</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>#</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Paid</TableHead>
                <TableHead>Billing</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                    {cycles.length === 0
                      ? "No billing cycles yet. Add a client's 150-Day authorization start date (or run the backfill), and cycles appear automatically."
                      : 'No cycles match these filters.'}
                  </TableCell>
                </TableRow>
              )}
              {rows.map(({ cycle: c, client: cl }) => {
                const pastDue = isPastDue(c);
                return (
                  <TableRow key={c.id} className={pastDue ? 'outline outline-1 outline-red-500' : ''}>
                    <TableCell className="font-medium whitespace-nowrap">{cl.first_name} {cl.last_name}</TableCell>
                    <TableCell className="whitespace-nowrap">{cl.assigned_staff_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                    <TableCell>{cl.insurance ?? '—'}</TableCell>
                    <TableCell>{cl.member_id ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline">{c.phase}</Badge></TableCell>
                    <TableCell>{c.cycle_number}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.cycle_start}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.cycle_end}{pastDue && <span className="text-red-600 text-xs ml-1">⚠</span>}</TableCell>
                    <TableCell>{formatMoney(c.billed_amount)}</TableCell>
                    <TableCell>
                      <Input type="number" className="h-8 w-20" defaultValue={c.paid_amount}
                        onBlur={(e) => { const v = Number(e.target.value); if (v !== c.paid_amount) updateField(c.id, { paid_amount: v }); }} />
                    </TableCell>
                    <TableCell>
                      <Select value={c.billing_status} onValueChange={(v) => {
                        const patch: Partial<BillingCycle> = { billing_status: v as BillingCycle['billing_status'] };
                        if (v === 'Submitted' && !c.submitted_date) patch.submitted_date = todayAgency();
                        updateField(c.id, patch);
                      }}>
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>{BILLING_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
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

                    <TableCell className="whitespace-nowrap">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenTimeline(c.client_id)}><Eye className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <BillingCycleDialog cycle={editing} open={open} onOpenChange={setOpen} onSaved={refresh} />
    </div>
  );
};
