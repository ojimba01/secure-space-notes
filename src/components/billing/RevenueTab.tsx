import { Fragment, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
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
  pending: number;
  collected: number;
  assumedClients: number;
}

interface RecoveryItem {
  cycle: BillingCycle;
  amount: number;
  deadline: string;
  note: string;
}

interface ClientGroup {
  clientId: string;
  total: number;
  items: RecoveryItem[];
}

interface MonthGroup {
  key: string;
  total: number;
  clients: ClientGroup[];
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

// Roll a flat list of cycles up by month, then by client, keeping the cycle
// detail underneath so the table can be drilled into.
function groupByMonth(items: RecoveryItem[]): MonthGroup[] {
  const months = new Map<string, Map<string, RecoveryItem[]>>();
  for (const item of items) {
    const key = monthKey(item.cycle.cycle_end);
    if (!months.has(key)) months.set(key, new Map());
    const byClient = months.get(key)!;
    if (!byClient.has(item.cycle.client_id)) byClient.set(item.cycle.client_id, []);
    byClient.get(item.cycle.client_id)!.push(item);
  }
  return Array.from(months.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, byClient]) => {
      const clients = Array.from(byClient.entries())
        .map(([clientId, list]) => ({
          clientId,
          items: list,
          total: list.reduce((s, r) => s + r.amount, 0),
        }))
        .sort((a, b) => b.total - a.total);
      return { key, clients, total: clients.reduce((s, c) => s + c.total, 0) };
    });
}

