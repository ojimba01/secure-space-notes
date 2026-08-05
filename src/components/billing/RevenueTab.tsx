import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BillingClient } from '@/hooks/useBilling';
import {
  BillingCycle,
  RATE_LOW,
  RATE_HIGH,
  formatMoney,
  monthKey,
  rateForLevel,
  todayAgency,
  toDate,
  daysBetween,
  finalDeadlineFor,
} from '@/lib/billing';

const REVENUE_MONTHS = 6;

const monthLabel = (key: string) =>
  new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const dateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

interface MonthRow {
  key: string;
  expectedLow: number;
  expectedHigh: number;
  submitted: number;
  notSubmitted: number;
  collected: number;
  assumedClients: number;
}

// Forward-looking revenue: the current month plus the next five. Historical
// months are intentionally left out.
function monthWindow(today = todayAgency()): string[] {
  const start = toDate(`${monthKey(today)}-01`);
  return Array.from({ length: REVENUE_MONTHS }, (_, i) => {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    return d.toISOString().slice(0, 7);
  });
}

export function RevenueTab({ clients, cycles }: { clients: BillingClient[]; cycles: BillingCycle[] }) {
  const today = todayAgency();
  const months = useMemo(() => monthWindow(today), [today]);
  const [view, setView] = useState<'projection' | 'recovery'>('projection');

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const { rows, assumedClientCount } = useMemo(() => {
    const empty = (key: string): MonthRow => ({ key, expectedLow: 0, expectedHigh: 0, submitted: 0, notSubmitted: 0, collected: 0, assumedClients: 0 });
    const byMonth = new Map(months.map((m) => [m, empty(m)]));
    const inWindow = (key: string) => byMonth.get(key);
    const assumedIds = new Set<string>();

    // Cycles exist for every client with an approval start date, whether or not
    // a level of need has been chosen. When it is missing the cycle is counted
    // at the Low rate and the High rate to give a range.
    for (const cycle of cycles) {
      const row = inWindow(monthKey(cycle.cycle_end));
      if (!row) continue;
      const client = clientById.get(cycle.client_id);
      const known = cycle.billed_amount ?? rateForLevel(client?.level_of_need);
      const low = known ?? RATE_LOW;
      const high = known ?? RATE_HIGH;
      if (known == null && client) { assumedIds.add(client.id); row.assumedClients += 1; }
      row.expectedLow += low;
      row.expectedHigh += high;
      row.collected += cycle.paid_amount ?? 0;
      if (cycle.billing_status === 'Submitted') row.submitted += low;
      else if (daysBetween(cycle.cycle_end, today) > 0) row.notSubmitted += low;
    }

    return { rows: months.map((m) => byMonth.get(m)!), assumedClientCount: assumedIds.size };
  }, [clientById, cycles, months, today]);

  // Every cycle whose service window has ended without a submitted claim.
  // Lost: the six month final deadline has also passed. Pending: still claimable.
  const recovery = useMemo(() => {
    const lost: { cycle: BillingCycle; amount: number; deadline: string; overdueDays: number }[] = [];
    const pending: { cycle: BillingCycle; amount: number; deadline: string; daysLeft: number }[] = [];
    for (const cycle of cycles) {
      if (cycle.billing_status === 'Submitted') continue;
      if (daysBetween(cycle.cycle_end, today) <= 0) continue; // cycle still running
      const client = clientById.get(cycle.client_id);
      const amount = cycle.billed_amount ?? rateForLevel(client?.level_of_need) ?? RATE_LOW;
      const deadline = finalDeadlineFor(cycle);
      const daysLeft = daysBetween(today, deadline);
      if (daysLeft < 0) lost.push({ cycle, amount, deadline, overdueDays: -daysLeft });
      else pending.push({ cycle, amount, deadline, daysLeft });
    }
    lost.sort((a, b) => b.overdueDays - a.overdueDays);
    pending.sort((a, b) => a.daysLeft - b.daysLeft);
    return {
      lost,
      pending,
      lostTotal: lost.reduce((s, r) => s + r.amount, 0),
      pendingTotal: pending.reduce((s, r) => s + r.amount, 0),
    };
  }, [clientById, cycles, today]);

  const total = rows.reduce(
    (a, r) => ({
      expectedLow: a.expectedLow + r.expectedLow,
      expectedHigh: a.expectedHigh + r.expectedHigh,
      submitted: a.submitted + r.submitted,
      notSubmitted: a.notSubmitted + r.notSubmitted,
      collected: a.collected + r.collected,
    }),
    { expectedLow: 0, expectedHigh: 0, submitted: 0, notSubmitted: 0, collected: 0 },
  );

  const allLevelsKnown = assumedClientCount === 0;
  const highCell = (row: MonthRow | null) => {
    if (allLevelsKnown) return '—';
    return formatMoney(row ? row.expectedHigh : total.expectedHigh);
  };

  const rangeLabel = !allLevelsKnown && total.expectedHigh > total.expectedLow
    ? `${formatMoney(total.expectedLow)} – ${formatMoney(total.expectedHigh)}`
    : formatMoney(total.expectedLow);

  const clientName = (id: string) => {
    const c = clientById.get(id);
    return c ? `${c.first_name} ${c.last_name}` : 'Unknown client';
  };

  if (view === 'recovery') {
    return <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Lost and pending income</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cycles that ended with no claim submitted. Lost income is past the six month final deadline. Pending income can still be billed.
            </p>
          </div>
          <Button variant="outline" onClick={() => setView('projection')}>Back current revenue</Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Lost income</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{formatMoney(recovery.lostTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{recovery.lost.length} cycle{recovery.lost.length === 1 ? '' : 's'} past the final deadline.</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Pending income</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{formatMoney(recovery.pendingTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{recovery.pending.length} cycle{recovery.pending.length === 1 ? '' : 's'} still claimable.</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Not accounted for yet</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{formatMoney(total.notSubmitted)}</div>
          <div className="mt-1 text-xs text-muted-foreground">Cycles that have ended with no claim submitted.</div>
        </Card>
      </div>

      {([
        { title: 'Lost income', empty: 'No cycles have passed their final deadline.', items: recovery.lost.map(r => ({ ...r, note: `${r.overdueDays} day${r.overdueDays === 1 ? '' : 's'} past deadline` })), tone: 'text-red-700' },
        { title: 'Pending income', empty: 'No ended cycles are waiting on a claim.', items: recovery.pending.map(r => ({ ...r, note: `${r.daysLeft} day${r.daysLeft === 1 ? '' : 's'} left to bill` })), tone: 'text-amber-700' },
      ]).map(section => <Card key={section.title} className="overflow-x-auto">
        <div className="p-3 font-semibold">{section.title}</div>
        {section.items.length === 0
          ? <div className="px-3 pb-3 text-sm text-muted-foreground">{section.empty}</div>
          : <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="p-3 font-semibold">Client</th>
                  <th className="p-3 font-semibold">Cycle</th>
                  <th className="p-3 font-semibold">Cycle end</th>
                  <th className="p-3 font-semibold">Final deadline</th>
                  <th className="p-3 text-center font-semibold">Amount</th>
                  <th className="p-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {section.items.map(r => <tr key={r.cycle.id} className="border-t">
                  <td className="p-3 font-medium">{clientName(r.cycle.client_id)}</td>
                  <td className="p-3">{r.cycle.phase} · Cycle {r.cycle.cycle_number}</td>
                  <td className="p-3">{dateLabel(r.cycle.cycle_end)}</td>
                  <td className="p-3">{dateLabel(r.deadline)}</td>
                  <td className="p-3 text-center">{formatMoney(r.amount)}</td>
                  <td className={`p-3 font-medium ${section.tone}`}>{r.note}</td>
                </tr>)}
              </tbody>
            </table>}
      </Card>)}
    </div>;
  }

  return <div className="space-y-4">
    <Card className="p-4">
      <h2 className="font-semibold">Next {REVENUE_MONTHS} months revenue</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Covers {monthLabel(months[0])} through {monthLabel(months[months.length - 1])}. Historical revenue is not included.
        A Low level cycle bills {formatMoney(RATE_LOW)} and a High level cycle bills {formatMoney(RATE_HIGH)}.
        {assumedClientCount > 0 && ` ${assumedClientCount} client${assumedClientCount === 1 ? '' : 's'} still ${assumedClientCount === 1 ? 'needs' : 'need'} a level of need. Their cycles are counted at the Low rate in the Low column and the High rate in the High column.`}
      </p>
    </Card>

    <div className="grid gap-3 sm:grid-cols-2">
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Potential 6 month revenue</div>
        <div className="mt-1 text-2xl font-bold">{rangeLabel}</div>
        <div className="mt-1 text-xs text-muted-foreground">&nbsp;</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Submitted / collected</div>
        <div className="mt-1 text-2xl font-bold text-green-700">{formatMoney(total.submitted)}</div>
        <div className="mt-1 text-xs text-muted-foreground">&nbsp;</div>
      </Card>
    </div>

    <Card className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-slate-100 text-left">
          <tr>
            <th rowSpan={2} className="p-3 align-bottom font-semibold">Month</th>
            <th colSpan={2} className="border-b border-slate-200 p-3 text-center font-semibold">Monthly Revenue Range</th>
            <th rowSpan={2} className="p-3 align-bottom font-semibold">Submitted</th>
            <th rowSpan={2} className="p-3 align-bottom font-semibold">Pending</th>
            <th rowSpan={2} className="p-3 align-bottom font-semibold">Collected</th>
          </tr>
          <tr>
            <th className="px-3 pb-2 text-center font-semibold">Low</th>
            <th className="px-3 pb-2 text-center font-normal text-muted-foreground">High</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <tr key={r.key} className="border-t">
            <td className="p-3 font-medium">{monthLabel(r.key)}</td>
            <td className="p-3 text-center">{formatMoney(r.expectedLow)}</td>
            <td className="p-3 text-center text-muted-foreground">{highCell(r)}</td>
            <td className="p-3">{formatMoney(r.submitted)}</td>
            <td className={`p-3 ${r.notSubmitted > 0 ? 'font-medium text-red-700' : ''}`}>{formatMoney(r.notSubmitted)}</td>
            <td className="p-3">{formatMoney(r.collected)}</td>
          </tr>)}
          <tr className="border-t bg-slate-50 font-semibold">
            <td className="p-3">Total</td>
            <td className="p-3 text-center">{formatMoney(total.expectedLow)}</td>
            <td className="p-3 text-center font-normal text-muted-foreground">{highCell(null)}</td>
            <td className="p-3">{formatMoney(total.submitted)}</td>
            <td className="p-3 text-red-700">{formatMoney(total.notSubmitted)}</td>
            <td className="p-3">{formatMoney(total.collected)}</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => setView('recovery')}>Analyze lost / pending income</Button>
      <Button variant="outline" disabled>Historical income (coming soon)</Button>
    </div>
  </div>;
}
