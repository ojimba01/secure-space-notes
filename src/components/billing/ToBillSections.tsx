// Billing → To bill.
//
// Every cycle still to be claimed, in four groups by how long is left to file
// it: the deadline is inside a month, it has ended with time to spare, it is
// still running, or its six-month window has closed. Each row says when the
// cycle ends and the last day it can be billed; pressing it shows the
// client's whole run of cycles and which of them have been billed.
import React, { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, Search, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BillingClient } from '@/hooks/useBilling';
import {
  daysBetween,
  daysToFinalDeadline,
  finalDeadlineFor,
  hasCycleEnded,
  isCycleResolved,
  normalizeLevel,
  RATE_LOW,
  rateForLevel,
  todayAgency,
  type BillingCycle,
} from '@/lib/billing';

type SectionKey = 'deadline' | 'ready' | 'soon' | 'missed';

/** Rows shown per section before the arrows. */
const PAGE_SIZE = 7;

const SECTIONS: { key: SectionKey; title: string; help: string; dot: string }[] = [
  {
    key: 'deadline',
    title: 'File before the deadline',
    help: 'Filing deadline within 30 days. Claims submitted after the last day to bill will not be paid.',
    dot: 'bg-red-600',
  },
  {
    key: 'ready',
    title: 'Ready to bill',
    help: 'Completed cycles with more than 30 days remaining before the filing deadline.',
    dot: 'bg-amber-500',
  },
  {
    key: 'soon',
    title: 'Coming up',
    help: 'Cycles in progress. They move to Ready to bill when they end.',
    dot: 'bg-blue-600',
  },
  {
    key: 'missed',
    title: 'Missed deadlines',
    help: 'The 6-month filing window has closed. Shown for reference.',
    dot: 'bg-slate-400',
  },
];

const fmt = (d: string) => format(parseISO(d), 'MMM d, yyyy');
const short = (d: string) => format(parseISO(d), 'MMM d');
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

interface Row {
  client: BillingClient;
  cycle: BillingCycle;
  fileBy: string;
  left: number;
  amount: number;
  /** Priced at the Low rate because no level of need is recorded. */
  assumedLow: boolean;
}

/** Waiting to be claimed: not submitted, not paid, not closed off. */
const unbilled = (c: BillingCycle) =>
  c.is_active !== false &&
  !isCycleResolved(c) &&
  c.billing_status !== 'Submitted' &&
  c.payment_status !== 'Paid';

/** Where a cycle stands, for the client's cycle history. */
function statusOf(c: BillingCycle, today: string): { label: string; tone: string } {
  if (!hasCycleEnded(c, today) && c.cycle_start <= today) return { label: 'Running', tone: 'bg-slate-100 text-slate-700' };
  if (c.cycle_start > today) return { label: 'Not started', tone: 'bg-slate-100 text-slate-500' };
  if (c.payment_status === 'Paid' || c.approval_state === 'Approved') return { label: 'Paid', tone: 'bg-green-100 text-green-800' };
  if (c.billing_status === 'Denied') return { label: 'Denied', tone: 'bg-red-100 text-red-800' };
  if (c.billing_status === 'Submitted') return { label: 'Billed · pending', tone: 'bg-sky-100 text-sky-800' };
  if (isCycleResolved(c)) return { label: c.approval_state ?? 'Closed', tone: 'bg-slate-100 text-slate-600' };
  if (daysToFinalDeadline(c, today) < 0) return { label: 'Missed', tone: 'bg-red-100 text-red-800' };
  return { label: 'Not billed', tone: 'bg-amber-100 text-amber-900' };
}

const Chip: React.FC<{ tone: string; children: React.ReactNode }> = ({ tone, children }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>
);

const FileByCell: React.FC<{ row: Row }> = ({ row }) => {
  if (row.left < 0) {
    return (
      <span>
        <b className="font-semibold">{fmt(row.fileBy)}</b>
        <span className="block text-xs text-muted-foreground">Closed {-row.left} days ago</span>
      </span>
    );
  }
  const tone = row.left <= 7 ? 'bg-red-100 text-red-800' : row.left <= 30 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600';
  return (
    <span className="flex flex-wrap items-center gap-2">
      <b className="font-semibold">{fmt(row.fileBy)}</b>
      <Chip tone={tone}>{row.left === 0 ? 'Last day' : `${row.left} days left`}</Chip>
    </span>
  );
};

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  /** Open the Availity boxes for this client and cycle. */
  onOpenClaim: (clientId: string, cycleId: string) => void;
}

