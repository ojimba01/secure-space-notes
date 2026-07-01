import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

import {
  BillingCycle,
  MCO_OPTIONS,
  BILLING_STATUSES,
  formatMoney,
  monthKey,
  todayAgency,
  isBilled,
  nextBillDue,
  isPastDue,
  daysBetween,
  toDate,
  fmt,
} from '@/lib/billing';
import { BillingClient } from '@/hooks/useBilling';
import { markCycleSubmitted } from '@/lib/billingDeadlines';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { InfoHint } from '@/components/InfoHint';

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

  // Split current-cycle deadlines into "due this week" and "overdue".
  const [weekOpen, setWeekOpen] = useState(false);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const openActiveClients = useMemo(() => clients.filter((c) => c.status === 'active'), [clients]);

  function endOfWeekSunday(s: string): string {
    const d = toDate(s);
    const day = d.getUTCDay(); // 0 = Sunday
    const add = (7 - day) % 7;
    d.setUTCDate(d.getUTCDate() + add);
    return fmt(d);
  }

  const { dueThisWeek, overdue } = useMemo(() => {
    const byClient = new Map<string, BillingCycle[]>();
    for (const c of cycles) {
      const arr = byClient.get(c.client_id) ?? [];
      arr.push(c);
      byClient.set(c.client_id, arr);
    }

    const today = todayAgency();
    const sunday = endOfWeekSunday(today);
    const week: { cycle: BillingCycle; client: BillingClient; dueDate: string; daysRemaining: number }[] = [];
    const past: { cycle: BillingCycle; client: BillingClient; dueDate: string; daysRemaining: number }[] = [];

    for (const cl of openActiveClients) {
      const list = byClient.get(cl.id);
      if (!list) continue;
      const dueDate = nextBillDue(list, cl.auth_150_start);
      if (!dueDate) continue;
      const cycle = list.find((c) => c.cycle_end === dueDate) ?? list[list.length - 1];
      if (!cycle) continue;

      if (isPastDue(cycle, today)) {
        past.push({ cycle, client: cl, dueDate, daysRemaining: daysBetween(today, dueDate) });
      } else if (dueDate >= today && dueDate <= sunday) {
        week.push({ cycle, client: cl, dueDate, daysRemaining: daysBetween(today, dueDate) });
      }
    }

    const sort = (a: { dueDate: string }, b: { dueDate: string }) => a.dueDate.localeCompare(b.dueDate);
    return { dueThisWeek: week.sort(sort), overdue: past.sort(sort) };
  }, [cycles, openActiveClients]);

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
    let expected = 0, billed = 0, collected = 0, thisMonthRev = 0, denied = 0;
    for (const c of filtered) {
      const amt = Number(c.billed_amount ?? 0);
      expected += amt;
      if (isBilled(c.billing_status)) billed += amt;
      if (c.billing_status === 'Denied') denied += amt;
      collected += Number(c.paid_amount ?? 0);
      if (monthKey(c.cycle_end) === thisMonth) thisMonthRev += amt;
    }
    return { expected, billed, collected, outstanding: billed - collected, thisMonthRev, denied };
  }, [filtered, thisMonth]);

  const deniedCycles = useMemo(
    () => filtered.filter((c) => c.billing_status === 'Denied'),
    [filtered],
  );
  const [deniedOpen, setDeniedOpen] = useState(false);

  const monthTick = (key: string): string => {
    const [, m] = key.split('-');
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return names[Number(m) - 1] ?? key;
  };

  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((c) => map.set(monthKey(c.cycle_end), (map.get(monthKey(c.cycle_end)) ?? 0) + Number(c.billed_amount ?? 0)));
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 12).map(([m, v]) => ({ month: m, amount: v }));
  }, [filtered]);

  // Year labels + Dec→Jan divider for the Monthly Revenue chart.
  const monthMeta = useMemo(() => {
    if (byMonth.length === 0) return { firstYear: '', lastYear: '', singleYear: true, janBoundary: null, janIndex: -1 };
    const firstYear = byMonth[0].month.slice(0, 4);
    const lastYear = byMonth[byMonth.length - 1].month.slice(0, 4);
    const janBoundary = byMonth.find((d, i) => i > 0 && d.month.endsWith('-01'))?.month ?? null;
    const janIndex = janBoundary ? byMonth.findIndex((d) => d.month === janBoundary) : -1;
    return { firstYear, lastYear, singleYear: firstYear === lastYear, janBoundary, janIndex };
  }, [byMonth]);


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


  const Stat = ({ label, value, cls, hint }: { label: string; value: number; cls?: string; hint?: string }) => (
    <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground flex items-center gap-1">{label}{hint && <InfoHint text={hint} />}</div><div className={`text-2xl font-bold ${cls ?? ''}`}>{formatMoney(value)}</div></CardContent></Card>
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
      <div className="space-y-3">
        <Collapsible open={weekOpen} onOpenChange={setWeekOpen}>
          <Card className={dueThisWeek.length > 0 ? 'border-amber-300' : ''}>
            <CollapsibleTrigger asChild>
              <CardHeader className="flex flex-row items-center justify-between pb-2 cursor-pointer select-none hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Due for billing this week</CardTitle>
                  <Badge variant="secondary">{dueThisWeek.length}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {onOpenDeadlines && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDeadlines();
                      }}
                    >
                      View all deadlines →
                    </Button>
                  )}
                  <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${weekOpen ? 'rotate-180' : ''}`} />
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {weekOpen && dueThisWeek.length > 0 && (
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
                      {dueThisWeek.map(({ cycle: c, client: cl, dueDate, daysRemaining }) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium whitespace-nowrap">{cl.first_name} {cl.last_name}</TableCell>
                          <TableCell className="whitespace-nowrap">{cl.assigned_staff_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                          <TableCell>{cl.insurance ?? '—'}</TableCell>
                          <TableCell>{c.cycle_number}</TableCell>
                          <TableCell>{formatMoney(c.billed_amount)}</TableCell>
                          <TableCell className="whitespace-nowrap">{dueDate}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge className="bg-amber-500 text-white hover:bg-amber-500">
                              {daysRemaining === 0 ? 'due today' : `${daysRemaining}d left`}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" className="h-8 gap-1" disabled={submitting === c.id} onClick={() => handleSubmit(c)}>
                              <CheckCircle2 className="h-4 w-4" />Mark Submitted
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {weekOpen && dueThisWeek.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">Nothing due this week.</p>
              )}
            </CollapsibleContent>
          </Card>
        </Collapsible>

        <Collapsible open={overdueOpen} onOpenChange={setOverdueOpen}>
          <Card className={overdue.length > 0 ? 'border-red-300' : ''}>
            <CollapsibleTrigger asChild>
              <CardHeader className="flex flex-row items-center justify-between pb-2 cursor-pointer select-none hover:bg-muted/50">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">Overdue</CardTitle>
                  <Badge variant="secondary">{overdue.length}</Badge>
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${overdueOpen ? 'rotate-180' : ''}`} />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {overdueOpen && overdue.length > 0 && (
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
                      {overdue.map(({ cycle: c, client: cl, dueDate, daysRemaining }) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium whitespace-nowrap">{cl.first_name} {cl.last_name}</TableCell>
                          <TableCell className="whitespace-nowrap">{cl.assigned_staff_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                          <TableCell>{cl.insurance ?? '—'}</TableCell>
                          <TableCell>{c.cycle_number}</TableCell>
                          <TableCell>{formatMoney(c.billed_amount)}</TableCell>
                          <TableCell className="whitespace-nowrap">{dueDate}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge className="bg-red-600 text-white hover:bg-red-600">
                              {Math.abs(daysRemaining)}d overdue
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" className="h-8 gap-1" disabled={submitting === c.id} onClick={() => handleSubmit(c)}>
                              <CheckCircle2 className="h-4 w-4" />Mark Submitted
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {overdueOpen && overdue.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">No overdue cycles.</p>
              )}
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Select value={mco} onValueChange={setMco}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All MCOs</SelectItem>{MCO_OPTIONS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        <span className="text-muted-foreground">to</span>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
      </div>


      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Expected revenue" value={stats.expected} hint="Total of billed amounts across all billing cycles matching the current filters — a projection across the whole window, not a single month." />
        <Stat label="Billed to date" value={stats.billed} hint="Cycles that have actually been billed/submitted to the MCO (billing status = Submitted)." />
        <Stat label="Collected" value={stats.collected} cls="text-green-600" hint="Money actually received (paid amount). This is paid, distinct from billed." />
        <Stat label="Outstanding" value={stats.outstanding} cls="text-amber-600" hint="Billed to date minus Collected." />
        <Stat label="Billed this month" value={stats.thisMonthRev} hint="Billed amount for cycles whose cycle end falls in the current calendar month." />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Revenue</CardTitle>
        </CardHeader>
        <CardContent className="h-72 flex flex-col pt-2">
          {monthMeta.janBoundary && !monthMeta.singleYear && (
            <div className="relative h-5 w-full">
              <span
                className="absolute text-xs font-medium text-muted-foreground"
                style={{
                  left: `calc(60px + (${monthMeta.janIndex + 0.5} / ${byMonth.length}) * (100% - 60px))`,
                  top: '50%',
                  transform: 'translate(calc(-100% - 0.25rem), -50%)',
                }}
              >
                {monthMeta.firstYear}
              </span>
              <span
                className="absolute text-xs font-medium text-muted-foreground"
                style={{
                  left: `calc(60px + (${monthMeta.janIndex + 0.5} / ${byMonth.length}) * (100% - 60px))`,
                  top: '50%',
                  transform: 'translate(0.25rem, -50%)',
                }}
              >
                {monthMeta.lastYear}
              </span>
            </div>
          )}
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" fontSize={11} tickFormatter={monthTick} interval={0} />
                <YAxis width={60} fontSize={11} tickFormatter={(v: number) => formatMoney(v)} />
                <Tooltip labelFormatter={(l: string) => monthTick(l)} formatter={(v: number) => formatMoney(v)} />
                {monthMeta.janBoundary && !monthMeta.singleYear && <ReferenceLine x={monthMeta.janBoundary} stroke="#94a3b8" strokeDasharray="3 3" />}
                <Bar dataKey="amount" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card><CardHeader><CardTitle className="text-base">Revenue by MCO</CardTitle></CardHeader><CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={byMco} dataKey="value" nameKey="name" outerRadius={80} label={(entry: { name: string; value: number }) => formatMoney(entry.value)}>{byMco.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip formatter={(v: number) => formatMoney(v)} /><Legend /></PieChart></ResponsiveContainer>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Collected vs. Outstanding</CardTitle></CardHeader><CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={paidSplit} dataKey="value" nameKey="name" outerRadius={80} label><Cell fill="#16a34a" /><Cell fill="#f59e0b" /></Pie><Tooltip formatter={(v: number) => formatMoney(v)} /><Legend /></PieChart></ResponsiveContainer>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base"># of cycles by billing status</CardTitle></CardHeader><CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={byBillingStatus}><XAxis dataKey="status" fontSize={11} /><YAxis fontSize={11} allowDecimals={false} /><Tooltip labelFormatter={(l) => l} formatter={(v: number) => [`${v} cycles`, 'Count']} /><Bar dataKey="count" fill="#7c3aed" /></BarChart></ResponsiveContainer>
        </CardContent></Card>
      </div>

      <Collapsible open={deniedOpen} onOpenChange={setDeniedOpen}>
        <Card className={deniedCycles.length > 0 ? 'border-red-300' : ''}>
          <CollapsibleTrigger asChild>
            <CardHeader className="flex flex-row items-center justify-between py-3 cursor-pointer select-none hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <CardTitle className="text-sm">Denied to date</CardTitle>
                <Badge variant="secondary">{deniedCycles.length}</Badge>
                <span className="text-sm font-semibold text-red-600">{formatMoney(stats.denied)}</span>
              </div>
              <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${deniedOpen ? 'rotate-180' : ''}`} />
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {deniedCycles.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>MCO</TableHead>
                      <TableHead>#</TableHead>
                      <TableHead>Cycle end</TableHead>
                      <TableHead>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deniedCycles.map((c) => {
                      const cl = clientMap.get(c.client_id);
                      return (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium whitespace-nowrap">{cl ? `${cl.first_name} ${cl.last_name}` : '—'}</TableCell>
                          <TableCell>{cl?.insurance ?? '—'}</TableCell>
                          <TableCell>{c.cycle_number}</TableCell>
                          <TableCell className="whitespace-nowrap">{c.cycle_end}</TableCell>
                          <TableCell>{formatMoney(c.billed_amount)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No denied cycles. Mark a cycle "Denied" from the Master List to track it here.</p>
            )}
          </CollapsibleContent>
        </Card>
      </Collapsible>

    </div>
  );
};
