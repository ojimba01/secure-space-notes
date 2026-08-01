import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BillingCycle, cycleUrgency } from '@/lib/billing';
import { BillingClient } from '@/hooks/useBilling';

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  onOpenTimeline: (clientId: string) => void;
}

type CycleFilter = 'all' | 'due_48' | 'due_week' | 'overdue' | 'paid' | 'denied';

const FILTERS: { key: CycleFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'due_48', label: 'Due within 48 hours' },
  { key: 'due_week', label: 'Due this week' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Billing approved' },
  { key: 'denied', label: 'Denied' },
];


const COLS = [1, 2, 3, 4, 5];

function cycleMatches(c: BillingCycle, f: CycleFilter): boolean {
  if (f === 'all') return true;
  if (f === 'paid') return c.payment_status === 'Paid';
  if (f === 'denied') return c.billing_status === 'Denied';
  const u = cycleUrgency(c);
  if (f === 'overdue') return u === 'overdue';
  if (f === 'due_48') return u === 'due_48';
  if (f === 'due_week') return u === 'due_week' || u === 'due_48';
  return false;
}

export const CycleDates: React.FC<Props> = ({ clients, cycles, onOpenTimeline }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CycleFilter>('all');

  const cyclesByClient = useMemo(() => {
    const m = new Map<string, Map<number, BillingCycle>>();
    cycles.forEach((c) => {
      const inner = m.get(c.client_id) ?? new Map<number, BillingCycle>();
      inner.set(c.cycle_number, c);
      m.set(c.client_id, inner);
    });
    return m;
  }, [cycles]);

  const rows = useMemo(() => {
    return clients
      .filter((cl) => {
        if (search) {
          const name = `${cl.first_name} ${cl.last_name}`.toLowerCase();
          const q = search.toLowerCase();
          if (!name.includes(q) && !(cl.member_id ?? '').toLowerCase().includes(q)) return false;
        }
        if (filter !== 'all') {
          const inner = cyclesByClient.get(cl.id);
          if (!inner) return false;
          if (![...inner.values()].some((c) => cycleMatches(c, filter))) return false;
        }
        return true;
      })
      .sort((a, b) => `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`));
  }, [clients, cyclesByClient, search, filter]);

  const renderCell = (c: BillingCycle | undefined) => {
    if (!c) return <span className="text-muted-foreground text-xs">—</span>;
    const u = cycleUrgency(c);
    const isPaid = c.payment_status === 'Paid';
    const isDenied = c.billing_status === 'Denied';
    // Paid cells are muted unless the Paid filter is active.
    const muted = isPaid && filter !== 'paid';

    let badge: React.ReactNode = null;
    if (isDenied) badge = <Badge className="bg-red-600 text-white hover:bg-red-600">Denied</Badge>;
    else if (isPaid) badge = <Badge className="bg-green-600 text-white hover:bg-green-600">Billing approved</Badge>;
    else if (u === 'overdue') badge = <Badge className="bg-red-600 text-white hover:bg-red-600">Overdue</Badge>;
    else if (u === 'due_48') badge = <Badge className="bg-amber-500 text-white hover:bg-amber-500">Due within 48h</Badge>;
    else if (u === 'due_week') badge = <Badge className="bg-amber-400 text-white hover:bg-amber-400">Due this week</Badge>;
    else if (c.billing_status === 'Submitted') badge = <Badge className="bg-blue-600 text-white hover:bg-blue-600">Pending billing approval</Badge>;

    return (
      <div className={muted ? 'opacity-40' : ''}>
        <div className="text-xs whitespace-nowrap">{c.cycle_start}</div>
        <div className="text-xs text-muted-foreground whitespace-nowrap">{c.cycle_end}</div>
        {badge && <div className="mt-1">{badge}</div>}
      </div>
    );
  };


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search by name or member ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
      </div>
      <div className="flex flex-wrap gap-1 border rounded-md p-1 w-fit">
        {FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={filter === f.key ? 'default' : 'ghost'} onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 z-20 bg-muted">Client</TableHead>
                {COLS.map((n) => <TableHead key={n}>Cycle {n}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No clients match these filters.</TableCell></TableRow>
              )}
              {rows.map((cl) => {
                const inner = cyclesByClient.get(cl.id);
                return (
                  <TableRow key={cl.id} className="cursor-pointer" onClick={() => onOpenTimeline(cl.id)}>
                    <TableCell className="font-medium whitespace-nowrap sticky left-0 z-10 bg-background">{cl.first_name} {cl.last_name}</TableCell>
                    {COLS.map((n) => (
                      <TableCell key={n} className="align-top">{renderCell(inner?.get(n))}</TableCell>
                    ))}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="text-sm text-muted-foreground">{rows.length} clients</div>
    </div>
  );
};
