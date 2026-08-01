import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  BillingCycle,
  BillingUrgency,
  APPROVAL_STAGES,
  ApprovalStage,
  approvalStageFor,
  summarizeClientBilling,
  billingBadgeClass,
  billingStatusLabel,
  hspStatusFor,
  isMissingBillingSetup,
  missingSetupItems,
  nextBillingAction,
  urgencyLabel,
} from '@/lib/billing';
import { BillingClient } from '@/hooks/useBilling';

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  onOpenTimeline: (clientId: string) => void;
}

type UrgencyFilter = 'all' | 'due_48' | 'due_week' | 'overdue' | 'denied' | 'missing';

const URGENCY_FILTERS: { key: UrgencyFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'due_48', label: 'Due within 48 hours' },
  { key: 'due_week', label: 'Due this week' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'denied', label: 'Denied' },
  { key: 'missing', label: 'Missing information' },
];

function urgencyBadge(u: BillingUrgency) {
  const label = urgencyLabel(u);
  if (!label) return null;
  const cls =
    u === 'overdue'
      ? 'bg-red-600 text-white hover:bg-red-600'
      : u === 'due_48'
        ? 'bg-amber-500 text-white hover:bg-amber-500'
        : 'bg-amber-400 text-white hover:bg-amber-400';
  return <Badge className={cls}>{label}</Badge>;
}


export const BillingOverview: React.FC<Props> = ({ clients, cycles, onOpenTimeline }) => {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState<'all' | ApprovalStage>('all');
  const [urgency, setUrgency] = useState<UrgencyFilter>('all');

  const cyclesByClient = useMemo(() => {
    const m = new Map<string, BillingCycle[]>();
    cycles.forEach((c) => {
      const arr = m.get(c.client_id) ?? [];
      arr.push(c);
      m.set(c.client_id, arr);
    });
    m.forEach((arr) => arr.sort((a, b) => a.cycle_number - b.cycle_number));
    return m;
  }, [cycles]);

  const rows = useMemo(() => {
    return clients
      .map((cl) => {
        const cyc = cyclesByClient.get(cl.id) ?? [];
        return {
          cl,
          summary: summarizeClientBilling(cl, cyc),
          stage: approvalStageFor(cl, cyc),
          hsp: hspStatusFor(cl),
          action: nextBillingAction(cl, cyc),
          missing: isMissingBillingSetup(cl) ? missingSetupItems(cl) : [],
        };
      })
      .filter(({ cl, summary, stage: st, missing }) => {
        if (search) {
          const name = `${cl.first_name} ${cl.last_name}`.toLowerCase();
          const q = search.toLowerCase();
          if (!name.includes(q) && !(cl.member_id ?? '').toLowerCase().includes(q)) return false;
        }
        if (stage !== 'all' && st !== stage) return false;
        if (urgency === 'missing' && missing.length === 0) return false;
        if (urgency === 'denied' && !summary.hasDenied) return false;
        if (urgency === 'due_48' && summary.urgency !== 'due_48') return false;
        if (urgency === 'due_week' && !(summary.urgency === 'due_week' || summary.urgency === 'due_48')) return false;
        if (urgency === 'overdue' && summary.urgency !== 'overdue') return false;
        return true;
      })
      .sort((a, b) => `${a.cl.last_name}${a.cl.first_name}`.localeCompare(`${b.cl.last_name}${b.cl.first_name}`));
  }, [clients, cyclesByClient, search, stage, urgency]);


  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Search by name or member ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64"
        />
        <Select value={stage} onValueChange={(v) => setStage(v as 'all' | ApprovalStage)}>
          <SelectTrigger className="w-56" data-tutorial="billing-approval-status"><SelectValue placeholder="Approval status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All approval statuses</SelectItem>
            {APPROVAL_STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap gap-1 border rounded-md p-1 w-fit" data-tutorial="billing-urgency-filters">
        {URGENCY_FILTERS.map((f) => (
          <Button key={f.key} size="sm" variant={urgency === f.key ? 'default' : 'ghost'} onClick={() => setUrgency(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Case manager</TableHead>
                <TableHead>Level of need</TableHead>
                <TableHead>Next action</TableHead>
                <TableHead>HSP status</TableHead>
                <TableHead>Claim status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No clients match these filters.</TableCell></TableRow>
              )}
              {rows.map(({ cl, summary, stage: st }) => (
                <TableRow key={cl.id} className="cursor-pointer" onClick={() => onOpenTimeline(cl.id)}>
                  <TableCell className="font-medium whitespace-nowrap">{cl.first_name} {cl.last_name}</TableCell>
                  <TableCell className="whitespace-nowrap">{cl.assigned_staff_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                  <TableCell className="whitespace-nowrap">{cl.level_of_need ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {summary.dueDate ?? '—'}
                    {urgencyBadge(summary.urgency) && <span className="ml-2">{urgencyBadge(summary.urgency)}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{st}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {summary.hasDenied ? (
                      <Badge className="bg-red-600 text-white hover:bg-red-600">Denied</Badge>
                    ) : summary.claimStatus ? (
                      <Badge className={billingBadgeClass(summary.claimStatus)}>{summary.claimStatus}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <div className="text-sm text-muted-foreground">{rows.length} clients</div>
    </div>
  );
};
