import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { BillingCycle, formatMoney } from '@/lib/billing';
import { BillingClient } from '@/hooks/useBilling';
import {
  buildDeadlineRows,
  bucketFor,
  BUCKET_META,
  DeadlineBucket,
  DeadlineRow,
  markCycleSubmitted,
} from '@/lib/billingDeadlines';

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  refresh: () => void;
  onOpenTimeline: (clientId: string) => void;
}

const ORDER: DeadlineBucket[] = ['overdue', 'week', 'month', 'later'];

const daysLabel = (d: number) =>
  d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'due today' : `${d}d left`;

export const UpcomingDeadlines: React.FC<Props> = ({ clients, cycles, refresh, onOpenTimeline }) => {
  const [submitting, setSubmitting] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const rows = buildDeadlineRows(clients, cycles);
    const map: Record<DeadlineBucket, DeadlineRow[]> = { overdue: [], week: [], month: [], later: [] };
    for (const r of rows) map[bucketFor(r.daysRemaining)].push(r);
    return map;
  }, [clients, cycles]);

  const total = ORDER.reduce((s, b) => s + grouped[b].length, 0);

  const handleSubmit = async (cycle: BillingCycle) => {
    setSubmitting(cycle.id);
    try {
      await markCycleSubmitted(cycle);
      toast.success('Marked as submitted');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update');
    } finally {
      setSubmitting(null);
    }
  };

  if (cycles.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No billing cycles yet. Add a client's 150-Day authorization start date (or run the backfill), and cycles appear automatically.
        </CardContent>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Nothing due — you're all caught up. 🎉
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {ORDER.map((bucket) => {
        const rows = grouped[bucket];
        if (rows.length === 0) return null;
        const meta = BUCKET_META[bucket];
        return (
          <div key={bucket} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge className={meta.badgeClass}>{meta.label}</Badge>
              <span className="text-sm text-muted-foreground">{rows.length}</span>
            </div>
            <Card>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead>Mark Submitted</TableHead>
                      <TableHead>Assigned Staff</TableHead>
                      <TableHead>MCO</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>#</TableHead>
                      <TableHead>Billed</TableHead>
                      <TableHead>Remaining</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(({ cycle: c, client: cl, dueDate, daysRemaining }) => (
                      <TableRow
                        key={c.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => onOpenTimeline(c.client_id)}
                      >
                        <TableCell className="font-medium whitespace-nowrap">{cl.first_name} {cl.last_name}</TableCell>
                        <TableCell className="whitespace-nowrap">{dueDate}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Button variant="outline" size="sm" className="h-8 gap-1" disabled={submitting === c.id}
                            onClick={(e) => { e.stopPropagation(); handleSubmit(c); }}>
                            <CheckCircle2 className="h-4 w-4" />Mark Submitted
                          </Button>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{cl.assigned_staff_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                        <TableCell>{cl.insurance ?? '—'}</TableCell>
                        <TableCell><Badge variant="outline" className="whitespace-nowrap">{c.phase}</Badge></TableCell>
                        <TableCell>{c.cycle_number}</TableCell>
                        <TableCell>{formatMoney(c.billed_amount)}</TableCell>
                        <TableCell className={`whitespace-nowrap font-medium ${meta.rowClass}`}>{daysLabel(daysRemaining)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

              </CardContent>
            </Card>
          </div>
        );
      })}
    </div>
  );
};