export const ToBillSections: React.FC<Props> = ({ clients, cycles, onOpenClaim }) => {
  const today = todayAgency();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [missedOpen, setMissedOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Each section shows PAGE_SIZE rows at a time, with arrows for the rest.
  const [pages, setPages] = useState<Record<SectionKey, number>>({ deadline: 0, ready: 0, soon: 0, missed: 0 });
  useEffect(() => setPages({ deadline: 0, ready: 0, soon: 0, missed: 0 }), [query]);

  const cyclesByClient = useMemo(() => {
    const map = new Map<string, BillingCycle[]>();
    for (const c of cycles) {
      if (c.is_active === false) continue;
      const list = map.get(c.client_id) ?? [];
      list.push(c);
      map.set(c.client_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.cycle_start.localeCompare(b.cycle_start));
    return map;
  }, [cycles]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const out: Record<SectionKey, Row[]> = { deadline: [], ready: [], soon: [], missed: [] };
    for (const client of clients) {
      if (client.deleted_at) continue;
      if (q && !`${client.first_name ?? ''} ${client.last_name ?? ''} ${client.member_id ?? ''} ${client.insurance ?? ''}`.toLowerCase().includes(q)) continue;
      const rate = rateForLevel(normalizeLevel(client.level_of_need) ? `${normalizeLevel(client.level_of_need)} Level` : null);
      for (const cycle of cyclesByClient.get(client.id) ?? []) {
        if (!unbilled(cycle)) continue;
        const ended = hasCycleEnded(cycle, today);
        const running = !ended && cycle.cycle_start <= today;
        // A closed case has nothing coming up; only what it already earned.
        if (!ended && (!running || client.status !== 'active')) continue;
        const left = daysToFinalDeadline(cycle, today);
        const row: Row = {
          client,
          cycle,
          fileBy: finalDeadlineFor(cycle),
          left,
          amount: cycle.billed_amount ?? rate ?? RATE_LOW,
          assumedLow: cycle.billed_amount == null && rate == null,
        };
        if (!ended) out.soon.push(row);
        else if (left < 0) out.missed.push(row);
        else if (left <= 30) out.deadline.push(row);
        else out.ready.push(row);
      }
    }
    out.deadline.sort((a, b) => a.left - b.left);
    out.ready.sort((a, b) => a.left - b.left);
    out.soon.sort((a, b) => a.cycle.cycle_end.localeCompare(b.cycle.cycle_end));
    out.missed.sort((a, b) => b.left - a.left);
    return out;
  }, [clients, cyclesByClient, query, today]);

  const sum = (rows: Row[]) => money(rows.reduce((n, r) => n + r.amount, 0));
  const tiles: { key: SectionKey; value: number; note: string }[] = [
    {
      key: 'deadline',
      value: sections.deadline.length,
      note: sections.deadline.length ? `${sum(sections.deadline)} · soonest ${short(sections.deadline[0].fileBy)}` : 'Nothing due',
    },
    { key: 'ready', value: sections.ready.length, note: sum(sections.ready) },
    {
      key: 'soon',
      value: sections.soon.length,
      note: sections.soon.length ? `Next ends ${short(sections.soon[0].cycle.cycle_end)}` : 'None running',
    },
    { key: 'missed', value: sections.missed.length, note: 'For reference' },
  ];

  const jump = (key: SectionKey) => {
    if (key === 'missed') setMissedOpen(true);
    window.setTimeout(() => document.getElementById(`tobill-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  const paged = (key: SectionKey, rows: Row[]) => {
    const last = Math.max(0, Math.ceil(rows.length / PAGE_SIZE) - 1);
    const page = Math.min(pages[key], last);
    const go = (to: number) => {
      setPages((p) => ({ ...p, [key]: to }));
      setExpanded(null);
    };
    const from = page * PAGE_SIZE;
    return (
      <>
        {table(key, rows.slice(from, from + PAGE_SIZE))}
        {rows.length > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {from + 1}–{Math.min(from + PAGE_SIZE, rows.length)} of {rows.length}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Previous" disabled={page === 0} onClick={() => go(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Next" disabled={page === last} onClick={() => go(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </>
    );
  };

  const table = (key: SectionKey, rows: Row[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Client</th>
            <th className="px-3 py-2 font-medium">MCO</th>
            <th className="px-3 py-2 font-medium">Cycle</th>
            <th className="px-3 py-2 font-medium">Cycle ends</th>
            <th className="px-3 py-2 font-medium">Last day to bill</th>
            <th className="px-3 py-2 font-medium">Claim value</th>
            <th className="px-3 py-2"><span className="sr-only">Details</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const id = `${key}:${r.cycle.id}`;
            const open = expanded === id;
            const running = key === 'soon';
            const history = cyclesByClient.get(r.client.id) ?? [];
            return (
              <React.Fragment key={id}>
                <tr
                  className={`cursor-pointer border-t hover:bg-muted/40 ${open ? 'bg-sky-50' : ''}`}
                  onClick={() => setExpanded(open ? null : id)}
                  aria-expanded={open}
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {r.client.first_name} {r.client.last_name}
                    {r.client.status !== 'active' && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(case closed)</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{r.client.insurance ?? '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">Cycle {r.cycle.cycle_number}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                    {fmt(r.cycle.cycle_end)}
                    {running && (
                      <span className="ml-1.5 text-xs text-muted-foreground">in {daysBetween(today, r.cycle.cycle_end)} days</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums"><FileByCell row={r} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                    {money(r.amount)}
                    {r.assumedLow && (
                      <span className="ml-1 text-xs text-muted-foreground" title="No level of need on the record, so counted at the Low rate">
                        · Low rate
                      </span>
                    )}
                  </td>
                  <td className="w-12 px-3 py-2.5 text-right">
                    <span className={`inline-grid h-7 w-7 place-items-center rounded-md border bg-white ${open ? 'rotate-180' : ''} transition-transform`}>
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </td>
                </tr>
                {open && (
                  <tr className="bg-sky-50">
                    <td colSpan={7} className="px-3 pb-3">
                      <div className="overflow-hidden rounded-lg border bg-white">
                        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                          <b className="text-sm">{r.client.first_name} {r.client.last_name} · every cycle</b>
                          {key !== 'missed' && !running && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              title="Open the claim fields for this cycle"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenClaim(r.client.id, r.cycle.id);
                              }}
                            >
                              <FileSpreadsheet className="h-4 w-4" />
                              Open billing details
                            </Button>
                          )}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                              <tr>
                                <th className="px-3 py-1.5 font-medium">Cycle</th>
                                <th className="px-3 py-1.5 font-medium">Service dates</th>
                                <th className="px-3 py-1.5 font-medium">Last day to bill</th>
                                <th className="px-3 py-1.5 font-medium">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {history.map((h) => {
                                const s = statusOf(h, today);
                                const current = h.id === r.cycle.id;
                                return (
                                  <tr key={h.id} className={`border-t ${current ? 'bg-amber-50 font-semibold' : ''}`}>
                                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                                      Cycle {h.cycle_number}
                                      {current && <Chip tone="ml-1.5 bg-sky-100 text-sky-800">Selected</Chip>}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                                      {short(h.cycle_start)} – {fmt(h.cycle_end)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{fmt(finalDeadlineFor(h))}</td>
                                    <td className="px-3 py-1.5"><Chip tone={s.tone}>{s.label}</Chip></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => {
          const s = SECTIONS.find((x) => x.key === t.key)!;
          return (
            <button
              key={t.key}
              onClick={() => jump(t.key)}
              className="grid gap-0.5 rounded-lg border bg-white p-3 text-left hover:border-primary"
            >
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                {s.title}
              </span>
              <span className="text-2xl font-bold tabular-nums">{t.value}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{t.note}</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="bg-white pl-9"
          placeholder="Filter by client name, member ID or MCO"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setQuery('')} aria-label="Clear">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {SECTIONS.map((s) => {
        const rows = sections[s.key];
        const head = (
          <h2 className="flex items-center gap-2 font-semibold">
            <span className={`h-2 w-2 rounded-full ${s.dot}`} />
            {s.title}
            <span className="text-sm font-normal tabular-nums text-muted-foreground">({rows.length})</span>
          </h2>
        );
        if (s.key === 'missed') {
          return (
            <Card key={s.key} id={`tobill-${s.key}`} className="overflow-hidden">
              <button
                className="flex w-full items-center justify-between px-4 py-3 text-left"
                onClick={() => setMissedOpen((v) => !v)}
              >
                {head}
                <span className="text-sm text-muted-foreground">{missedOpen ? 'Hide' : 'Show'}</span>
              </button>
              {missedOpen && (
                <>
                  <p className="border-t px-4 py-2.5 text-sm text-muted-foreground">{s.help}</p>
                  {rows.length ? paged(s.key, rows) : <p className="border-t px-4 py-3 text-sm text-muted-foreground">None.</p>}
                </>
              )}
            </Card>
          );
        }
        return (
          <Card key={s.key} id={`tobill-${s.key}`} className="overflow-hidden">
            <div className="border-b px-4 py-3">{head}</div>
            <p className="px-4 py-2.5 text-sm text-muted-foreground">{s.help}</p>
            {rows.length ? (
              paged(s.key, rows)
            ) : (
              <p className="border-t px-4 py-3 text-sm text-muted-foreground">
                {query ? 'No clients match that filter.' : 'None right now.'}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
};
