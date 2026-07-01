import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
}

const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];

export const RevenueDashboard: React.FC<Props> = ({ clients, cycles }) => {
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const openIds = useMemo(() => new Set(clients.filter((c) => c.status === 'active').map((c) => c.id)), [clients]);
  const [mco, setMco] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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

  return (
    <div className="space-y-4">
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
