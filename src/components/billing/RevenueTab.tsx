import { Fragment, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { ChevronDown, ChevronRight, Undo2 } from 'lucide-react';
import { BillingClient } from '@/hooks/useBilling';
import {
  BillingCycle,
  RATE_LOW,
  formatMoney,
  monthKey,
  rateForLevel,
  todayAgency,
  toDate,
  daysBetween,
  finalDeadlineFor,
} from '@/lib/billing';

/** Two months back, this month, and three ahead. */
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 3;

const monthLabel = (key: string) =>
  new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const dateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

interface MonthRow {
  key: string;
  /** Every cycle ending in the month, at the client's rate. */
  expected: number;
  /** Of those, the ones filed. */
  billed: number;
  /** Of those, the ones paid. */
  collected: number;
  /** Filed and not paid yet. */
  pending: number;
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

// The months shown: the last two, this one and the next three.
function monthWindow(today = todayAgency()): string[] {
  const start = toDate(`${monthKey(today)}-01`);
  return Array.from({ length: MONTHS_BACK + 1 + MONTHS_AHEAD }, (_, i) => {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i - MONTHS_BACK);
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

  const amountOf = (cycle: BillingCycle) =>
    cycle.billed_amount ?? rateForLevel(clientById.get(cycle.client_id)?.level_of_need) ?? RATE_LOW;

  const { rows, assumedClientCount, collectedThisMonth, waiting } = useMemo(() => {
    const byMonth = new Map(months.map((m) => [m, { key: m, expected: 0, billed: 0, collected: 0, pending: 0 } as MonthRow]));
    const assumedIds = new Set<string>();
    const thisMonth = monthKey(today);
    let collectedThisMonth = 0;
    let waiting = 0;

    for (const cycle of cycles) {
      if (cycle.is_active === false) continue;
      const client = clientById.get(cycle.client_id);
      const amount = amountOf(cycle);
      const filed = cycle.billing_status === 'Submitted' || cycle.payment_status === 'Paid';
      const paid = cycle.payment_status === 'Paid';
      if (filed && !paid) waiting += amount;
      if (paid && cycle.paid_date && monthKey(cycle.paid_date) === thisMonth) {
        collectedThisMonth += cycle.paid_amount || amount;
      }
      const row = byMonth.get(monthKey(cycle.cycle_end));
      if (!row) continue;
      if (cycle.billed_amount == null && rateForLevel(client?.level_of_need) == null && client) assumedIds.add(client.id);
      row.expected += amount;
      if (filed) row.billed += amount;
      if (paid) row.collected += cycle.paid_amount || amount;
      else if (filed) row.pending += amount;
    }

    return { rows: months.map((m) => byMonth.get(m)!), assumedClientCount: assumedIds.size, collectedThisMonth, waiting };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const thisMonth = monthKey(today);
  const current = rows.find((r) => r.key === thisMonth);
  const max = Math.max(1, ...rows.map((r) => r.expected));
  const monthName = (key: string) => new Date(`${key}-01T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });

  return <div className="space-y-4" data-tour="revenue-section">
    <div className="grid gap-3 md:grid-cols-3">
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">{monthName(thisMonth)} so far</div>
        <div className="mt-1 text-2xl font-bold tabular-nums">
          {formatMoney(current?.billed ?? 0)} <span className="text-sm font-normal text-muted-foreground">billed</span>
        </div>
        <div className="mt-1 text-xs tabular-nums text-muted-foreground">of {formatMoney(current?.expected ?? 0)} expected this month</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Collected in {monthName(thisMonth)}</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-green-700">{formatMoney(collectedThisMonth)}</div>
        <div className="mt-1 text-xs text-muted-foreground">Claims marked paid this month.</div>
      </Card>
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Waiting on the MCO</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-amber-700">{formatMoney(waiting)}</div>
        <div className="mt-1 text-xs text-muted-foreground">Filed, not paid yet, all months.</div>
      </Card>
    </div>

    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
        <h2 className="font-semibold">By month</h2>
        
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Month</th>
              <th className="px-3 py-2 font-medium">Expected</th>
              <th className="px-3 py-2"><span className="sr-only">Billed against expected</span></th>
              <th className="px-3 py-2 font-medium">Billed</th>
              <th className="px-3 py-2 font-medium">Collected</th>
              <th className="px-3 py-2 font-medium">Pending</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const future = r.key > thisMonth;
              const dash = <span className="text-muted-foreground">—</span>;
              return <tr key={r.key} className="border-t">
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold">
                  {monthLabel(r.key)}
                  {r.key === thisMonth && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">This month</span>}
                </td>
                <td className="px-3 py-2.5 tabular-nums">{formatMoney(r.expected)}</td>
                <td className="px-3 py-2.5">
                  <div className="h-2 min-w-[120px] overflow-hidden rounded bg-muted" title="Billed against expected">
                    <div className="h-full bg-primary" style={{ width: `${Math.round((100 * r.billed) / max)}%` }} />
                  </div>
                  <div className="mt-1 h-2 min-w-[120px] overflow-hidden rounded bg-muted">
                    <div className="h-full bg-slate-300" style={{ width: `${Math.round((100 * r.expected) / max)}%` }} />
                  </div>
                </td>
                <td className="px-3 py-2.5 tabular-nums">{future ? dash : formatMoney(r.billed)}</td>
                <td className="px-3 py-2.5 tabular-nums">{future ? dash : formatMoney(r.collected)}</td>
                <td className={`px-3 py-2.5 tabular-nums ${!future && r.pending > 0 ? 'font-medium text-amber-700' : ''}`}>{future ? dash : formatMoney(r.pending)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      {assumedClientCount > 0 && (
        <p className="border-t px-4 py-3 text-sm text-muted-foreground">
          <span className="mr-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
            {assumedClientCount} client{assumedClientCount === 1 ? '' : 's'}
          </span>
          {assumedClientCount === 1 ? 'has' : 'have'} no level of need recorded and {assumedClientCount === 1 ? 'is' : 'are'} calculated at the Low rate ({formatMoney(RATE_LOW)} per cycle). Add a level of need for an exact figure.
        </p>
      )}
    </Card>

    <div className="flex flex-wrap gap-3">
      <Button data-tour="analyze-income" variant="outline" onClick={() => setView('recovery')}>
        Analyze lost and pending income
      </Button>
    </div>
  </div>;
}
