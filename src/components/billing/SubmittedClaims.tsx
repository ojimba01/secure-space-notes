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
      'Recorded as denied. It is back in To bill to be filed again.',
    );

  const [show, setShow] = useState<'all' | 'pending' | 'paid'>('all');
  const shown = show === 'pending' ? awaiting : show === 'paid' ? paid : rows;

  const Chip = ({ tone, children }: { tone: string; children: React.ReactNode }) => (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>
  );

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-lg font-semibold">Filed Claims</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Log the MCO's action for each submitted claim. Claims will remain under pending revenue
          until they are marked as paid. Denied claims will be routed back to the client billing
          queue for correction and resubmission.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search by name or member ID"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex rounded-lg border bg-white p-1">
            {([
              ['all', `All (${rows.length})`],
              ['pending', `Pending (${awaiting.length})`],
              ['paid', `Paid (${paid.length})`],
            ] as const).map(([k, label]) => (
              <Button key={k} size="sm" variant={show === k ? 'default' : 'ghost'} onClick={() => setShow(k)}>
                {label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      {shown.length === 0 ? (
        <Card className="p-10 text-center">
          <h3 className="font-semibold">
            {query.trim() ? 'No filed claims match that search' : 'No claims in this view'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {query.trim()
              ? 'Try a different name or member ID, or clear the search.'
              : 'A claim appears here once it is marked as submitted from To bill.'}
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Client</th>
                  <th className="px-3 py-2 font-medium">MCO</th>
                  <th className="px-3 py-2 font-medium">Cycle</th>
                  <th className="px-3 py-2 font-medium">Service dates</th>
                  <th className="px-3 py-2 font-medium">Submitted</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ cycle: c, client }) => {
                  const isPaid = c.payment_status === 'Paid';
                  return (
                    <tr key={c.id} className="border-t">
                      <td className="whitespace-nowrap px-3 py-2.5 font-semibold">
                        {client.first_name} {client.last_name}
                        {c.claim_number && (
                          <span className="block text-xs font-normal text-muted-foreground">Claim {c.claim_number}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{client.insurance ?? '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">Cycle {c.cycle_number}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                        {usDate(c.cycle_start)} – {usDate(c.cycle_end)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                        {c.submitted_date ? usDate(c.submitted_date) : '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{money(c.billed_amount ?? 0)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        {isPaid ? (
                          <Chip tone="bg-green-100 text-green-800">
                            Paid{c.paid_date ? ` ${usDate(c.paid_date)}` : ''}
                          </Chip>
                        ) : (
                          <Chip tone="bg-amber-100 text-amber-900">Pending</Chip>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right">
                        {isPaid ? (
                          <Button size="sm" variant="ghost" disabled={busy === c.id} onClick={() => markPending(c)}>
                            Not paid after all
                          </Button>
                        ) : (
                          <span className="inline-flex gap-2">
                            <Button size="sm" disabled={busy === c.id} onClick={() => markPaid(c)}>
                              Mark paid
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
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default SubmittedClaims;
