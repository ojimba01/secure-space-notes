import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
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
} from '@/lib/billing';

const REVENUE_MONTHS = 6;

const monthLabel = (key: string) =>
  new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

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
      const client = clients.find((c) => c.id === cycle.client_id);
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
  }, [clients, cycles, months, today]);

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

  const rangeLabel = total.expectedHigh > total.expectedLow
    ? `${formatMoney(total.expectedLow)} – ${formatMoney(total.expectedHigh)}`
    : formatMoney(total.expectedLow);

  return <div className="space-y-4">
    <Card className="p-4">
      <h2 className="font-semibold">Next {REVENUE_MONTHS} months revenue</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Covers {monthLabel(months[0])} through {monthLabel(months[months.length - 1])}. Historical revenue is not included.
        A Low level cycle bills {formatMoney(RATE_LOW)} and a High level cycle bills {formatMoney(RATE_HIGH)}.
        {assumedClientCount > 0 && ` ${assumedClientCount} client${assumedClientCount === 1 ? '' : 's'} still ${assumedClientCount === 1 ? 'needs' : 'need'} a level of need. Their cycles are counted at the Low rate in the Low column and the High rate in the High column.`}
      </p>
    </Card>

    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Potential 6 month revenue</div>
        <div className="mt-1 text-2xl font-bold">{rangeLabel}</div>
        <div className="mt-1 text-xs text-muted-foreground">&nbsp;</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Not accounted for yet</div>
        <div className="mt-1 text-2xl font-bold text-red-700">{formatMoney(total.notSubmitted)}</div>
        <div className="mt-1 text-xs text-muted-foreground">Cycles that have ended with no claim submitted.</div>
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
            <th className="px-3 pb-2 font-semibold">Low</th>
            <th className="px-3 pb-2 font-semibold">High</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <tr key={r.key} className="border-t">
            <td className="p-3 font-medium">{monthLabel(r.key)}</td>
            <td className="p-3">{formatMoney(r.expectedLow)}</td>
            <td className="p-3">{formatMoney(r.expectedHigh)}</td>
            <td className="p-3">{formatMoney(r.submitted)}</td>
            <td className={`p-3 ${r.notSubmitted > 0 ? 'font-medium text-red-700' : ''}`}>{formatMoney(r.notSubmitted)}</td>
            <td className="p-3">{formatMoney(r.collected)}</td>
          </tr>)}
          <tr className="border-t bg-slate-50 font-semibold">
            <td className="p-3">Total</td>
            <td className="p-3">{formatMoney(total.expectedLow)}</td>
            <td className="p-3">{formatMoney(total.expectedHigh)}</td>
            <td className="p-3">{formatMoney(total.submitted)}</td>
            <td className="p-3 text-red-700">{formatMoney(total.notSubmitted)}</td>
            <td className="p-3">{formatMoney(total.collected)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  </div>;
}
