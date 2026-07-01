import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  BillingCycle,
  MCO_OPTIONS,
  BILLING_STATUSES,
  formatMoney,
  monthKey,
  todayAgency,
  isBilled,
} from '@/lib/billing';
import { BillingClient } from '@/hooks/useBilling';
import { buildDeadlineRows, bucketFor, markCycleSubmitted } from '@/lib/billingDeadlines';

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  refresh?: () => void;
  onOpenDeadlines?: () => void;
}

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];

export const RevenueDashboard: React.FC<Props> = ({ clients, cycles, refresh, onOpenDeadlines }) => {
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const openIds = useMemo(() => new Set(clients.filter((c) => c.status === 'active').map((c) => c.id)), [clients]);
  const [mco, setMco] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [submitting, setSubmitting] = useState<string | null>(null);

  // "Due for billing this week" = current/past-due cycles due within 7 days or overdue.
  const dueSoon = useMemo(() => {
    return buildDeadlineRows(clients, cycles)
      .filter((r) => bucketFor(r.daysRemaining) === 'overdue' || bucketFor(r.daysRemaining) === 'week');
  }, [clients, cycles]);

  const handleSubmit = async (cycle: BillingCycle) => {
    setSubmitting(cycle.id);
    try {
      await markCycleSubmitted(cycle);
      toast.success('Marked as submitted');
      refresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSubmitting(null);
    }
  };

  const filtered = useMemo(() => {
    return cycles.filter((c) => {
      if (!openIds.has(c.client_id)) return false;
      const cl = clientMap.get(c.client_id);
      if (mco !== 'all' && cl?.insurance !== mco) return false;
      if (from && c.cycle_end < from) return false;
      if (to && c.cycle_end > to) return false;
      return true;
    });
  }, [cycles, openIds, clientMap, mco, from, to]);

  const thisMonth = monthKey(todayAgency());

  const stats = useMemo(() => {
    let expected = 0, billed = 0, collected = 0, thisMonthRev = 0;
    for (const c of filtered) {
      const amt = Number(c.billed_amount ?? 0);
      expected += amt;
      if (isBilled(c.billing_status)) billed += amt;
      collected += Number(c.paid_amount ?? 0);
      if (monthKey(c.cycle_end) === thisMonth) thisMonthRev += amt;
    }
    return { expected, billed, collected, outstanding: billed - collected, thisMonthRev };
  }, [filtered, thisMonth]);

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => map.set(monthKey(c.cycle_end), (map.get(monthKey(c.cycle_end)) ?? 0) + Number(c.billed_amount ?? 0)));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 12).map(([m, v]) => ({ month: m, amount: v }));
  }, [filtered]);

  const byMco = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => { const m = clientMap.get(c.client_id)?.insurance ?? 'Unknown'; map.set(m, (map.get(m) ?? 0) + Number(c.billed_amount ?? 0)); });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filtered, clientMap]);

  const paidSplit = useMemo(() => [
    { name: 'Collected', value: stats.collected },
    { name: 'Outstanding', value: Math.max(0, stats.outstanding) },
  ], [stats]);

  const byBillingStatus = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => map.set(c.billing_status, (map.get(c.billing_status) ?? 0) + 1));
    return BILLING_STATUSES.map((s) => ({ status: s, count: map.get(s) ?? 0 }));
  }, [filtered]);

  const flagged = useMemo(() => clients.filter((c) => c.status === 'active' && c.auth_150_start && !c.level_of_need), [clients]);
  const notReady = useMemo(() => clients.filter((c) => c.status === 'active' && !c.auth_150_start), [clients]);

  const Stat = ({ label, value, cls }: { label: string; value: number; cls?: string }) => (
    <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={`text-2xl font-bold ${cls ?? ''}`}>{formatMoney(value)}</div></CardContent></Card>
  );

  if (cycles.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No billing cycles yet. Add a client's 150-Day authorization start date (or run the backfill), and cycles appear automatically.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className={dueSoon.length > 0 ? 'border-amber-300' : ''}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Due for billing this week</CardTitle>
          {onOpenDeadlines && (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={onOpenDeadlines}>
              View all deadlines →
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {dueSoon.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Nothing due this week — you're all caught up. 🎉</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Assigned Staff</TableHead>
                    <TableHead>MCO</TableHead>
                    <TableHead>#</TableHead>
                    <TableHead>Billed</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead>Remaining</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dueSoon.map(({ cycle: c, client: cl, dueDate, daysRemaining }) => {
                    const overdue = daysRemaining < 0;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium whitespace-nowrap">{cl.first_name} {cl.last_name}</TableCell>
                        <TableCell className="whitespace-nowrap">{cl.assigned_staff_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                        <TableCell>{cl.insurance ?? '—'}</TableCell>
                        <TableCell>{c.cycle_number}</TableCell>
                        <TableCell>{formatMoney(c.billed_amount)}</TableCell>
                        <TableCell className="whitespace-nowrap">{dueDate}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge className={overdue ? 'bg-red-600 text-white hover:bg-red-600' : 'bg-amber-500 text-white hover:bg-amber-500'}>
                            {overdue ? `${Math.abs(daysRemaining)}d overdue` : daysRemaining === 0 ? 'due today' : `${daysRemaining}d left`}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="outline" size="sm" className="h-8 gap-1" disabled={submitting === c.id} onClick={() => handleSubmit(c)}>
                            <CheckCircle2 className="h-4 w-4" />Mark Submitted
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={mco} onValueChange={setMco}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All MCOs</SelectItem>{MCO_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <span className="text-muted-foreground">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
      </div>


      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Expected revenue" value={stats.expected} />
        <Stat label="Billed to date" value={stats.billed} />
        <Stat label="Collected" value={stats.collected} cls="text-green-600" />
        <Stat label="Outstanding" value={stats.outstanding} cls="text-amber-600" />
        <Stat label="This month" value={stats.thisMonthRev} />
      </div>

      {(flagged.length > 0 || notReady.length > 0) && (
        <Card className="border-amber-300">
          <CardContent className="p-4 text-sm space-y-1">
            {flagged.length > 0 && <div><b className="text-amber-600">Rate unknown</b> ({flagged.length}): {flagged.map((c) => `${c.first_name} ${c.last_name}`).join(', ')}</div>}
            {notReady.length > 0 && <div><b className="text-muted-foreground">Not ready to bill</b> ({notReady.length}): no 150-Day start date.</div>}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardHeader><CardTitle className="text-base">Revenue by month</CardTitle></CardHeader><CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={byMonth}><XAxis dataKey="month" fontSize={11} /><YAxis fontSize={11} /><Tooltip formatter={(v: number) => formatMoney(v)} /><Bar dataKey="amount" fill="#2563eb" /></BarChart></ResponsiveContainer>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Revenue by MCO</CardTitle></CardHeader><CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byMco} dataKey="value" nameKey="name" outerRadius={80} label>{byMco.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: number) => formatMoney(v)} /><Legend /></PieChart></ResponsiveContainer>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Collected vs. Outstanding</CardTitle></CardHeader><CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paidSplit} dataKey="value" nameKey="name" outerRadius={80} label><Cell fill="#16a34a" /><Cell fill="#f59e0b" /></Pie><Tooltip formatter={(v: number) => formatMoney(v)} /><Legend /></PieChart></ResponsiveContainer>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Cycles by billing status</CardTitle></CardHeader><CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={byBillingStatus}><XAxis dataKey="status" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip /><Bar dataKey="count" fill="#7c3aed" /></BarChart></ResponsiveContainer>
        </CardContent></Card>
      </div>
    </div>
  );
};