export function RevenueTab({ clients, cycles, viewOverride, onViewChange }: {
  clients: BillingClient[];
  cycles: BillingCycle[];
  /** The Billing tutorial drives the view so it can restore a practice step. */
  viewOverride?: 'projection' | 'recovery';
  onViewChange?: (view: 'projection' | 'recovery') => void;
}) {
  const today = todayAgency();
  const months = useMemo(() => monthWindow(today), [today]);
  const [viewState, setViewState] = useState<'projection' | 'recovery'>('projection');
  const view = viewState;
  const setView = (v: 'projection' | 'recovery') => { setViewState(v); onViewChange?.(v); };
  useEffect(() => { if (viewOverride) setViewState(viewOverride); }, [viewOverride]);
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<{ title: string; clientName: string; tone: string; items: RecoveryItem[] } | null>(null);



  const toggle = (set: Set<string>, apply: (next: Set<string>) => void, key: string) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    apply(next);
  };

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const { rows, assumedClientCount } = useMemo(() => {
    const empty = (key: string): MonthRow => ({ key, expectedLow: 0, expectedHigh: 0, submitted: 0, pending: 0, collected: 0, assumedClients: 0 });
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
      if (cycle.billing_status === 'Submitted') {
        row.submitted += low;
        // Pending = the claim went out but payment has not been marked received.
        if (cycle.payment_status !== 'Paid') row.pending += Math.max(low - (cycle.paid_amount ?? 0), 0);
      }
    }

    return { rows: months.map((m) => byMonth.get(m)!), assumedClientCount: assumedIds.size };
  }, [clientById, cycles, months, today]);

  // Every cycle whose service window has ended without a submitted claim.
  // Lost: the six month final deadline has also passed. Pending: still claimable.
  const recovery = useMemo(() => {
    const lost: RecoveryItem[] = [];
    const claimable: RecoveryItem[] = [];
    for (const cycle of cycles) {
      if (cycle.billing_status === 'Submitted') continue;
      if (daysBetween(cycle.cycle_end, today) <= 0) continue; // cycle still running
      const client = clientById.get(cycle.client_id);
      const amount = cycle.billed_amount ?? rateForLevel(client?.level_of_need) ?? RATE_LOW;
      const deadline = finalDeadlineFor(cycle);
      const daysLeft = daysBetween(today, deadline);
      if (daysLeft < 0) {
        const overdue = -daysLeft;
        lost.push({ cycle, amount, deadline, note: `${overdue} day${overdue === 1 ? '' : 's'} past deadline` });
      } else {
        claimable.push({ cycle, amount, deadline, note: `${daysLeft} day${daysLeft === 1 ? '' : 's'} left to bill` });
      }
    }
    return {
      lostMonths: groupByMonth(lost),
      claimableMonths: groupByMonth(claimable),
      lostCount: lost.length,
      claimableCount: claimable.length,
      lostTotal: lost.reduce((s, r) => s + r.amount, 0),
      claimableTotal: claimable.reduce((s, r) => s + r.amount, 0),
    };
  }, [clientById, cycles, today]);

  const total = rows.reduce(
    (a, r) => ({
      expectedLow: a.expectedLow + r.expectedLow,
      expectedHigh: a.expectedHigh + r.expectedHigh,
      submitted: a.submitted + r.submitted,
      pending: a.pending + r.pending,
      collected: a.collected + r.collected,
    }),
    { expectedLow: 0, expectedHigh: 0, submitted: 0, pending: 0, collected: 0 },
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
    const sections = [
      {
        id: 'claimable',
        title: 'Pending income (still claimable)',
        empty: 'No ended cycles are waiting on a claim.',
        months: recovery.claimableMonths,
        tone: 'text-amber-700',
      },
      {
        id: 'lost',
        title: 'Lost income',
        empty: 'No cycles have passed their final deadline.',
        months: recovery.lostMonths,
        tone: 'text-red-700',
      },
    ];


    return <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-3">
          <Button onClick={() => setView('projection')} className="bg-blue-600 text-white hover:bg-blue-700">
            <Undo2 className="mr-2 h-4 w-4" /> Back to current revenue
          </Button>
          <div>
            <h2 className="font-semibold">Lost and pending income</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cycles that ended with no claim submitted, totalled by month. Open a month to see each client, then open a client to see their cycles.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Pending income</div>
          <div className="mt-1 text-2xl font-bold text-amber-700">{formatMoney(recovery.claimableTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{recovery.claimableCount} cycle{recovery.claimableCount === 1 ? '' : 's'} still claimable.</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Lost income</div>
          <div className="mt-1 text-2xl font-bold text-red-700">{formatMoney(recovery.lostTotal)}</div>
          <div className="mt-1 text-xs text-muted-foreground">{recovery.lostCount} cycle{recovery.lostCount === 1 ? '' : 's'} past the final deadline.</div>
        </Card>
      </div>


      {sections.map(section => <Card key={section.id} className="overflow-x-auto">
        <div className="p-3 font-semibold">{section.title}</div>
        {section.months.length === 0
          ? <div className="px-3 pb-3 text-sm text-muted-foreground">{section.empty}</div>
          : <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="p-3 font-semibold">Month</th>
                  <th className="p-3 font-semibold">Cycles</th>
                  <th className="p-3 text-center font-semibold">Amount</th>
                  <th className="p-3 font-semibold">Details</th>
                </tr>
              </thead>
              <tbody>
                {section.months.map(month => {
                  const monthKeyId = `${section.id}:${month.key}`;
                  const monthOpen = openMonths.has(monthKeyId);
                  const cycleCount = month.clients.reduce((s, c) => s + c.items.length, 0);
                  return <Fragment key={monthKeyId}>
                    <tr
                      className="cursor-pointer border-t bg-slate-50 hover:bg-slate-100"
                      onClick={() => toggle(openMonths, setOpenMonths, monthKeyId)}
                    >
                      <td className="p-3 font-semibold">
                        <span className="flex items-center gap-2">
                          {monthOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          {monthLabel(month.key)}
                        </span>
                      </td>
                      <td className="p-3">{cycleCount}</td>
                      <td className={`p-3 text-center font-semibold ${section.tone}`}>{formatMoney(month.total)}</td>
                      <td className="p-3 text-muted-foreground">{month.clients.length} client{month.clients.length === 1 ? '' : 's'}</td>
                    </tr>
                    {monthOpen && month.clients.map(group => (
                      <tr key={`${monthKeyId}:${group.clientId}`} className="border-t hover:bg-slate-50">
                        <td className="p-3 pl-9 font-medium">{clientName(group.clientId)}</td>
                        <td className="p-3">{group.items.length}</td>
                        <td className="p-3 text-center">{formatMoney(group.total)}</td>
                        <td className="p-3">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDetail({
                              title: `${section.title} · ${monthLabel(month.key)}`,
                              clientName: clientName(group.clientId),
                              tone: section.tone,
                              items: group.items,
                            })}
                          >
                            Open cycle breakdown
                          </Button>
                        </td>
                      </tr>
                    ))}

                  </Fragment>;
                })}
              </tbody>
            </table>}
      </Card>)}

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detail?.clientName}</DialogTitle>
            <DialogDescription>{detail?.title}</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left">
                <tr>
                  <th className="p-2 font-semibold">Cycle</th>
                  <th className="p-2 font-semibold">Ended</th>
                  <th className="p-2 text-center font-semibold">Amount</th>
                  <th className="p-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {(detail?.items ?? []).map(item => <tr key={item.cycle.id} className="border-t">
                  <td className="p-2">{item.cycle.phase} · Cycle {item.cycle.cycle_number}</td>
                  <td className="p-2">{dateLabel(item.cycle.cycle_end)}</td>
                  <td className="p-2 text-center">{formatMoney(item.amount)}</td>
                  <td className={`p-2 font-medium ${detail?.tone ?? ''}`}>{item.note} · deadline {dateLabel(item.deadline)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>;

  }

  return <div className="space-y-4" data-tour="revenue-section">
    <Card className="p-4">
      <h2 className="font-semibold">Next {REVENUE_MONTHS} months revenue</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Covers {monthLabel(months[0])} through {monthLabel(months[months.length - 1])}. Historical revenue is not included.
        A Low level cycle bills {formatMoney(RATE_LOW)} and a High level cycle bills {formatMoney(RATE_HIGH)}.
        {assumedClientCount > 0 && ` ${assumedClientCount} client${assumedClientCount === 1 ? '' : 's'} still ${assumedClientCount === 1 ? 'needs' : 'need'} a level of need. Their cycles are counted at the Low rate in the Low column and the High rate in the High column.`}
      </p>
    </Card>

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Potential 6 month revenue</div>
        <div className="mt-1 text-2xl font-bold">{rangeLabel}</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Submitted</div>
        <div className="mt-1 text-2xl font-bold text-green-700">{formatMoney(total.submitted)}</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Pending</div>
        <div className="mt-1 text-2xl font-bold text-amber-700">{formatMoney(total.pending)}</div>
        <div className="mt-1 text-xs text-muted-foreground">Submitted, payment not marked received.</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Collected</div>
        <div className="mt-1 text-2xl font-bold text-green-700">{formatMoney(total.collected)}</div>
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
            <td className={`p-3 ${r.pending > 0 ? 'font-medium text-amber-700' : ''}`}>{formatMoney(r.pending)}</td>
            <td className="p-3">{formatMoney(r.collected)}</td>
          </tr>)}
          <tr className="border-t bg-slate-50 font-semibold">
            <td className="p-3">Total</td>
            <td className="p-3 text-center">{formatMoney(total.expectedLow)}</td>
            <td className="p-3 text-center font-normal text-muted-foreground">{highCell(null)}</td>
            <td className="p-3">{formatMoney(total.submitted)}</td>
            <td className="p-3 text-amber-700">{formatMoney(total.pending)}</td>
            <td className="p-3">{formatMoney(total.collected)}</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <div className="flex flex-wrap gap-3">
      <Button data-tour="analyze-income" onClick={() => setView('recovery')} className="bg-blue-600 text-white shadow-sm hover:bg-blue-700">
        Analyze Lost and Pending Income
      </Button>
      <Button variant="outline" disabled>Historical income (coming soon)</Button>
    </div>

  </div>;
}
