// Step 2 of billing: what happened to the claims that went out.
//
// Filing a claim in Availity is not the end of it. The MCO pays it, sits on it,
// or denies it, and until someone records which, Revenue cannot tell collected
// money from money that is merely claimed. This is where that is recorded, and
// it is the only thing that moves a cycle into the Collected column.
//
// A denial sends the cycle back to step 1 to be filed again, which is why it
// clears the submitted date rather than just labelling the cycle.

import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { toast } from 'sonner';
import { BillingCycle, todayAgency } from '@/lib/billing';
import { usDate } from '@/lib/availity';
import { BillingClient } from '@/hooks/useBilling';

interface Props {
  clients: BillingClient[];
  cycles: BillingCycle[];
  updateCycle: (id: string, patch: Partial<BillingCycle>) => Promise<void>;
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SubmittedClaims: React.FC<Props> = ({ clients, cycles, updateCycle }) => {
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const byClient = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  // A claim is here once it has been filed and until it is paid or denied.
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cycles
      .filter((c) => c.billing_status === 'Submitted')
      .map((cycle) => ({ cycle, client: byClient.get(cycle.client_id) }))
      .filter((r): r is { cycle: BillingCycle; client: BillingClient } => !!r.client)
      .filter((r) =>
        !q ||
        `${r.client.first_name} ${r.client.last_name}`.toLowerCase().includes(q) ||
        (r.client.member_id ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => (a.cycle.submitted_date ?? '').localeCompare(b.cycle.submitted_date ?? ''));
  }, [cycles, byClient, query]);

  const awaiting = rows.filter((r) => r.cycle.payment_status !== 'Paid');
  const paid = rows.filter((r) => r.cycle.payment_status === 'Paid');

  const set = async (cycle: BillingCycle, patch: Partial<BillingCycle>, message: string) => {
    setBusy(cycle.id);
    try {
      await updateCycle(cycle.id, patch);
      toast.success(message);
    } catch (err) {
      toast.error('Could not update the claim', {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  };

  const markPaid = (cycle: BillingCycle) =>
    set(
      cycle,
      { payment_status: 'Paid', paid_amount: cycle.billed_amount ?? 0, paid_date: todayAgency() },
      'Recorded as paid. It now counts as collected in Revenue.',
    );

  const markPending = (cycle: BillingCycle) =>
    set(
      cycle,
      { payment_status: 'Unpaid', paid_amount: 0, paid_date: null },
      'Recorded as pending.',
    );

  // A denial has to go back to step 1, so the submitted date and claim number
  // are cleared: the cycle is unfiled again, not merely labelled.
  const markDenied = (cycle: BillingCycle) =>
    set(
      cycle,
      {
        billing_status: 'Denied',
        payment_status: 'Unpaid',
        paid_amount: 0,
        paid_date: null,
        submitted_date: null,
        approval_state: 'Denied (will resubmit)',
      },
      'Recorded as denied. It is back in Clients to bill to be filed again.',
    );

  const row = (r: { cycle: BillingCycle; client: BillingClient }) => {
    const c = r.cycle;
    const isPaid = c.payment_status === 'Paid';
    return (
      <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-t p-3 text-sm">
        <div className="min-w-[16rem] flex-1">
          <b>
            {r.client.first_name} {r.client.last_name}
          </b>
          <div className="text-muted-foreground">
            Cycle {c.cycle_number} · {usDate(c.cycle_start)} – {usDate(c.cycle_end)} ·{' '}
            {money(c.billed_amount ?? 0)}
            {c.claim_number ? ` · claim ${c.claim_number}` : ''}
          </div>
          <div className="text-xs text-muted-foreground">
            Billed {c.submitted_date ? usDate(c.submitted_date) : '—'}
            {isPaid && c.paid_date ? ` · paid ${usDate(c.paid_date)}` : ''}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isPaid ? (
            <>
              <Badge variant="secondary" className="bg-green-100 text-green-800">Paid</Badge>
              <Button size="sm" variant="outline" disabled={busy === c.id} onClick={() => markPending(c)}>
                Not paid after all
              </Button>
            </>
          ) : (
            <>
              <Badge variant="secondary" className="bg-blue-100 text-blue-900">Pending</Badge>
              <Button size="sm" disabled={busy === c.id} onClick={() => markPaid(c)}>
                Paid
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-red-300 text-red-700 hover:bg-red-50"
                disabled={busy === c.id}
                onClick={() => markDenied(c)}
              >
                Denied
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold">Claims that have been filed</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Record what the MCO did with each claim. Until a claim is marked paid it counts as pending
          in Revenue, not collected. A denied claim goes back to Clients to bill so it can be filed
          again.
        </p>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name or member ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </Card>

      {rows.length === 0 ? (
        <Card className="p-10 text-center">
          <h3 className="font-semibold">
            {query.trim() ? 'No filed claims match that search' : 'No claims have been filed yet'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.trim()
              ? 'Try a different name or member ID, or clear the search.'
              : 'A claim appears here once it is marked as billed in Clients to bill.'}
          </p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <div className="bg-blue-50 p-4">
              <h3 className="font-semibold text-blue-900">Waiting on the MCO ({awaiting.length})</h3>
              <p className="mt-1 text-sm text-blue-900/80">
                Filed, with no payment recorded yet.
              </p>
            </div>
            {awaiting.length ? awaiting.map(row) : (
              <p className="border-t p-4 text-sm text-muted-foreground">Nothing is waiting.</p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="bg-green-50 p-4">
              <h3 className="font-semibold text-green-900">Paid ({paid.length})</h3>
              <p className="mt-1 text-sm text-green-900/80">
                Counted as collected in Revenue.
              </p>
            </div>
            {paid.length ? paid.map(row) : (
              <p className="border-t p-4 text-sm text-muted-foreground">Nothing recorded as paid yet.</p>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default SubmittedClaims;
