import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, ChevronRight, Eye } from 'lucide-react';
import {
  BillingCycle,
  formatMoney,
  nextBillDue,
  totalsForCycles,
  currentCycleNumber,
  billingBadgeClass,
} from '@/lib/billing';
import { BillingClient } from '@/hooks/useBilling';

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  onOpenTimeline: (clientId: string) => void;
}

const UNASSIGNED = '__unassigned__';

export const BillingByStaff: React.FC<Props> = ({ clients, cycles, onOpenTimeline }) => {
  const [selected, setSelected] = useState<string | null>(null);

  const cyclesByClient = useMemo(() => {
    const map = new Map<string, BillingCycle[]>();
    for (const c of cycles) {
      const arr = map.get(c.client_id) ?? [];
      arr.push(c);
      map.set(c.client_id, arr);
    }
    return map;
  }, [cycles]);

  const billableClients = useMemo(
    () => clients.filter((c) => c.status === 'active' && cyclesByClient.has(c.id)),
    [clients, cyclesByClient],
  );

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; name: string; clients: BillingClient[]; cycles: BillingCycle[] }>();
    for (const cl of billableClients) {
      const key = cl.assigned_employee_id ?? UNASSIGNED;
      const name = cl.assigned_staff_name ?? 'Unassigned';
      const g = map.get(key) ?? { key, name, clients: [], cycles: [] };
      g.clients.push(cl);
      g.cycles.push(...(cyclesByClient.get(cl.id) ?? []));
      map.set(key, g);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === UNASSIGNED) return 1;
      if (b.key === UNASSIGNED) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [billableClients, cyclesByClient]);

  if (cycles.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No billing cycles yet. Add a client's 150-Day authorization start date (or run the backfill), and cycles appear automatically.
        </CardContent>
      </Card>
    );
  }

  if (selected) {
    const group = groups.find((g) => g.key === selected);
    if (!group) {
      setSelected(null);
      return null;
    }
    const totals = totalsForCycles(group.cycles);
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelected(null)}>
            <ArrowLeft className="h-4 w-4" />Back
          </Button>
          <h3 className="text-lg font-semibold">{group.name}</h3>
          <Badge variant="secondary">{group.clients.length}</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Expected</div><div className="text-lg font-bold">{formatMoney(totals.expected)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Submitted</div><div className="text-lg font-bold">{formatMoney(totals.billed)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Collected</div><div className="text-lg font-bold text-green-600">{formatMoney(totals.collected)}</div></CardContent></Card>
          <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Outstanding</div><div className="text-lg font-bold text-amber-600">{formatMoney(totals.outstanding)}</div></CardContent></Card>
        </div>
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>MCO</TableHead>
                  <TableHead>Next due</TableHead>
                  <TableHead>Current status</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.clients
                  .slice()
                  .sort((a, b) => `${a.last_name}`.localeCompare(b.last_name))
                  .map((cl) => {
                    const cs = cyclesByClient.get(cl.id) ?? [];
                    const due = nextBillDue(cs, cl.auth_150_start);
                    const cur = currentCycleNumber(cl.auth_150_start);
                    const curCycle = cs.find((c) => c.cycle_number === cur);
                    const t = totalsForCycles(cs);
                    return (
                      <TableRow key={cl.id} className="cursor-pointer" onClick={() => onOpenTimeline(cl.id)}>
                        <TableCell className="font-medium whitespace-nowrap">{cl.first_name} {cl.last_name}</TableCell>
                        <TableCell>{cl.insurance ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">{due ?? '—'}</TableCell>
                        <TableCell>{curCycle ? <Badge className={billingBadgeClass(curCycle.billing_status)}>{curCycle.billing_status}</Badge> : '—'}</TableCell>
                        <TableCell>{formatMoney(t.expected)}</TableCell>
                        <TableCell><Button variant="ghost" size="icon" className="h-8 w-8"><Eye className="h-4 w-4" /></Button></TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case manager</TableHead>
              <TableHead>Clients</TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead>Collected</TableHead>
              <TableHead>Outstanding</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => {
              const t = totalsForCycles(g.cycles);
              return (
                <TableRow key={g.key} className="cursor-pointer" onClick={() => setSelected(g.key)}>
                  <TableCell className="font-medium whitespace-nowrap">
                    {g.key === UNASSIGNED ? <span className="text-muted-foreground">Unassigned</span> : g.name}
                  </TableCell>
                  <TableCell>{g.clients.length}</TableCell>
                  <TableCell>{formatMoney(t.expected)}</TableCell>
                  <TableCell>{formatMoney(t.billed)}</TableCell>
                  <TableCell className="text-green-600">{formatMoney(t.collected)}</TableCell>
                  <TableCell className="text-amber-600">{formatMoney(t.outstanding)}</TableCell>
                  <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
